import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, freshSessionToken, tenants, users } from './setup/auth';

describe('View as tenant: cookie activation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  async function viewAsToken() {
    const res = await http()
      .post(`/agency/tenants/${tenants.A.id}/view-as`)
      .set(authHeader('superAdmin'));
    expect(res.status).toBe(201);
    expect(res.body.url).toBe(
      `${(process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/view-as?token=${res.body.token}`,
    );
    return res.body.token as string;
  }

  function cookieFrom(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(raw?.length).toBeGreaterThan(0);
    const line = raw!.find((c) => c.includes('session_token'));
    expect(line).toBeDefined();
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
    return line!.split(';')[0];
  }

  it('activates a view-as token into a read-only cookie session', async () => {
    const token = await viewAsToken();
    const res = await http().post('/auth/view-as/activate').send({ token });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.expiresAt).toBe('string');
    expect(typeof res.body.businessName).toBe('string');
    const cookie = cookieFrom(res);

    const me = await http().get('/user/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.id ?? me.body.user?.id).toBe(users.ownerA.id);

    const write = await http()
      .post('/customer/newcustomer')
      .set('Cookie', cookie)
      .send({ name: 'X', phone: '03001234567' });
    expect(write.status).toBe(403);
    expect(write.body.message).toBe('Read-only while viewing as tenant');

    const info = await http().get('/auth/session-info').set('Cookie', cookie);
    expect(info.status).toBe(200);
    expect(info.body.impersonated).toBe(true);
    expect(typeof info.body.impersonatedUntil).toBe('string');
    expect(typeof info.body.businessName).toBe('string');
  });

  it('a tampered cookie value does not authenticate', async () => {
    const token = await viewAsToken();
    const res = await http().post('/auth/view-as/activate').send({ token });
    const cookie = cookieFrom(res);
    const bad = cookie.replace(/=[^.%]+/, '=tampered');
    expect((await http().get('/user/me').set('Cookie', bad)).status).toBe(401);
  });

  it('rejects an expired view-as token', async () => {
    const token = await viewAsToken();
    await prisma.session.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await http().post('/auth/view-as/activate').send({ token });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('cannot be used to escalate: a normal session token is rejected', async () => {
    const normal = await freshSessionToken(prisma, users.ownerA.id);
    const res = await http().post('/auth/view-as/activate').send({ token: normal });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();

    const seeded = await http()
      .post('/auth/view-as/activate')
      .send({ token: 'test-session-superAdmin' });
    expect(seeded.status).toBe(400);
    expect(seeded.headers['set-cookie']).toBeUndefined();
  });

  it('rejects unknown tokens and missing bodies', async () => {
    expect(
      (await http().post('/auth/view-as/activate').send({ token: randomUUID() + randomUUID() })).status,
    ).toBe(400);
    expect((await http().post('/auth/view-as/activate').send({})).status).toBe(400);
  });

  it('session-info reports impersonated false for a normal session, 401 without one', async () => {
    const res = await http().get('/auth/session-info').set(authHeader('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body.impersonated).toBe(false);
    expect((await http().get('/auth/session-info')).status).toBe(401);
  });
});
