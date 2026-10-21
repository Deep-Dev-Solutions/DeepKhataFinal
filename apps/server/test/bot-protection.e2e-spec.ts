import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { vi } from 'vitest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, freshSessionToken } from './setup/auth';
import { uniquePkMobile } from './helpers/phone';
import { TEST_PASSWORD } from '../../e2e/fixtures/users';
import { TURNSTILE_VERIFY_URL } from '../src/captcha/captcha';

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const GOOD = 'good-token';
const SECRET = 'turnstile-test-secret';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Bot protection part 2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const realFetch = globalThis.fetch;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let siteverify: Array<{ url: string; body: any }>;
  let siteverifyMode: 'normal' | 'network-error' | 'http-500';
  const saved: Record<string, string | undefined> = {};

  const setEnv = (k: string, v: string | undefined) => {
    if (!(k in saved)) saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  const captchaOn = () => setEnv('TURNSTILE_SECRET_KEY', SECRET);
  const captchaOff = () => setEnv('TURNSTILE_SECRET_KEY', undefined);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  beforeEach(async () => {
    siteverify = [];
    siteverifyMode = 'normal';
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : (input?.url ?? String(input));
        if (url !== TURNSTILE_VERIFY_URL) return realFetch(input, init);
        siteverify.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
        if (siteverifyMode === 'network-error') throw new TypeError('fetch failed');
        if (siteverifyMode === 'http-500') return new Response('boom', { status: 500 });
        const ok = JSON.parse(String(init?.body ?? '{}')).response === GOOD;
        return new Response(JSON.stringify({ success: ok }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    await prisma.loginAttempt.deleteMany();
    captchaOn();
    setEnv('DISPOSABLE_EMAIL_ALLOW', undefined);
    setEnv('DISPOSABLE_EMAIL_EXTRA', undefined);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /** A user with a known password who is allowed to sign in. */
  async function makeUser(opts: { verified?: boolean } = {}) {
    const email = `bot-${uniq()}@deepkhata.test`;
    const user = await prisma.user.create({
      data: { name: 'Bot Test', email, emailVerified: opts.verified ?? false },
    });
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: await bcrypt.hash(TEST_PASSWORD, 10),
      },
    });
    return { id: user.id, email };
  }

  const login = (email: string, password: string, extra: Record<string, string> = {}, body = {}) =>
    http().post('/auth/login').set(extra).send({ email, password, ...body });

  describe('Turnstile on register', () => {
    const reg = (extra: Record<string, string> = {}, body: Record<string, unknown> = {}) =>
      http()
        .post('/auth/register')
        .set(extra)
        .send({
          name: 'Reg Test',
          email: `reg-${uniq()}@deepkhata.test`,
          password: TEST_PASSWORD,
          ...body,
        });

    it('missing token -> 400 CAPTCHA_REQUIRED and no siteverify call', async () => {
      const res = await reg();
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_REQUIRED');
      expect(typeof res.body.message).toBe('string');
      expect(siteverify).toHaveLength(0);
    });

    it('invalid token -> 400 CAPTCHA_INVALID', async () => {
      const res = await reg({ 'x-captcha-response': 'bad-token' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_INVALID');
      expect(siteverify).toHaveLength(1);
    });

    it('valid token in the header proceeds and siteverify gets secret, response and remoteip', async () => {
      const res = await reg({ 'x-captcha-response': GOOD });
      expect(res.status).toBe(201);
      expect(siteverify).toHaveLength(1);
      expect(siteverify[0].body).toMatchObject({ secret: SECRET, response: GOOD });
      expect(typeof siteverify[0].body.remoteip).toBe('string');
    });

    it('valid token in the body field captchaToken proceeds too', async () => {
      const res = await reg({}, { captchaToken: GOOD });
      expect(res.status).toBe(201);
    });

    it('siteverify network error fails closed with CAPTCHA_INVALID', async () => {
      siteverifyMode = 'network-error';
      const res = await reg({ 'x-captcha-response': GOOD });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_INVALID');
    });

    it('siteverify HTTP 500 fails closed with CAPTCHA_INVALID', async () => {
      siteverifyMode = 'http-500';
      const res = await reg({ 'x-captcha-response': GOOD });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_INVALID');
    });

    it('is off when TURNSTILE_SECRET_KEY is unset (no token needed, no siteverify call)', async () => {
      captchaOff();
      const res = await reg();
      expect(res.status).toBe(201);
      expect(siteverify).toHaveLength(0);
    });
  });

  describe('Turnstile on resend verification', () => {
    it('Nest POST /auth/resend-verification: required, invalid, valid', async () => {
      const u = await makeUser();
      const token = await freshSessionToken(prisma, u.id);
      const none = await http().post('/auth/resend-verification').set(bearer(token));
      expect(none.status).toBe(400);
      expect(none.body.code).toBe('CAPTCHA_REQUIRED');

      const bad = await http()
        .post('/auth/resend-verification')
        .set(bearer(token))
        .set('x-captcha-response', 'nope');
      expect(bad.body.code).toBe('CAPTCHA_INVALID');

      const ok = await http()
        .post('/auth/resend-verification')
        .set(bearer(token))
        .set('x-captcha-response', GOOD);
      expect(ok.status).toBeLessThan(300);
      expect(ok.body.success).toBe(true);
    });

    it('Better Auth /send-verification-email needs a captcha', async () => {
      const u = await makeUser();
      const none = await http().post('/api/auth/send-verification-email').send({ email: u.email });
      expect(none.status).toBe(400);
      expect(none.body.code).toBe('CAPTCHA_REQUIRED');
      const bad = await http()
        .post('/api/auth/send-verification-email')
        .set('x-captcha-response', 'nope')
        .send({ email: u.email });
      expect(bad.body.code).toBe('CAPTCHA_INVALID');
      const ok = await http()
        .post('/api/auth/send-verification-email')
        .set('x-captcha-response', GOOD)
        .send({ email: u.email });
      expect(ok.status).toBe(200);
    });
  });

  describe('Turnstile on forgot password (Better Auth)', () => {
    const forgot = (email: string, headers: Record<string, string> = {}) =>
      http()
        .post('/api/auth/request-password-reset')
        .set(headers)
        .send({ email, redirectTo: 'http://localhost:3000/reset-password' });

    it('missing token -> 400 CAPTCHA_REQUIRED, invalid -> CAPTCHA_INVALID, valid proceeds', async () => {
      const u = await makeUser();
      const none = await forgot(u.email);
      expect(none.status).toBe(400);
      expect(none.body.code).toBe('CAPTCHA_REQUIRED');

      const bad = await forgot(u.email, { 'x-captcha-response': 'nope' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('CAPTCHA_INVALID');

      const ok = await forgot(u.email, { 'x-captcha-response': GOOD });
      expect(ok.status).toBe(200);
    });

    it('network error fails closed', async () => {
      siteverifyMode = 'network-error';
      const res = await forgot('nobody@deepkhata.test', { 'x-captcha-response': GOOD });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_INVALID');
    });

    it('is off when the secret is unset', async () => {
      captchaOff();
      const u = await makeUser();
      expect((await forgot(u.email)).status).toBe(200);
    });
  });

  describe('Turnstile on sign-in only after 3 failed attempts (Nest login)', () => {
    it('1-2 wrong passwords need no captcha; after the 3rd failure the right password needs one', async () => {
      const u = await makeUser();
      for (let i = 0; i < 3; i++) {
        const bad = await login(u.email, 'Wrong-pass-1');
        expect(bad.status).toBe(401); // never CAPTCHA_REQUIRED before the 3rd failure is on record
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedAttempts).toBe(3);

      const needs = await login(u.email, TEST_PASSWORD);
      expect(needs.status).toBe(400);
      expect(needs.body.code).toBe('CAPTCHA_REQUIRED');

      const invalid = await login(u.email, TEST_PASSWORD, { 'x-captcha-response': 'bad' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('CAPTCHA_INVALID');

      const ok = await login(u.email, TEST_PASSWORD, { 'x-captcha-response': GOOD });
      expect(ok.status).toBe(201);
      expect(typeof ok.body.accessToken).toBe('string');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedAttempts).toBe(0);

      // Counter reset: no captcha needed any more.
      expect((await login(u.email, TEST_PASSWORD)).status).toBe(201);
    });

    it('a right password within the first two failures logs in without a captcha', async () => {
      const u = await makeUser();
      await login(u.email, 'Wrong-pass-1');
      await login(u.email, 'Wrong-pass-1');
      const ok = await login(u.email, TEST_PASSWORD);
      expect(ok.status).toBe(201);
      expect(siteverify).toHaveLength(0);
    });

    it('accepts the token as body field captchaToken', async () => {
      const u = await makeUser();
      for (let i = 0; i < 3; i++) await login(u.email, 'Wrong-pass-1');
      const ok = await login(u.email, TEST_PASSWORD, {}, { captchaToken: GOOD });
      expect(ok.status).toBe(201);
    });

    it('a wrong password WITH a valid captcha is still a 401 and counts', async () => {
      const u = await makeUser();
      for (let i = 0; i < 3; i++) await login(u.email, 'Wrong-pass-1');
      const bad = await login(u.email, 'Wrong-pass-1', { 'x-captcha-response': GOOD });
      expect(bad.status).toBe(401);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedAttempts).toBe(4);
    });

    it('siteverify network error fails closed even with the right password', async () => {
      const u = await makeUser();
      for (let i = 0; i < 3; i++) await login(u.email, 'Wrong-pass-1');
      siteverifyMode = 'network-error';
      const res = await login(u.email, TEST_PASSWORD, { 'x-captcha-response': GOOD });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_INVALID');
    });

    it('unknown emails are counted by IP: the 4th probe gets the same CAPTCHA_REQUIRED as a real account', async () => {
      const ghost = `ghost-${uniq()}@deepkhata.test`;
      for (let i = 0; i < 3; i++) {
        expect((await login(ghost, 'Wrong-pass-1')).status).toBe(401);
      }
      const res = await login(ghost, 'Wrong-pass-1');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_REQUIRED');
      // Another (unknown) address from the same IP is gated too: no account-existence signal.
      const other = await login(`other-${uniq()}@deepkhata.test`, 'Wrong-pass-1');
      expect(other.body.code).toBe('CAPTCHA_REQUIRED');
    });

    it('agency-login is gated the same way', async () => {
      const ghost = `agency-ghost-${uniq()}@deepkhata.test`;
      for (let i = 0; i < 3; i++) {
        await http().post('/auth/agency-login').send({ email: ghost, password: 'Wrong-pass-1' });
      }
      const res = await http()
        .post('/auth/agency-login')
        .send({ email: ghost, password: 'Wrong-pass-1' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CAPTCHA_REQUIRED');
    });

    it('is off when the secret is unset: many failures, then the right password works', async () => {
      captchaOff();
      const u = await makeUser();
      for (let i = 0; i < 5; i++) await login(u.email, 'Wrong-pass-1');
      const ok = await login(u.email, TEST_PASSWORD);
      expect(ok.status).toBe(201);
      expect(siteverify).toHaveLength(0);
    });
  });

  describe('Turnstile on sign-in (Better Auth routes)', () => {
    const baSignIn = (email: string, password: string, headers: Record<string, string> = {}) =>
      http().post('/api/auth/sign-in/email').set(headers).send({ email, password });

    it('/sign-in/email: gated after 3 failures, valid token logs in and resets the counter', async () => {
      const u = await makeUser();
      for (let i = 0; i < 3; i++) expect((await baSignIn(u.email, 'Wrong-pass-1')).status).toBe(401);

      const needs = await baSignIn(u.email, TEST_PASSWORD);
      expect(needs.status).toBe(400);
      expect(needs.body.code).toBe('CAPTCHA_REQUIRED');

      const bad = await baSignIn(u.email, TEST_PASSWORD, { 'x-captcha-response': 'bad' });
      expect(bad.body.code).toBe('CAPTCHA_INVALID');

      const ok = await baSignIn(u.email, TEST_PASSWORD, { 'x-captcha-response': GOOD });
      expect(ok.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedAttempts).toBe(0);
      expect((await baSignIn(u.email, TEST_PASSWORD)).status).toBe(200);
    });

    it('/sign-in/username is gated the same way', async () => {
      const handle = `bot${uniq().slice(-8)}@captcha-shop`;
      const u = await makeUser();
      await prisma.user.update({
        where: { id: u.id },
        data: { username: handle, displayUsername: handle },
      });
      const signIn = (password: string, headers: Record<string, string> = {}) =>
        http().post('/api/auth/sign-in/username').set(headers).send({ username: handle, password });
      for (let i = 0; i < 3; i++) expect((await signIn('Wrong-pass-1')).status).toBe(401);
      const needs = await signIn(TEST_PASSWORD);
      expect(needs.status).toBe(400);
      expect(needs.body.code).toBe('CAPTCHA_REQUIRED');
      expect((await signIn(TEST_PASSWORD, { 'x-captcha-response': GOOD })).status).toBe(200);
    });
  });

  describe('disposable email domains', () => {
    const reg = (email: string) =>
      http().post('/auth/register').send({ name: 'Disp', email, password: TEST_PASSWORD });

    beforeEach(() => captchaOff());

    it('blocks a well-known throwaway domain with EMAIL_DOMAIN_NOT_ALLOWED', async () => {
      const res = await reg(`a-${uniq()}@mailinator.com`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    });

    it('is subdomain-aware and case-insensitive', async () => {
      const sub = await reg(`a-${uniq()}@x.y.mailinator.com`);
      expect(sub.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
      const upper = await reg(`A-${uniq()}@GuerrillaMail.COM`);
      expect(upper.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    });

    it('DISPOSABLE_EMAIL_EXTRA adds domains', async () => {
      const email = `a-${uniq()}@shady-mail.example`;
      expect((await reg(email)).status).toBe(201);
      setEnv('DISPOSABLE_EMAIL_EXTRA', 'Shady-Mail.example, other.example');
      const res = await reg(`b-${uniq()}@mail.shady-mail.example`);
      expect(res.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    });

    it('DISPOSABLE_EMAIL_ALLOW overrides the built-in list', async () => {
      setEnv('DISPOSABLE_EMAIL_ALLOW', 'mailinator.com');
      const res = await reg(`a-${uniq()}@mailinator.com`);
      expect(res.status).toBe(201);
    });

    it('a valid captcha does not bypass the disposable-domain block', async () => {
      captchaOn();
      const res = await http()
        .post('/auth/register')
        .set('x-captcha-response', GOOD)
        .send({ name: 'D', email: `a-${uniq()}@yopmail.com`, password: TEST_PASSWORD });
      expect(res.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    });
  });

  describe('one trial per phone number', () => {
    async function makeOwner() {
      const t = uniq();
      const user = await prisma.user.create({
        data: { name: `Owner ${t}`, email: `owner-${t}@trial.test`, role: 'OWNER' },
      });
      const token = await freshSessionToken(prisma, user.id);
      return { user, headers: bearer(token) };
    }
    const wizard = (phone: string, extra: Record<string, unknown> = {}) => ({
      shopName: `Trial Shop ${uniq()}`,
      city: 'Karachi',
      phone,
      branchName: 'Main',
      acceptTerms: true,
      ...extra,
    });
    const onboard = (owner: { headers: Record<string, string> }, body: object) =>
      http().post('/onboard/onboarding').set(owner.headers).send(body);
    const superAdmin = () => authHeader('superAdmin');
    const agencyBody = (phone?: string) => {
      const t = uniq();
      return {
        businessName: `Agency Trial ${t}`,
        ownerName: 'Agency Owner',
        ownerEmail: `agency-trial-${t}@trial.test`,
        ownerPassword: TEST_PASSWORD,
        ...(phone === undefined ? {} : { phone }),
      };
    };

    it('claims the phone at onboarding and stores it normalised', async () => {
      const phone = uniquePkMobile();
      const owner = await makeOwner();
      const res = await onboard(owner, wizard(phone));
      expect(res.status).toBe(201);
      const claim = await prisma.trialClaim.findUniqueOrThrow({
        where: { phoneNormalized: `+92${phone.slice(1)}` },
      });
      expect(claim.businessId).toBe(res.body.business.id);
      expect(claim.userId).toBe(owner.user.id);
    });

    it('a second onboarding with the same phone (any format) -> 409 TRIAL_ALREADY_USED and nothing is created', async () => {
      const phone = uniquePkMobile();
      const first = await makeOwner();
      expect((await onboard(first, wizard(phone))).status).toBe(201);

      const second = await makeOwner();
      const body = wizard(`+92 ${phone.slice(1, 4)} ${phone.slice(4)}`);
      const res = await onboard(second, body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TRIAL_ALREADY_USED');
      expect(res.body.message).toMatch(/agency/i);

      // Rolled back: no business, no membership, no claim row for the second attempt.
      expect(await prisma.business.count({ where: { name: body.shopName } })).toBe(0);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: second.user.id } });
      expect(after.businessId).toBeNull();
      expect(
        await prisma.trialClaim.count({ where: { phoneNormalized: `+92${phone.slice(1)}` } }),
      ).toBe(1);
      expect(await prisma.agencyTask.count({ where: { notes: { contains: body.shopName } } })).toBe(0);
    });

    it('the phone formats 0300..., +92 300 ..., 0092300..., 92300... are the same number', async () => {
      const phone = uniquePkMobile();
      const rest = phone.slice(1);
      const first = await makeOwner();
      expect((await onboard(first, wizard(`0092${rest}`))).status).toBe(201);
      for (const variant of [phone, `+92${rest}`, `92${rest}`, `(0${rest.slice(0, 3)}) ${rest.slice(3)}`]) {
        const o = await makeOwner();
        const res = await onboard(o, wizard(variant));
        expect(res.status, variant).toBe(409);
        expect(res.body.code).toBe('TRIAL_ALREADY_USED');
      }
    });

    it('nonsense phones -> 400 PHONE_INVALID', async () => {
      for (const bad of ['12345', 'abcdefghijk', '+++', '0300-12']) {
        const owner = await makeOwner();
        const res = await onboard(owner, wizard(bad));
        expect(res.status, bad).toBe(400);
        expect(res.body.code, bad).toBe('PHONE_INVALID');
      }
    });

    it('a missing phone is rejected', async () => {
      const owner = await makeOwner();
      const body: Record<string, unknown> = wizard(uniquePkMobile());
      delete body.phone;
      expect((await onboard(owner, body)).status).toBe(400);
    });

    it('two simultaneous onboardings with the same phone: exactly one succeeds', async () => {
      const phone = uniquePkMobile();
      const [a, b] = await Promise.all([makeOwner(), makeOwner()]);
      const bodyA = wizard(phone);
      const bodyB = wizard(phone);
      const [ra, rb] = await Promise.all([onboard(a, bodyA), onboard(b, bodyB)]);
      expect([ra.status, rb.status].sort()).toEqual([201, 409]);
      const loser = ra.status === 409 ? ra : rb;
      expect(loser.body.code).toBe('TRIAL_ALREADY_USED');
      const names = [bodyA.shopName, bodyB.shopName];
      expect(await prisma.business.count({ where: { name: { in: names } } })).toBe(1);
      expect(
        await prisma.trialClaim.count({ where: { phoneNormalized: `+92${phone.slice(1)}` } }),
      ).toBe(1);
    });

    it('agency onboardTenant claims the phone; a duplicate -> 409 and no user or business is created', async () => {
      const phone = uniquePkMobile();
      const ok = await http().post('/agency/onboard-tenant').set(superAdmin()).send(agencyBody(phone));
      expect(ok.status).toBe(201);
      expect(
        await prisma.trialClaim.count({
          where: { phoneNormalized: `+92${phone.slice(1)}`, businessId: ok.body.business.id },
        }),
      ).toBe(1);

      const dup = agencyBody(`+92 ${phone.slice(1)}`);
      const res = await http().post('/agency/onboard-tenant').set(superAdmin()).send(dup);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TRIAL_ALREADY_USED');
      expect(await prisma.user.count({ where: { email: dup.ownerEmail } })).toBe(0);
      expect(await prisma.business.count({ where: { name: dup.businessName } })).toBe(0);
    });

    it('the claim is shared between the wizard and the agency path', async () => {
      const phone = uniquePkMobile();
      const owner = await makeOwner();
      expect((await onboard(owner, wizard(phone))).status).toBe(201);
      const res = await http().post('/agency/onboard-tenant').set(superAdmin()).send(agencyBody(phone));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TRIAL_ALREADY_USED');
    });

    it('agency onboardTenant: invalid phone -> 400 PHONE_INVALID; no phone -> still allowed', async () => {
      const bad = await http().post('/agency/onboard-tenant').set(superAdmin()).send(agencyBody('12345'));
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('PHONE_INVALID');
      const none = await http().post('/agency/onboard-tenant').set(superAdmin()).send(agencyBody());
      expect(none.status).toBe(201);
    });
  });
});
