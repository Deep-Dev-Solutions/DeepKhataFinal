import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { serializeSignedCookie } from 'better-call';
import { auth } from '../src/auth/better-auth';
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

  // ---------------------------------------------------------------- exit / return

  /** A real signed session cookie pair ("name=value") for a freshly minted admin session. */
  async function adminCookie() {
    const token = await freshSessionToken(prisma, users.superAdmin.id);
    const ctx = await auth.$context;
    const line = await serializeSignedCookie(ctx.authCookies.sessionToken.name, token, ctx.secret, {});
    return { token, name: ctx.authCookies.sessionToken.name, pair: line.split(';')[0] };
  }

  function stashFrom(res: request.Response): string | undefined {
    const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const line = raw.find((c) => c.startsWith('dk_admin_return='));
    return line;
  }

  async function startVisit() {
    const admin = await adminCookie();
    const t = await http()
      .post(`/agency/tenants/${tenants.A.id}/view-as`)
      .set('Cookie', admin.pair);
    expect(t.status).toBe(201);
    const res = await http()
      .post('/auth/view-as/activate')
      .set('Cookie', admin.pair)
      .send({ token: t.body.token });
    expect(res.status).toBe(201);
    return { admin, viewToken: t.body.token as string, res, viewCookie: cookieFrom(res) };
  }

  /** A view-as session plus its signed cookie, minted without calling the (throttled) activate endpoint. */
  async function mintViewAs() {
    const t = await http()
      .post(`/agency/tenants/${tenants.A.id}/view-as`)
      .set(authHeader('superAdmin'));
    expect(t.status).toBe(201);
    const ctx = await auth.$context;
    const line = await serializeSignedCookie(
      ctx.authCookies.sessionToken.name,
      t.body.token,
      ctx.secret,
      {},
    );
    return { token: t.body.token as string, pair: line.split(';')[0] };
  }

  it('start: activation sets the view-as session cookie and a signed httpOnly stash of the admin session', async () => {
    const { admin, res, viewCookie } = await startVisit();
    const line = stashFrom(res);
    expect(line).toBeDefined();
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
    expect(line).toMatch(/Max-Age=\d+/i);
    // The raw admin token is not exposed as a usable session cookie value.
    expect(decodeURIComponent(line!.split(';')[0])).toContain(admin.token);
    expect(viewCookie.startsWith(admin.name)).toBe(true);
    expect(viewCookie).not.toBe(admin.pair);

    // The stash cookie alone does not authenticate (neither under its own name nor renamed).
    const stash = line!.split(';')[0];
    expect((await http().get('/agency/tenants').set('Cookie', stash)).status).toBe(401);
    const renamed = stash.replace('dk_admin_return=', `${admin.name}=`);
    expect((await http().get('/agency/tenants').set('Cookie', renamed)).status).toBe(401);
    expect((await http().get('/user/me').set('Cookie', renamed)).status).toBe(401);

    // An expired admin session is never restored; the view-as session still ends.
    await prisma.session.update({ where: { token: admin.token }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const out = await http().post('/auth/view-as/exit').set('Cookie', `${viewCookie}; ${stash}`);
    expect(out.status).toBe(200);
    expect(out.body.restored).toBe(false);
  });

  it('exit revokes only the view-as session and restores the admin cookie, which works on /agency/tenants again', async () => {
    const { admin, viewToken, res, viewCookie } = await startVisit();
    const stash = stashFrom(res)!.split(';')[0];

    const out = await http().post('/auth/view-as/exit').set('Cookie', `${viewCookie}; ${stash}`);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, restored: true });

    const raw = out.headers['set-cookie'] as unknown as string[];
    const stashClear = raw.find((c) => c.startsWith('dk_admin_return='))!;
    expect(stashClear).toMatch(/Max-Age=0/i);
    const restored = raw.find((c) => c.startsWith(`${admin.name}=`))!;
    expect(restored.split(';')[0]).toBe(admin.pair);
    expect(restored).toMatch(/HttpOnly/i);

    // The impersonated session is gone and its cookie is dead.
    expect(await prisma.session.findUnique({ where: { token: viewToken } })).toBeNull();
    expect((await http().get('/user/me').set('Cookie', viewCookie)).status).toBe(401);
    // The admin's own session survived and is usable with the restored cookie.
    expect(await prisma.session.findUnique({ where: { token: admin.token } })).not.toBeNull();
    const tenantsRes = await http().get('/agency/tenants').set('Cookie', restored.split(';')[0]);
    expect(tenantsRes.status).toBe(200);
    // Exiting twice does not work (the view-as session no longer exists).
    expect((await http().post('/auth/view-as/exit').set('Cookie', viewCookie)).status).toBe(401);
  });

  it('exit without a valid stash (none, tampered, forged for a tenant owner) only ends the session and signs in nothing', async () => {
    const owner = await freshSessionToken(prisma, users.ownerA.id);
    const stashes = [
      '',
      '; dk_admin_return=deadbeef.AAAA',
      `; dk_admin_return=${owner}.${'A'.repeat(43)}`,
    ];
    for (const extra of stashes) {
      const v = await mintViewAs();
      const out = await http().post('/auth/view-as/exit').set('Cookie', `${v.pair}${extra}`);
      expect(out.status).toBe(200);
      expect(out.body).toEqual({ ok: true, restored: false });
      const raw = (out.headers['set-cookie'] as unknown as string[]).filter((c) =>
        c.startsWith('better-auth.session_token='),
      );
      expect(raw.length).toBeGreaterThan(0);
      expect(raw.every((c) => /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c))).toBe(true);
      expect(await prisma.session.findUnique({ where: { token: v.token } })).toBeNull();
    }
  });

  it('a tenant user (or anonymous) cannot call exit', async () => {
    expect((await http().post('/auth/view-as/exit').set(authHeader('ownerA'))).status).toBe(403);
    expect((await http().post('/auth/view-as/exit').set(authHeader('superAdmin'))).status).toBe(403);
    expect((await http().post('/auth/view-as/exit')).status).toBe(401);
  });

  // ------------------------------------------------------------------ access log

  it('access log: one row per (session, method, route template), no self routes, blocked writes logged, VIEW_AS never pushed out', async () => {
    const t = await http().post(`/agency/tenants/${tenants.A.id}/view-as`).set(authHeader('superAdmin'));
    const viewer = { Authorization: `Bearer ${t.body.token}` };
    const since = new Date();

    for (let i = 0; i < 6; i++) {
      expect((await http().get('/customer/getallcustomers').set(viewer)).status).toBe(200);
      expect((await http().get('/user/me').set(viewer)).status).toBe(200);
      expect((await http().get('/auth/session-info').set(viewer)).status).toBe(200);
    }
    for (let i = 0; i < 2; i++) {
      expect((await http().post('/customer/newcustomer').set(viewer).send({ name: 'X', phone: '03001234567' })).status).toBe(403);
    }
    await new Promise((r) => setTimeout(r, 300));

    const rows = await prisma.adminAccessLog.findMany({
      where: { businessId: tenants.A.id, createdAt: { gte: since } },
    });
    const reads = rows.filter((r) => r.route.includes('getallcustomers'));
    expect(reads).toHaveLength(1);
    expect(reads[0].action).toBe('SUPPORT_READ');
    expect(rows.some((r) => r.route === '/user/me' || r.route.startsWith('/auth/'))).toBe(false);
    const blocked = rows.filter((r) => r.action === 'SUPPORT_WRITE_BLOCKED');
    expect(blocked).toHaveLength(2);
    expect(blocked.every((r) => r.method === 'POST' && r.route.includes('newcustomer'))).toBe(true);
    expect(rows.every((r) => r.adminId === users.superAdmin.id)).toBe(true);

    // Even with more later rows than the limit, the tenant still gets the VIEW_AS row.
    const many = Array.from({ length: 6 }, (_, i) => ({
      adminId: users.superAdmin.id,
      businessId: tenants.A.id,
      action: 'SUPPORT_READ',
      route: `/flood/${i}`,
      method: 'GET',
      createdAt: new Date(Date.now() + 1000 + i),
    }));
    await prisma.adminAccessLog.createMany({ data: many });
    const seen = await http().get('/settings/access-log?limit=3').set(authHeader('ownerA'));
    expect(seen.status).toBe(200);
    expect(seen.body).toHaveLength(3);
    expect(seen.body.some((r: { action: string }) => r.action === 'VIEW_AS')).toBe(true);
    const times = seen.body.map((r: { createdAt: string }) => new Date(r.createdAt).getTime());
    expect([...times].sort((a: number, b: number) => b - a)).toEqual(times);
  });
});
