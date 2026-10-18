import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, users, tenants } from './setup/auth';
import { TEST_PASSWORD } from '../../e2e/fixtures/users';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const FRONTEND = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SLUG = tenants.A.slug;

interface MailpitMessage {
  ID: string;
  Subject: string;
}

async function mailpitFor(address: string): Promise<MailpitMessage[]> {
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  );
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { messages?: MailpitMessage[] };
  return body.messages ?? [];
}

async function waitForMail(address: string, minCount = 1): Promise<MailpitMessage[]> {
  for (let i = 0; i < 40; i++) {
    const found = await mailpitFor(address);
    if (found.length >= minCount) return found;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No mail in Mailpit for ${address}`);
}

async function mailText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const body = (await res.json()) as { Text: string };
  return body.Text;
}

/** Newest mail for the address -> the `token` query value of the link inside it. */
async function tokenFromMail(address: string, path: string, minCount = 1): Promise<string> {
  const messages = await waitForMail(address, minCount);
  for (const m of messages) {
    const text = await mailText(m.ID);
    const match = text.match(new RegExp(`${path}\\?token=([^\\s"<>&]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  throw new Error(`No ${path} link in any mail for ${address}`);
}

describe('Accounts: signup, verification, reset, staff accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const createdUserIds: string[] = [];
  const bearer = (token: string, branchId?: string) => ({
    Authorization: `Bearer ${token}`,
    ...(branchId ? { 'x-branch-id': branchId } : {}),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds }, ownedBusinesses: { none: {} } },
    });
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  async function register(prefix: string) {
    const email = `${prefix}-${uniq()}@deepkhata.test`;
    const res = await http()
      .post('/auth/register')
      .send({ name: `Acc ${prefix}`, email, phone: '03001234567', password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
    return { email, id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  async function login(body: Record<string, string>) {
    return http().post('/auth/login').send(body);
  }

  describe('signup and email verification', () => {
    let owner: { email: string; id: string; token: string };

    it('registers, mails a verify link (EmailLog + Mailpit) and verifies', async () => {
      owner = await register('verify');
      expect(owner.token).toBeTruthy();
      const row = await prisma.user.findUnique({ where: { id: owner.id } });
      expect(row?.emailVerified).toBe(false);
      expect(row?.phone).toBe('03001234567');

      const token = await tokenFromMail(owner.email, '/verify-email');
      const log = await prisma.emailLog.findFirst({
        where: { to: owner.email, template: 'verify-email' },
      });
      expect(log).not.toBeNull();

      const text = await mailText((await mailpitFor(owner.email))[0].ID);
      expect(text).toContain(`${FRONTEND}/verify-email?token=`);

      const res = await http().get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
      expect(res.status).toBeLessThan(300);
      const after = await prisma.user.findUnique({ where: { id: owner.id } });
      expect(after?.emailVerified).toBe(true);
    });

    it('rejects a bad verification token', async () => {
      const res = await http().get('/api/auth/verify-email?token=not-a-token');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('resends verification for an unverified user only', async () => {
      const fresh = await register('resend');
      await waitForMail(fresh.email, 1);
      const res = await http()
        .post('/auth/resend-verification')
        .set(bearer(fresh.token));
      expect(res.status).toBe(201);
      await waitForMail(fresh.email, 2);
      expect(
        await prisma.emailLog.count({ where: { to: fresh.email, template: 'verify-email' } }),
      ).toBe(2);

      await http().post('/auth/resend-verification').expect(401);
      await http()
        .post('/auth/resend-verification')
        .set(authHeader('ownerA'))
        .expect(400);
    });

    it('validates the register body', async () => {
      await http()
        .post('/auth/register')
        .send({ name: 'x', email: 'not-an-email', password: TEST_PASSWORD })
        .expect(400);
      await http()
        .post('/auth/register')
        .send({ name: 'x', email: `short-${uniq()}@deepkhata.test`, password: 'short' })
        .expect(400);
    });

    it('lets an unverified owner log in but blocks team creation with EMAIL_NOT_VERIFIED', async () => {
      const u = uniq();
      const reg = await register('unverified');
      const onboard = await http()
        .post('/onboard/onboarding')
        .set(bearer(reg.token))
        .send({
          shopName: `Acc Biz ${u}`,
          slug: `acc-biz-${u}`,
          city: 'Lahore',
          branchName: 'Main Branch',
          acceptTerms: true,
          industry: 'Electronics',
          teamSize: '1-5',
          currency: 'PKR',
          phone: '03001234567',
          address: 'Test Street',
        });
      expect(onboard.status).toBeLessThan(300);
      const session = await login({ email: reg.email, password: TEST_PASSWORD });
      expect(session.status).toBeLessThan(300);
      const token = session.body.accessToken as string;

      const invite = await http()
        .post('/team/invite')
        .set(bearer(token))
        .send({ email: `inv-${uniq()}@deepkhata.test`, role: 'STAFF' });
      expect(invite.status).toBe(403);
      expect(invite.body.code).toBe('EMAIL_NOT_VERIFIED');

      const create = await http()
        .post('/team/members')
        .set(bearer(token))
        .send({ name: 'Gate', username: 'gate1', password: TEST_PASSWORD, role: 'STAFF' });
      expect(create.status).toBe(403);
      expect(create.body.code).toBe('EMAIL_NOT_VERIFIED');

      const link = await tokenFromMail(reg.email, '/verify-email');
      await http().get(`/api/auth/verify-email?token=${encodeURIComponent(link)}`).expect(200);

      const ok = await http()
        .post('/team/invite')
        .set(bearer(token))
        .send({ email: `inv-${uniq()}@deepkhata.test`, role: 'STAFF' });
      expect(ok.status).toBeLessThan(300);
    });
  });

  describe('forgot and reset password', () => {
    it('resets with the mailed link, revokes sessions, and does not enumerate emails', async () => {
      const acct = await register('reset');
      const redirectTo = `${FRONTEND}/reset-password`;

      const unknown = await http()
        .post('/api/auth/request-password-reset')
        .send({ email: `nobody-${uniq()}@deepkhata.test`, redirectTo });
      expect(unknown.status).toBe(200);

      const known = await http()
        .post('/api/auth/request-password-reset')
        .send({ email: acct.email, redirectTo });
      expect(known.status).toBe(200);
      expect(known.body).toEqual(unknown.body);

      const token = await tokenFromMail(acct.email, '/reset-password');
      expect(
        await prisma.emailLog.count({ where: { to: acct.email, template: 'password-reset' } }),
      ).toBe(1);

      // The register session works before the reset.
      const before = await http().post('/auth/resend-verification').set(bearer(acct.token));
      expect(before.status).not.toBe(401);

      const NEW_PASSWORD = 'Brand#New123';
      const reset = await http()
        .post('/api/auth/reset-password')
        .send({ newPassword: NEW_PASSWORD, token });
      expect(reset.status).toBe(200);

      expect((await login({ email: acct.email, password: TEST_PASSWORD })).status).toBe(401);
      expect((await login({ email: acct.email, password: NEW_PASSWORD })).status).toBeLessThan(300);
      await http().post('/auth/resend-verification').set(bearer(acct.token)).expect(401);

      // A reset token is single use.
      const again = await http()
        .post('/api/auth/reset-password')
        .send({ newPassword: 'Another#Pass99', token });
      expect(again.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('owner-created staff', () => {
    const handle = `till${uniq().slice(-8)}`;
    const loginUsername = `${handle}@${SLUG}`;
    let staffId: string;
    let staffToken: string;

    it('creates a staff member with a username and password', async () => {
      const res = await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({ name: 'Till Staff', username: handle, password: TEST_PASSWORD, role: 'STAFF' });
      expect(res.status).toBe(201);
      expect(res.body.loginUsername).toBe(loginUsername);
      expect(res.body.loginUrl).toBe(`${FRONTEND}/login`);
      expect(res.body.whatsappText).toContain(loginUsername);
      expect(res.body.member.username).toBe(handle);
      expect(res.body.member.role).toBe('STAFF');
      expect(res.body.member.allBranches).toBe(true);
      staffId = res.body.member.id;
      createdUserIds.push(staffId);

      const row = await prisma.user.findUnique({ where: { id: staffId } });
      expect(row?.businessId).toBe(tenants.A.id);
      expect(row?.username).toBe(loginUsername);
    });

    it('rejects a duplicate handle in the same business with 409 (case-insensitive)', async () => {
      await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({ name: 'Dup', username: handle.toUpperCase(), password: TEST_PASSWORD, role: 'STAFF' })
        .expect(409);
      await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({ name: 'Dup', username: 'counter1', password: TEST_PASSWORD, role: 'STAFF' })
        .expect(409);
    });

    it('validates the create body', async () => {
      const base = { name: 'V', username: 'valid.name', password: TEST_PASSWORD, role: 'STAFF' };
      for (const bad of [
        { username: 'ab' },
        { username: 'has space' },
        { password: 'short' },
        { role: 'OWNER' },
      ]) {
        const res = await http()
          .post('/team/members')
          .set(authHeader('ownerA'))
          .send({ ...base, ...bad });
        expect(res.status).toBe(400);
      }
    });

    it('rejects branches from another business', async () => {
      const res = await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({
          name: 'Cross',
          username: `cross${uniq().slice(-6)}`,
          password: TEST_PASSWORD,
          role: 'STAFF',
          branchIds: [tenants.B.branches.mainBranch.id],
        });
      expect(res.status).toBe(400);
    });

    it('logs in with <handle>@<slug> (any case) via the shim and Better Auth', async () => {
      const shim = await login({ username: loginUsername.toUpperCase(), password: TEST_PASSWORD });
      expect(shim.status).toBeLessThan(300);
      expect(typeof shim.body.accessToken).toBe('string');
      staffToken = shim.body.accessToken;

      const ba = await http()
        .post('/api/auth/sign-in/username')
        .send({ username: loginUsername, password: TEST_PASSWORD });
      expect(ba.status).toBe(200);
      expect(typeof ba.body.token).toBe('string');

      const me = await http().get('/user/me').set(bearer(staffToken)).expect(200);
      expect(me.body.id).toBe(staffId);

      expect((await login({ username: loginUsername, password: 'wrong-password-1' })).status).toBe(401);
    });

    it('lists members with usernames, branch access and session counts', async () => {
      const res = await http().get('/team/members').set(authHeader('ownerA')).expect(200);
      const row = res.body.find((m: { id: string }) => m.id === staffId);
      expect(row).toMatchObject({
        name: 'Till Staff',
        username: handle,
        role: 'STAFF',
        allBranches: true,
        branchIds: [],
        isOwner: false,
        deactivatedAt: null,
      });
      expect(row.activeSessions).toBeGreaterThanOrEqual(2);
      const owner = res.body.find((m: { id: string }) => m.id === users.ownerA.id);
      expect(owner.isOwner).toBe(true);
      expect(res.body.every((m: { id: string }) => m.id !== users.ownerB.id)).toBe(true);
      await http().get('/team/members').set(authHeader('staffA')).expect(403);
    });

    it('blocks tenant B from touching tenant A members (404)', async () => {
      const h = authHeader('ownerB');
      await http().patch(`/team/members/${staffId}`).set(h).send({ role: 'MANAGER' }).expect(404);
      await http()
        .post(`/team/members/${staffId}/reset-password`)
        .set(h)
        .send({ newPassword: 'Hijack#Pass123' })
        .expect(404);
      await http().post(`/team/members/${staffId}/sign-out-all`).set(h).expect(404);
      await http().post(`/team/members/${staffId}/deactivate`).set(h).expect(404);
      await http().post(`/team/members/${staffId}/reactivate`).set(h).expect(404);
      await http().get('/user/me').set(bearer(staffToken)).expect(200);
    });

    it('lets only the owner manage members; owner and self are protected', async () => {
      await http()
        .post(`/team/members/${staffId}/deactivate`)
        .set(authHeader('managerA'))
        .expect(403);
      await http()
        .post(`/team/members/${users.ownerA.id}/deactivate`)
        .set(authHeader('ownerA'))
        .expect(400);
      await http()
        .post(`/team/members/${users.managerA.id}/deactivate`)
        .set(authHeader('staffA'))
        .expect(403);
    });

    it('owner password reset ends the member sessions and replaces the password', async () => {
      const second = await login({ username: loginUsername, password: TEST_PASSWORD });
      const secondToken = second.body.accessToken as string;
      const NEW_PASSWORD = 'Counter#Fresh77';
      await http()
        .post(`/team/members/${staffId}/reset-password`)
        .set(authHeader('ownerA'))
        .send({ newPassword: 'short' })
        .expect(400);
      await http()
        .post(`/team/members/${staffId}/reset-password`)
        .set(authHeader('ownerA'))
        .send({ newPassword: NEW_PASSWORD })
        .expect(201);

      await http().get('/user/me').set(bearer(staffToken)).expect(401);
      await http().get('/user/me').set(bearer(secondToken)).expect(401);
      expect((await login({ username: loginUsername, password: TEST_PASSWORD })).status).toBe(401);
      const fresh = await login({ username: loginUsername, password: NEW_PASSWORD });
      expect(fresh.status).toBeLessThan(300);
      staffToken = fresh.body.accessToken;
    });

    it('manages the own sessions and password', async () => {
      const other = await login({ username: loginUsername, password: 'Counter#Fresh77' });
      const otherToken = other.body.accessToken as string;

      const list = await http().get('/user/sessions').set(bearer(staffToken)).expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(2);
      expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('token');

      await http()
        .post('/user/change-password')
        .set(bearer(staffToken))
        .send({ currentPassword: 'not-my-password', newPassword: 'Changed#Pass55' })
        .expect(400);
      await http()
        .post('/user/change-password')
        .set(bearer(staffToken))
        .send({ currentPassword: 'Counter#Fresh77', newPassword: 'Changed#Pass55' })
        .expect(201);
      await http().get('/user/me').set(bearer(otherToken)).expect(401);
      await http().get('/user/me').set(bearer(staffToken)).expect(200);

      const third = await login({ username: loginUsername, password: 'Changed#Pass55' });
      expect(third.status).toBeLessThan(300);
      const revoke = await http()
        .post('/user/sessions/revoke-others')
        .set(bearer(staffToken))
        .expect(201);
      expect(revoke.body.revoked).toBeGreaterThanOrEqual(1);
      await http().get('/user/me').set(bearer(third.body.accessToken)).expect(401);
      await http().get('/user/me').set(bearer(staffToken)).expect(200);
    });

    it('signs a member out of all devices', async () => {
      await http()
        .post(`/team/members/${staffId}/sign-out-all`)
        .set(authHeader('ownerA'))
        .expect(201);
      await http().get('/user/me').set(bearer(staffToken)).expect(401);
      const again = await login({ username: loginUsername, password: 'Changed#Pass55' });
      expect(again.status).toBeLessThan(300);
      staffToken = again.body.accessToken;
    });

    it('deactivation ends sessions and blocks login; reactivation restores access', async () => {
      await http().get('/user/me').set(bearer(staffToken)).expect(200);
      const off = await http()
        .post(`/team/members/${staffId}/deactivate`)
        .set(authHeader('ownerA'))
        .expect(201);
      expect(off.body.member.deactivatedAt).toBeTruthy();

      await http().get('/user/me').set(bearer(staffToken)).expect(401);
      expect((await login({ username: loginUsername, password: 'Changed#Pass55' })).status).toBe(401);

      const on = await http()
        .post(`/team/members/${staffId}/reactivate`)
        .set(authHeader('ownerA'))
        .expect(201);
      expect(on.body.member.deactivatedAt).toBeNull();
      const back = await login({ username: loginUsername, password: 'Changed#Pass55' });
      expect(back.status).toBeLessThan(300);
      await http().get('/user/me').set(bearer(back.body.accessToken)).expect(200);
    });

    it('role change through PATCH ends the member sessions', async () => {
      const s = await login({ username: loginUsername, password: 'Changed#Pass55' });
      const token = s.body.accessToken as string;
      const res = await http()
        .patch(`/team/members/${staffId}`)
        .set(authHeader('ownerA'))
        .send({ role: 'MANAGER' })
        .expect(200);
      expect(res.body.member.role).toBe('MANAGER');
      await http().get('/user/me').set(bearer(token)).expect(401);
      await http()
        .patch(`/team/members/${staffId}`)
        .set(authHeader('ownerA'))
        .send({ role: 'OWNER' })
        .expect(400);
      await http()
        .patch(`/team/members/${staffId}`)
        .set(authHeader('ownerA'))
        .send({ role: 'STAFF' })
        .expect(200);
    });
  });

  describe('branch-restricted staff', () => {
    const own = tenants.A.branches.hafeezCentre.id;
    const other = tenants.A.branches.hallRoad.id;
    const handle = `lane${uniq().slice(-8)}`;
    const loginUsername = `${handle}@${SLUG}`;
    let memberId: string;
    let token: string;

    it('is limited to the assigned branch', async () => {
      const res = await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({
          name: 'Lane Staff',
          username: handle,
          password: TEST_PASSWORD,
          role: 'STAFF',
          branchIds: [own],
        });
      expect(res.status).toBe(201);
      memberId = res.body.member.id;
      createdUserIds.push(memberId);
      expect(res.body.member.allBranches).toBe(false);
      expect(res.body.member.branchIds).toEqual([own]);

      const s = await login({ username: loginUsername, password: TEST_PASSWORD });
      expect(s.status).toBeLessThan(300);
      token = s.body.accessToken;

      const denied = await http().get('/cash/register/status').set(bearer(token, other));
      expect(denied.status).toBe(403);
      expect(denied.body.message).toBe('No access to this branch');
      await http().get('/cash/register/status').set(bearer(token, own)).expect(200);
      // An owner is never restricted.
      await http().get('/cash/register/status').set(authHeader('ownerA', other)).expect(200);
    });

    it('applies PATCH branch changes immediately', async () => {
      await http()
        .patch(`/team/members/${memberId}`)
        .set(authHeader('ownerA'))
        .send({ branchIds: [other] })
        .expect(200);
      await http().get('/cash/register/status').set(bearer(token, own)).expect(403);
      await http().get('/cash/register/status').set(bearer(token, other)).expect(200);

      await http()
        .patch(`/team/members/${memberId}`)
        .set(authHeader('ownerA'))
        .send({ allBranches: false, branchIds: [] })
        .expect(400);
      await http()
        .patch(`/team/members/${memberId}`)
        .set(authHeader('ownerA'))
        .send({ branchIds: [tenants.B.branches.mainBranch.id] })
        .expect(400);

      const open = await http()
        .patch(`/team/members/${memberId}`)
        .set(authHeader('ownerA'))
        .send({ allBranches: true })
        .expect(200);
      expect(open.body.member.branchIds).toEqual([]);
      await http().get('/cash/register/status').set(bearer(token, own)).expect(200);
    });

    it('defaults to the only assigned branch without a header, and demands a choice with several', async () => {
      const extra = await prisma.branch.create({
        data: { name: `Extra ${uniq()}`, businessId: tenants.A.id },
      });
      const mk = (from: string, to: string) =>
        prisma.stockTransferRequest.create({
          data: {
            businessId: tenants.A.id,
            fromBranchId: from,
            toBranchId: to,
            requestedById: users.ownerA.id,
          },
        });
      let ownTransfer: { id: string } | undefined;
      let farTransfer: { id: string } | undefined;
      try {
        ownTransfer = await mk(other, own);
        farTransfer = await mk(other, extra.id);

        await http()
          .patch(`/team/members/${memberId}`)
          .set(authHeader('ownerA'))
          .send({ allBranches: false, branchIds: [own] })
          .expect(200);

        // One assigned branch and no header: scoped to that branch, not everything.
        const one = await http().get('/stock-transfers').set(bearer(token));
        expect(one.status).toBe(200);
        const ids = one.body.items.map((t: { id: string }) => t.id);
        expect(ids).toContain(ownTransfer.id);
        expect(ids).not.toContain(farTransfer.id);
        // Instances need an active branch; the default supplies it.
        await http().get('/sync/pull?entity=instances').set(bearer(token)).expect(200);

        // Two assigned branches and no header: must choose.
        await http()
          .patch(`/team/members/${memberId}`)
          .set(authHeader('ownerA'))
          .send({ branchIds: [own, other] })
          .expect(200);
        const many = await http().get('/stock-transfers').set(bearer(token));
        expect(many.status).toBe(400);
        expect(many.body.message).toBe('Select a branch');
        await http().get('/stock-transfers').set(bearer(token, own)).expect(200);

        // Owners and unrestricted staff are unaffected.
        await http().get('/stock-transfers').set(authHeader('ownerA')).expect(200);
      } finally {
        await prisma.stockTransferRequest.deleteMany({
          where: { id: { in: [ownTransfer?.id, farTransfer?.id].filter(Boolean) as string[] } },
        });
        await prisma.branch.delete({ where: { id: extra.id } });
        await http()
          .patch(`/team/members/${memberId}`)
          .set(authHeader('ownerA'))
          .send({ allBranches: true });
      }
    });

    it('keeps team creation away from managers (no manage:team) and enforces the plan limit', async () => {
      // Tenant A holds 4 of 5 users here; free a seat first.
      await http()
        .post(`/team/members/${memberId}/deactivate`)
        .set(authHeader('ownerA'))
        .expect(201);

      for (const role of ['MANAGER', 'STAFF']) {
        const attempt = await http()
          .post('/team/members')
          .set(authHeader('managerA'))
          .send({ name: 'M', username: `mgr${uniq().slice(-6)}`, password: TEST_PASSWORD, role });
        expect(attempt.status).toBe(403);
      }

      const filler = await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({ name: 'Filler', username: `fill${uniq().slice(-6)}`, password: TEST_PASSWORD, role: 'STAFF' });
      expect(filler.status, JSON.stringify(filler.body)).toBe(201);
      createdUserIds.push(filler.body.member.id);

      // The plan is full again, so creating or reactivating is refused.
      const over = await http()
        .post('/team/members')
        .set(authHeader('ownerA'))
        .send({ name: 'Over', username: `over${uniq().slice(-6)}`, password: TEST_PASSWORD, role: 'STAFF' });
      expect(over.status).toBe(403);
      expect(over.body.code).toBe('PLAN_LIMIT_REACHED');
      const full = await http()
        .post(`/team/members/${memberId}/reactivate`)
        .set(authHeader('ownerA'));
      expect(full.status).toBe(403);
      expect(full.body.code).toBe('PLAN_LIMIT_REACHED');
    });
  });

  describe('invites scoped to branches', () => {
    it('stores branch ids and copies them to the accepted user', async () => {
      const own = tenants.A.branches.hallRoad.id;
      const email = `scoped-${uniq()}@deepkhata.test`;
      // Free seats: remove the staff accounts created above that still count.
      await prisma.user.updateMany({
        where: { id: { in: createdUserIds }, businessId: tenants.A.id },
        data: { deactivatedAt: new Date() },
      });

      const bad = await http()
        .post('/team/invite')
        .set(authHeader('ownerA'))
        .send({ email, role: 'STAFF', branchIds: [tenants.B.branches.mainBranch.id] });
      expect(bad.status).toBe(400);

      const res = await http()
        .post('/team/invite')
        .set(authHeader('ownerA'))
        .send({ email, role: 'STAFF', branchIds: [own] });
      expect(res.status).toBeLessThan(300);
      const inv = await prisma.invitation.findFirst({ where: { email } });
      expect(inv?.branchIds).toEqual([own]);

      const accept = await http()
        .post('/team/accept-invite')
        .send({ token: inv!.token, name: 'Scoped', password: TEST_PASSWORD });
      expect(accept.status).toBeLessThan(300);
      const userId = accept.body.user.id as string;
      createdUserIds.push(userId);
      const row = await prisma.user.findUnique({
        where: { id: userId },
        include: { branches: true },
      });
      expect(row?.allBranches).toBe(false);
      expect(row?.branches.map((b) => b.branchId)).toEqual([own]);
      expect(row?.emailVerified).toBe(true);

      const token = accept.body.accessToken as string;
      await http()
        .get('/cash/register/status')
        .set(bearer(token, tenants.A.branches.hafeezCentre.id))
        .expect(403);
      expect(
        (await login({ email, password: TEST_PASSWORD })).status,
      ).toBeLessThan(300);
    });
  });

  describe('seeded users keep logging in', () => {
    it('logs every seeded user in with TEST_PASSWORD through the shim', async () => {
      for (const u of Object.values(users)) {
        const res = await login({ email: u.email, password: TEST_PASSWORD });
        expect(res.status, u.email).toBeLessThan(300);
        expect(typeof res.body.accessToken).toBe('string');
      }
      const staff = await login({ username: 'counter1@gm-traders', password: TEST_PASSWORD });
      expect(staff.status).toBeLessThan(300);
      expect(staff.body.user.id).toBe(users.staffA.id);
    });
  });
});
