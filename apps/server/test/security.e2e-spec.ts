import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, users, tenants } from './setup/auth';
import { TEST_PASSWORD } from '../../e2e/fixtures/users';

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe('Phase 1 security regressions (e2e)', () => {
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

  async function registerUser(prefix: string) {
    const email = `${prefix}-${uniq()}@deepkhata.test`;
    const res = await http()
      .post('/auth/register')
      .send({ name: `Reg ${prefix}`, email, password: TEST_PASSWORD });
    expect(res.status).toBeLessThan(300);
    expect(typeof res.body.accessToken).toBe('string');
    return { email, id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  function onboardingBody(extra: Record<string, unknown> = {}) {
    const u = uniq();
    return {
      name: `Sec Biz ${u}`,
      slug: `sec-biz-${u}`,
      industry: 'Electronics',
      teamSize: '1-5',
      currency: 'PKR',
      phone: '03001234567',
      address: 'Test Street',
      ...extra,
    };
  }

  /** Registers a user, onboards a fresh business, then logs in for a token that carries the businessId. */
  async function newOwnerWithBusiness() {
    const reg = await registerUser('own');
    const res = await http()
      .post('/onboard/onboarding')
      .set('Authorization', `Bearer ${reg.token}`)
      .send(onboardingBody());
    expect(res.status).toBeLessThan(300);
    const login = await http()
      .post('/auth/login')
      .send({ email: reg.email, password: TEST_PASSWORD });
    expect(login.status).toBeLessThan(300);
    const dbUser = await prisma.user.findUnique({ where: { id: reg.id } });
    expect(dbUser?.businessId).toBeTruthy();
    return { ...reg, token: login.body.accessToken as string, businessId: dbUser!.businessId! };
  }

  describe('K1 hardcoded JWT secret', () => {
    it('rejects a token forged with the old default secret', async () => {
      const forged = new JwtService({}).sign(
        { id: users.ownerA.id, role: 'OWNER', businessId: tenants.A.id },
        { secret: 'hellosecretaccesstoken1122', expiresIn: '1h' },
      );
      await http()
        .get('/customer/getallcustomers')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });
  });

  describe('K2 onboarding', () => {
    it('requires authentication', async () => {
      await http().post('/onboard/onboarding').send(onboardingBody()).expect(401);
    });

    it('rejects a user that already has a business with 409', async () => {
      await http()
        .post('/onboard/onboarding')
        .set(authHeader('ownerA'))
        .send(onboardingBody())
        .expect(409);
    });

    it('binds the business to the token user and ignores a body ownerId', async () => {
      const reg = await registerUser('k2');
      const body = onboardingBody({ ownerId: users.ownerB.id });
      const res = await http()
        .post('/onboard/onboarding')
        .set('Authorization', `Bearer ${reg.token}`)
        .send(body);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      const biz = await prisma.business.findUnique({ where: { slug: body.slug } });
      expect(biz).not.toBeNull();
      const created = await prisma.user.findUnique({ where: { id: reg.id } });
      expect(created?.businessId).toBe(biz!.id);
      expect(created?.role).toBe('OWNER');
      const victim = await prisma.user.findUnique({ where: { id: users.ownerB.id } });
      expect(victim?.businessId).toBe(tenants.B.id);
    });
  });

  describe('K9 business-less users', () => {
    it('is blocked from business routes but can log out', async () => {
      const reg = await registerUser('k9');
      const res = await http()
        .get('/customer/getallcustomers')
        .set('Authorization', `Bearer ${reg.token}`)
        .expect(403);
      expect(res.body.message).toBe('Complete business onboarding first');

      const out = await http()
        .post('/auth/logout')
        .set('Authorization', `Bearer ${reg.token}`);
      expect(out.status).not.toBe(403);
      expect(out.status).toBeLessThan(300);
    });
  });

  describe('K3 team invites', () => {
    it('forbids a manager from inviting a manager', async () => {
      const email = `inv-mgr-${uniq()}@deepkhata.test`;
      await http()
        .post('/team/invite')
        .set(authHeader('managerA'))
        .send({ email, role: 'MANAGER' })
        .expect(403);
      expect(await prisma.invitation.count({ where: { email } })).toBe(0);
    });

    it('forbids inviting an OWNER', async () => {
      const email = `inv-own-${uniq()}@deepkhata.test`;
      await http()
        .post('/team/invite')
        .set(authHeader('ownerA'))
        .send({ email, role: 'OWNER' })
        .expect(403);
      expect(await prisma.invitation.count({ where: { email } })).toBe(0);
    });

    it('pins the invitation to the inviter business, ignoring a body businessId', async () => {
      const biz = await newOwnerWithBusiness();
      const email = `inv-ok-${uniq()}@deepkhata.test`;
      const res = await http()
        .post('/team/invite')
        .set('Authorization', `Bearer ${biz.token}`)
        .send({ email, role: 'STAFF', businessId: tenants.B.id });
      expect(res.status).toBeLessThan(300);
      const inv = await prisma.invitation.findFirst({ where: { email } });
      expect(inv?.businessId).toBe(biz.businessId);
      expect(inv?.businessId).not.toBe(tenants.B.id);
    });

    it('enforces the 5 account limit (users plus pending invitations)', async () => {
      const biz = await newOwnerWithBusiness();
      const count = async () =>
        (await prisma.user.count({ where: { businessId: biz.businessId } })) +
        (await prisma.invitation.count({ where: { businessId: biz.businessId } }));

      let guard = 0;
      while ((await count()) < 5 && guard++ < 10) {
        const res = await http()
          .post('/team/invite')
          .set('Authorization', `Bearer ${biz.token}`)
          .send({ email: `fill-${uniq()}@deepkhata.test`, role: 'STAFF' });
        expect(res.status).toBeLessThan(300);
      }
      expect(await count()).toBe(5);

      const over = await http()
        .post('/team/invite')
        .set('Authorization', `Bearer ${biz.token}`)
        .send({ email: `over-${uniq()}@deepkhata.test`, role: 'STAFF' });
      expect(over.status).toBeGreaterThanOrEqual(400);
      expect(over.status).toBeLessThan(500);
      expect(await count()).toBe(5);
    });
  });

  describe('K7 logout revokes the access token', () => {
    async function loginOwner() {
      const login = await http()
        .post('/auth/login')
        .send({ email: users.ownerA.email, password: TEST_PASSWORD });
      expect(login.status).toBeLessThan(300);
      const token = login.body.accessToken as string;
      expect(typeof token).toBe('string');
      return token;
    }

    it('persists a revocation row for the logged-out token', async () => {
      const token = await loginOwner();
      const jti = new JwtService({}).decode(token)?.jti as string;
      expect(jti).toBeTruthy();
      const out = await http().post('/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(out.status).toBeLessThan(300);
      expect(await prisma.revokedToken.findUnique({ where: { jti } })).not.toBeNull();
    });

    // Known bug: JwtAuthGuard on the logout request itself calls
    // TenantCacheService.isRevoked(jti), which caches "not revoked" for 5 s, and
    // AuthService.logout never invalidates that entry. The token therefore keeps
    // working for up to 5 s after logout even though the DB row exists.
    it('rejects the same token immediately after logout', async () => {
      const token = await loginOwner();
      await http().get('/customer/getallcustomers').set('Authorization', `Bearer ${token}`).expect(200);
      const out = await http().post('/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(out.status).toBeLessThan(300);
      await http().get('/customer/getallcustomers').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });

  describe('K10 x-branch-id tenant check', () => {
    it('rejects a branch of another tenant', async () => {
      const res = await http()
        .get('/dashboard/dashboarddata')
        .set(authHeader('ownerA', tenants.B.branches.mainBranch.id))
        .expect(403);
      expect(res.body.message).toBe('Invalid branch');
    });

    it('accepts an own-tenant branch', async () => {
      await http()
        .get('/dashboard/dashboarddata')
        .set(authHeader('ownerA', tenants.A.branches.hallRoad.id))
        .expect(200);
    });
  });

  describe('permission guards', () => {
    let vendorId: string;
    beforeAll(async () => {
      // Own vendor so payments here never shift seeded vendor balances used by other specs.
      const vendor = await prisma.vendor.create({
        data: { businessName: `Security Spec Vendor ${Date.now()}`, businessId: tenants.A.id },
      });
      vendorId = vendor.id;
    });

    it('lets staff read vendors', async () => {
      await http().get('/vendors').set(authHeader('staffA')).expect(200);
    });

    it('forbids staff from recording a vendor payment and writes nothing', async () => {
      const before = await prisma.vendor.findUnique({ where: { id: vendorId } });
      await http()
        .post(`/vendors/${vendorId}/payment`)
        .set(authHeader('staffA'))
        .send({ amount: 10 })
        .expect(403);
      const after = await prisma.vendor.findUnique({ where: { id: vendorId } });
      expect(after).toEqual(before);
    });

    it('does not forbid a manager from recording a vendor payment', async () => {
      const res = await http()
        .post(`/vendors/${vendorId}/payment`)
        .set(authHeader('managerA'))
        .send({ amount: 10 });
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('lets staff read the cash register status', async () => {
      await http()
        .get('/cash/register/status')
        .set(authHeader('staffA', tenants.A.branches.hallRoad.id))
        .expect(200);
    });
  });

  describe('tenant product scope', () => {
    it('refuses an order for another tenant product and creates nothing', async () => {
      const instance = await prisma.productInstance.findFirst({
        where: { status: 'AVAILABLE', product: { businessId: tenants.A.id, deletedAt: null } },
        include: { product: true },
      });
      expect(instance).not.toBeNull();
      const price = Number(instance!.product.basePrice);
      const ordersBefore = await prisma.order.count({ where: { businessId: tenants.B.id } });

      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerB', tenants.B.branches.mainBranch.id))
        .send({
          walkInName: 'Cross Tenant',
          items: [{ productId: instance!.productId, quantity: 1, price }],
          amountPaid: price,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      expect(await prisma.order.count({ where: { businessId: tenants.B.id } })).toBe(ordersBefore);
      const still = await prisma.productInstance.findUnique({ where: { id: instance!.id } });
      expect(still?.status).toBe('AVAILABLE');
    });
  });
});
