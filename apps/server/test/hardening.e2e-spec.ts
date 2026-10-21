import { vi } from 'vitest';

// Better Auth reads its rate-limit config when better-auth.ts is first imported,
// so the env must be set before any import below (vi.hoisted runs first).
const savedEnv = vi.hoisted(() => {
  const keys = [
    'THROTTLE_LIMIT',
    'THROTTLE_TTL_MS',
    'THROTTLE_AUTH_LIMIT',
    'THROTTLE_PUBLIC_LIMIT',
    'THROTTLE_FORCE',
    'TRUST_PROXY',
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];
  process.env.THROTTLE_FORCE = '1';
  process.env.THROTTLE_AUTH_LIMIT = '3';
  process.env.THROTTLE_PUBLIC_LIMIT = '4';
  process.env.THROTTLE_LIMIT = '8';
  process.env.THROTTLE_TTL_MS = '60000';
  return saved;
});

import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import http from 'node:http';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader } from './setup/auth';
import {
  BODY_LIMIT_DEFAULT,
  BODY_LIMIT_LARGE,
  BODY_LIMIT_SMALL,
  bodyLimitFor,
} from '../src/auth/mount-auth';
import { UPLOAD_LIMITS } from '../src/utils/cloudinary.storage';

/** Test-only: reports the IP Express resolved for the request (what the throttler tracks). */
@SkipThrottle()
@Controller('__test-ip')
class IpEchoController {
  @Get()
  ip(@Req() req: { ip: string }) {
    return { ip: req.ip };
  }
}

let ipCounter = 10;
/** A fresh documentation-range IP, so every test starts with empty buckets. */
const freshIp = () => `203.0.113.${++ipCounter}`;

const OVERSIZE = (kb: number) => ({ blob: 'a'.repeat(kb * 1024) });

describe('Bot hardening (e2e)', () => {
  let trusted: INestApplication; // TRUST_PROXY=loopback: supertest peer is trusted
  let untrusted: INestApplication; // TRUST_PROXY=172.16.0.0/12: supertest peer is not
  let roomy: INestApplication; // high throttle limits, for body-size tests

  const T = () => request(trusted.getHttpServer());
  const U = () => request(untrusted.getHttpServer());
  const R = () => request(roomy.getHttpServer());

  beforeAll(async () => {
    process.env.TRUST_PROXY = 'loopback';
    trusted = await createTestApp({ controllers: [IpEchoController] });

    process.env.TRUST_PROXY = '172.16.0.0/12';
    untrusted = await createTestApp({ controllers: [IpEchoController] });

    process.env.TRUST_PROXY = 'loopback';
    const low = {
      THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
      THROTTLE_AUTH_LIMIT: process.env.THROTTLE_AUTH_LIMIT,
      THROTTLE_PUBLIC_LIMIT: process.env.THROTTLE_PUBLIC_LIMIT,
    };
    process.env.THROTTLE_LIMIT = '100000';
    process.env.THROTTLE_AUTH_LIMIT = '100000';
    process.env.THROTTLE_PUBLIC_LIMIT = '100000';
    roomy = await createTestApp();
    Object.assign(process.env, low);
  });

  afterAll(async () => {
    await closeTestApp(trusted);
    await closeTestApp(untrusted);
    await closeTestApp(roomy);
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe('real client IP behind a proxy', () => {
    it('ignores a spoofed X-Forwarded-For from an untrusted peer', async () => {
      const res = await U().get('/__test-ip').set('X-Forwarded-For', '198.51.100.77');
      expect(res.status).toBe(200);
      expect(res.body.ip).not.toBe('198.51.100.77');
      expect(res.body.ip).toMatch(/127\.0\.0\.1$/);
    });

    it('honours X-Forwarded-For from a trusted proxy peer', async () => {
      const res = await T().get('/__test-ip').set('X-Forwarded-For', '198.51.100.77');
      expect(res.body.ip).toBe('198.51.100.77');
    });

    it('takes the client from the right-most untrusted hop of a forwarded chain', async () => {
      const res = await T()
        .get('/__test-ip')
        .set('X-Forwarded-For', '6.6.6.6, 198.51.100.78');
      expect(res.body.ip).toBe('198.51.100.78');
    });
  });

  describe('credential endpoints use the strict "auth" throttler (3 per minute here)', () => {
    const routes: Array<[string, string]> = [
      ['POST', '/auth/login'],
      ['POST', '/auth/register'],
      ['POST', '/auth/agency-login'],
      ['POST', '/auth/resend-verification'],
      ['POST', '/user/change-password'],
    ];

    it.each(routes)('%s %s: the 4th request from one IP is 429 with Retry-After', async (_m, path) => {
      const ip = freshIp();
      for (let i = 0; i < 3; i++) {
        const ok = await T().post(path).set('X-Forwarded-For', ip).send({});
        expect(ok.status).not.toBe(429);
      }
      const blocked = await T().post(path).set('X-Forwarded-For', ip).send({});
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.body.statusCode).toBe(429);

      // Another visitor is unaffected.
      const other = await T().post(path).set('X-Forwarded-For', freshIp()).send({});
      expect(other.status).not.toBe(429);
    });

    it('does not apply the strict limit to ordinary routes', async () => {
      const ip = freshIp();
      for (let i = 0; i < 5; i++) {
        const res = await T().get('/user/sessions').set(authHeader('ownerA')).set('X-Forwarded-For', ip);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('unauthenticated token routes use the "public" throttler (4 per minute here)', () => {
    const routes: Array<['get' | 'post', string]> = [
      ['get', '/team/invite/not-a-real-token'],
      ['post', '/team/join'],
      ['post', '/team/accept-invite'],
      ['get', '/public/invoices/not-a-real-token'],
      ['get', '/public/invoices/not-a-real-token/pdf'],
      ['get', '/order/public/invoice/not-a-real-id'],
    ];

    it.each(routes)('%s %s: the 5th request from one IP is 429', async (method, path) => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) {
        const ok = await T()[method](path).set('X-Forwarded-For', ip).send({});
        expect(ok.status).not.toBe(429);
      }
      const blocked = await T()[method](path).set('X-Forwarded-For', ip).send({});
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    });
  });

  describe('global limit', () => {
    it('429s an ordinary authenticated route after the global limit (8 here)', async () => {
      const ip = freshIp();
      for (let i = 0; i < 8; i++) {
        const res = await T().get('/user/sessions').set(authHeader('ownerA')).set('X-Forwarded-For', ip);
        expect(res.status).toBe(200);
      }
      const blocked = await T().get('/user/sessions').set(authHeader('ownerA')).set('X-Forwarded-For', ip);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    });

    it('never throttles /health or /', async () => {
      const ip = freshIp();
      for (let i = 0; i < 25; i++) {
        const res = await T().get('/health').set('X-Forwarded-For', ip);
        expect(res.status).toBe(200);
      }
      for (let i = 0; i < 25; i++) {
        const res = await T().get('/').set('X-Forwarded-For', ip);
        expect(res.status).toBe(200);
      }
    });

    it('keeps the method-level view-as override (20 per minute) and does not count requests twice', async () => {
      const ip = freshIp();
      // The global default here is 8; the @Throttle override must win. If a
      // second ThrottlerGuard also counted the route, the 11th call would 429.
      for (let i = 0; i < 20; i++) {
        const res = await T().post('/auth/view-as/exit').set('X-Forwarded-For', ip).send({});
        expect(res.status).not.toBe(429);
      }
      const blocked = await T().post('/auth/view-as/exit').set('X-Forwarded-For', ip).send({});
      expect(blocked.status).toBe(429);
    });
  });

  describe('spoofing X-Forwarded-For cannot dodge a limit', () => {
    it('untrusted peer: rotating X-Forwarded-For still hits the auth limit', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await U().post('/auth/login').set('X-Forwarded-For', freshIp()).send({});
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
      expect(statuses[3]).toBe(429);
    });

    it('untrusted peer: rotating X-Forwarded-For still hits a public limit', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await U().get('/public/invoices/tok').set('X-Forwarded-For', freshIp());
        statuses.push(res.status);
      }
      expect(statuses[4]).toBe(429);
    });
  });

  describe('Better Auth /api/auth/* limiter', () => {
    it('429s sign-in after the limit (3 per minute here), keyed on the proxy-aware IP', async () => {
      const ip = freshIp();
      const body = { email: `nobody-${ip}@deepkhata.test`, password: 'Wrong-pass-1' };
      for (let i = 0; i < 3; i++) {
        const res = await T().post('/api/auth/sign-in/email').set('X-Forwarded-For', ip).send(body);
        expect(res.status).not.toBe(429);
      }
      const blocked = await T().post('/api/auth/sign-in/email').set('X-Forwarded-For', ip).send(body);
      expect(blocked.status).toBe(429);

      const other = await T()
        .post('/api/auth/sign-in/email')
        .set('X-Forwarded-For', freshIp())
        .send(body);
      expect(other.status).not.toBe(429);
    });

    it('429s sign-in/username too', async () => {
      const ip = freshIp();
      const body = { username: 'ghost@nowhere', password: 'Wrong-pass-1' };
      for (let i = 0; i < 3; i++) {
        const res = await T().post('/api/auth/sign-in/username').set('X-Forwarded-For', ip).send(body);
        expect(res.status).not.toBe(429);
      }
      const blocked = await T().post('/api/auth/sign-in/username').set('X-Forwarded-For', ip).send(body);
      expect(blocked.status).toBe(429);
    });

    it.each(['/api/auth/forget-password', '/api/auth/reset-password', '/api/auth/send-verification-email'])(
      '%s allows 1 per minute (half the sign-in limit, floored) then 429s',
      async (path) => {
        const ip = freshIp();
        const first = await T().post(path).set('X-Forwarded-For', ip).send({ email: 'x@deepkhata.test' });
        expect(first.status).not.toBe(429);
        const second = await T().post(path).set('X-Forwarded-For', ip).send({ email: 'x@deepkhata.test' });
        expect(second.status).toBe(429);
      },
    );

    it('untrusted peer: spoofed X-Forwarded-For cannot dodge the sign-in limit', async () => {
      const body = { email: 'nobody-spoof@deepkhata.test', password: 'Wrong-pass-1' };
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await U().post('/api/auth/sign-in/email').set('X-Forwarded-For', freshIp()).send(body);
        statuses.push(res.status);
      }
      expect(statuses[3]).toBe(429);
    });
  });

  describe('explicit request body limits', () => {
    it('exports the limits by path', () => {
      expect(BODY_LIMIT_DEFAULT).toBe('100kb');
      expect(BODY_LIMIT_SMALL).toBe('16kb');
      expect(BODY_LIMIT_LARGE).toBe('2mb');
      expect(bodyLimitFor('/order/neworder')).toBe('100kb');
      expect(bodyLimitFor('/auth/login')).toBe('16kb');
      expect(bodyLimitFor('/api/auth/sign-in/email')).toBe('16kb');
      expect(bodyLimitFor('/team/join')).toBe('16kb');
      expect(bodyLimitFor('/public/invoices/x')).toBe('16kb');
      expect(bodyLimitFor('/sync/batch')).toBe('2mb');
      expect(bodyLimitFor('/product/import')).toBe('2mb');
      expect(bodyLimitFor('/product/bulk-restock')).toBe('2mb');
      expect(bodyLimitFor('/authority')).toBe('100kb');
    });

    it('413s 101kb JSON on a normal route with the standard JSON error body', async () => {
      const res = await R().post('/order/neworder').set(authHeader('ownerA')).send(OVERSIZE(101));
      expect(res.status).toBe(413);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        statusCode: 413,
        message: 'Payload too large',
        error: 'Payload Too Large',
      });
    });

    it('still accepts a 50kb JSON body on a normal route (it reaches the handler)', async () => {
      const res = await R().post('/order/neworder').set(authHeader('ownerA')).send(OVERSIZE(50));
      expect(res.status).not.toBe(413);
    });

    it('413s 17kb JSON on /auth/login but accepts small and 15kb bodies', async () => {
      const big = await R().post('/auth/login').send(OVERSIZE(17));
      expect(big.status).toBe(413);
      expect(big.body.statusCode).toBe(413);
      const mid = await R().post('/auth/login').send(OVERSIZE(15));
      expect(mid.status).not.toBe(413);
      const small = await R().post('/auth/login').send({ email: 'a@b.co', password: 'x' });
      expect(small.status).not.toBe(413);
    });

    it('413s 17kb on /team/join, /public and Better Auth sign-in', async () => {
      for (const path of ['/team/join', '/team/accept-invite', '/api/auth/sign-in/email']) {
        const res = await R().post(path).send(OVERSIZE(17));
        expect(res.status).toBe(413);
        expect(res.body.statusCode).toBe(413);
      }
    });

    it('413s a chunked Better Auth body with no declared length', async () => {
      await roomy.listen(0);
      const { port } = roomy.getHttpServer().address() as { port: number };
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/api/auth/sign-in/email',
            headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.write('{"email":"a@b.co",');
        req.end('"password":"x"}');
      });
      expect(status).toBe(413);
    });

    it('/sync/batch: 1.5mb passes body parsing, 2.5mb is 413', async () => {
      const ok = await R()
        .post('/sync/batch')
        .set(authHeader('ownerA'))
        .send({ items: [], pad: 'a'.repeat(1.5 * 1024 * 1024) });
      expect(ok.status).not.toBe(413);
      const big = await R()
        .post('/sync/batch')
        .set(authHeader('ownerA'))
        .send({ items: [], pad: 'a'.repeat(2.5 * 1024 * 1024) });
      expect(big.status).toBe(413);
      expect(big.body.statusCode).toBe(413);
    });

    it('/product/import: 1.5mb passes body parsing, 2.5mb is 413', async () => {
      const ok = await R()
        .post('/product/import')
        .set(authHeader('ownerA'))
        .send({ rows: [], pad: 'a'.repeat(1.5 * 1024 * 1024) });
      expect(ok.status).not.toBe(413);
      const big = await R()
        .post('/product/import')
        .set(authHeader('ownerA'))
        .send({ rows: [], pad: 'a'.repeat(2.5 * 1024 * 1024) });
      expect(big.status).toBe(413);
    });

    it('/product/bulk-restock: 2.5mb is 413', async () => {
      const res = await R()
        .post('/product/bulk-restock')
        .set(authHeader('ownerA'))
        .send({ items: [], pad: 'a'.repeat(2.5 * 1024 * 1024) });
      expect(res.status).toBe(413);
    });

    it('sets an explicit multer file size limit on uploads and rejects an oversized photo', async () => {
      expect(UPLOAD_LIMITS.fileSize).toBe(5 * 1024 * 1024);
      const res = await R()
        .post('/product/instances/does-not-exist/photo')
        .set(authHeader('ownerA'))
        .attach('photo', Buffer.alloc(UPLOAD_LIMITS.fileSize + 1024, 1), 'big.png');
      expect(res.status).toBe(413);
    });
  });
});
