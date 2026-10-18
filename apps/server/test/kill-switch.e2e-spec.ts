import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { BusinessStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants, users } from './setup/auth';
import { TEST_PASSWORD } from '../../e2e/fixtures/users';

const BIZ_A = tenants.A.id;
const BIZ_B = tenants.B.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;
const MAIN_B = tenants.B.branches.mainBranch.id;
const READ_ONLY_MESSAGE = 'Subscription expired. System is in read-only mode.';
const letters = () =>
  Array.from({ length: 12 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const phone = () => `0311${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describe('Oversell race and tenant kill switch (e2e)', () => {
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

  describe('oversell race', () => {
    async function makeProduct(units: number) {
      const id = randomUUID();
      await prisma.product.create({
        data: { id, name: `T3 Race ${letters()}`, sku: `T3-${letters()}`, basePrice: 50, businessId: BIZ_A },
      });
      await prisma.productInstance.createMany({
        data: Array.from({ length: units }, () => ({
          id: randomUUID(),
          productId: id,
          branchId: HAFEEZ,
          status: 'AVAILABLE' as const,
        })),
      });
      return id;
    }

    function order(user: 'ownerA' | 'managerA', productId: string, tag: string) {
      return http()
        .post('/order/neworder')
        .set(authHeader(user, HAFEEZ))
        .send({
          walkInName: tag,
          items: [{ productId, quantity: 1, price: 50 }],
          amountPaid: 50,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
    }

    it.each([1, 2, 3, 4, 5])('round %i: two parallel sales of the last unit, exactly one wins', async (round) => {
      const productId = await makeProduct(1);
      const tagA = `T3 Race ${round} ${letters()}`;
      const tagB = `T3 Race ${round} ${letters()}`;

      const [a, b] = await Promise.all([order('ownerA', productId, tagA), order('managerA', productId, tagB)]);

      const statuses = [a.status, b.status];
      expect(statuses.filter((s) => s >= 200 && s < 300), `statuses ${statuses}`).toHaveLength(1);
      const loser = a.status >= 200 && a.status < 300 ? b : a;
      expect([400, 409]).toContain(loser.status);
      expect(typeof loser.body.message).toBe('string');
      const winner = a.status >= 200 && a.status < 300 ? a : b;

      // The unit is SOLD once and only the winning order references the product.
      const instances = await prisma.productInstance.findMany({ where: { productId } });
      expect(instances).toHaveLength(1);
      expect(instances[0].status).toBe('SOLD');
      const items = await prisma.orderItem.findMany({ where: { productId } });
      expect(items).toHaveLength(1);
      expect(items[0].orderId).toBe(winner.body.order.id);
      expect(await prisma.order.count({ where: { walkInName: { in: [tagA, tagB] } } })).toBe(1);
      const outMovements = await prisma.inventoryMovement.findMany({ where: { productId, direction: 'OUT' } });
      expect(outMovements).toHaveLength(1);
      expect(outMovements[0].referenceId).toBe(winner.body.order.id);

      // And exactly one balanced SALE exists for the product's orders.
      const sales = await prisma.transaction.findMany({
        where: { businessId: BIZ_A, type: 'SALE', referenceId: winner.body.order.id },
        include: { postings: true },
      });
      expect(sales).toHaveLength(1);
      expect(sales[0].postings.reduce((s, p) => s + Number(p.amount), 0)).toBe(0);
    });

    it('six parallel sales of 3 units never oversell; the losers succeed on retry until stock is gone', async () => {
      const productId = await makeProduct(3);
      const tag = `T3 RaceMulti ${letters()}`;
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => order(i % 2 ? 'ownerA' : 'managerA', productId, `${tag} ${i}`)),
      );
      const statuses = results.map((r) => r.status);
      // Only 2xx, or the documented 400 / 409 losers: no 429, no 5xx.
      expect(statuses.every((s) => (s >= 200 && s < 300) || s === 400 || s === 409), `statuses ${statuses}`).toBe(true);
      const ok = results.filter((r) => r.status >= 200 && r.status < 300);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      expect(ok.length).toBeLessThanOrEqual(3);
      // Never more orders / units sold than units existed, and they agree with each other.
      expect(await prisma.productInstance.count({ where: { productId, status: 'SOLD' } })).toBe(ok.length);
      expect(await prisma.productInstance.count({ where: { productId, status: 'AVAILABLE' } })).toBe(3 - ok.length);
      expect(await prisma.orderItem.count({ where: { productId } })).toBe(ok.length);
      expect(await prisma.order.count({ where: { walkInName: { startsWith: tag } } })).toBe(ok.length);

      // Retrying sequentially (as the 409 message tells the client) sells exactly the rest.
      for (let i = 0; i < 3 - ok.length; i += 1) {
        const retry = await order('ownerA', productId, `${tag} retry ${i}`);
        expect(retry.status).toBeLessThan(300);
      }
      expect(await prisma.productInstance.count({ where: { productId, status: 'SOLD' } })).toBe(3);
      const soldOut = await order('ownerA', productId, `${tag} soldout`);
      expect(soldOut.status).toBe(400);
      expect(await prisma.orderItem.count({ where: { productId } })).toBe(3);
    });
  });

  describe('subscription kill switch (tenant B)', () => {
    let original: { status: BusinessStatus; subscriptionExpiresAt: Date | null };

    const setStatus = (status: string) =>
      http().patch(`/agency/tenants/${BIZ_B}/status`).set(authHeader('superAdmin')).send({ status });
    const ownerBGet = () => http().get('/customer/getallcustomers').set(authHeader('ownerB', MAIN_B));
    const ownerBWrite = (tag = letters()) =>
      http()
        .post('/customer/newcustomer')
        .set(authHeader('ownerB', MAIN_B))
        .send({ name: `T3 KS ${tag}`, phone: phone() });

    beforeAll(async () => {
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } });
      original = { status: biz.status, subscriptionExpiresAt: biz.subscriptionExpiresAt };
      expect(biz.status).toBe('ACTIVE');
    });

    afterAll(async () => {
      // Put tenant B back exactly as it was and flush the in-process status cache via the API.
      await prisma.business.update({
        where: { id: BIZ_B },
        data: { subscriptionExpiresAt: original.subscriptionExpiresAt },
      });
      await setStatus(original.status);
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } });
      expect(biz.status).toBe(original.status);
      expect(biz.subscriptionExpiresAt?.getTime() ?? null).toBe(original.subscriptionExpiresAt?.getTime() ?? null);
    });

    it('only the super admin can change tenant status', async () => {
      for (const user of ['ownerA', 'ownerB', 'managerA', 'staffA'] as const) {
        await http()
          .patch(`/agency/tenants/${BIZ_B}/status`)
          .set(authHeader(user))
          .send({ status: 'SUSPENDED' })
          .expect(403);
      }
      await http().patch(`/agency/tenants/${BIZ_B}/status`).send({ status: 'SUSPENDED' }).expect(401);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } })).status).toBe('ACTIVE');
    });

    it('rejects an invalid status and an unknown tenant without changing anything', async () => {
      const bad = await setStatus('BANANA');
      expect(bad.status).toBe(400);
      const missing = await http()
        .patch(`/agency/tenants/${randomUUID()}/status`)
        .set(authHeader('superAdmin'))
        .send({ status: 'READ_ONLY' });
      expect(missing.status).toBe(404);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } })).status).toBe('ACTIVE');
    });

    it('ACTIVE tenant reads and writes', async () => {
      await ownerBGet().expect(200);
      const w = await ownerBWrite();
      expect(w.status).toBeLessThan(300);
    });

    it('READ_ONLY blocks writes at once (cache invalidated) but keeps reads and logout', async () => {
      // Warm the 60 s status cache with the ACTIVE state first.
      await ownerBGet().expect(200);
      expect((await ownerBWrite()).status).toBeLessThan(300);

      const set = await setStatus('READ_ONLY');
      expect(set.status).toBeLessThan(300);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } })).status).toBe('READ_ONLY');

      await ownerBGet().expect(200);
      const customersBefore = await prisma.customer.count({ where: { businessId: BIZ_B } });
      const blocked = await ownerBWrite();
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toBe(READ_ONLY_MESSAGE);
      expect(await prisma.customer.count({ where: { businessId: BIZ_B } })).toBe(customersBefore);

      // PUT/PATCH/DELETE are blocked as well.
      const anyCustomer = await prisma.customer.findFirstOrThrow({ where: { businessId: BIZ_B } });
      const put = await http()
        .put(`/customer/customerdetails/${anyCustomer.id}`)
        .set(authHeader('ownerB', MAIN_B))
        .send({ name: 'Renamed By Blocked Write' });
      expect(put.status).toBe(403);
      expect(put.body.message).toBe(READ_ONLY_MESSAGE);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: anyCustomer.id } })).name).toBe(anyCustomer.name);

      const out = await http().post('/auth/logout').set(authHeader('ownerB', MAIN_B));
      expect(out.status).toBeLessThan(300);
    });

    it('the read-only state of B does not affect tenant A', async () => {
      const w = await http()
        .post('/customer/newcustomer')
        .set(authHeader('ownerA', HAFEEZ))
        .send({ name: `T3 KS A ${letters()}`, phone: phone() });
      expect(w.status).toBeLessThan(300);
      await http().get('/customer/getallcustomers').set(authHeader('ownerA', HAFEEZ)).expect(200);
    });

    it('SUSPENDED blocks even reads, and login', async () => {
      await setStatus('SUSPENDED').expect((r) => expect(r.status).toBeLessThan(300));
      const read = await ownerBGet();
      expect(read.status).toBe(403);
      expect(read.body.message).toMatch(/^Account suspended/);
      const write = await ownerBWrite();
      expect(write.status).toBe(403);
      expect(write.body.message).toMatch(/^Account suspended/);

      const login = await http().post('/auth/login').send({ email: users.ownerB.email, password: TEST_PASSWORD });
      expect(login.status).toBe(401);
      expect(login.body.message).toMatch(/^Account suspended/);
      expect(login.body.accessToken).toBeUndefined();
    });

    it('restoring ACTIVE re-enables writes immediately', async () => {
      await setStatus('ACTIVE').expect((r) => expect(r.status).toBeLessThan(300));
      await ownerBGet().expect(200);
      const before = await prisma.customer.count({ where: { businessId: BIZ_B } });
      const w = await ownerBWrite();
      expect(w.status).toBeLessThan(300);
      expect(await prisma.customer.count({ where: { businessId: BIZ_B } })).toBe(before + 1);
      const login = await http().post('/auth/login').send({ email: users.ownerB.email, password: TEST_PASSWORD });
      expect(login.status).toBeLessThan(300);
    });

    it('an expired subscription is read-only even while status is ACTIVE; renewing reactivates at once', async () => {
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      // Billing with a past date records the payment but leaves the tenant expired.
      const expired = await http()
        .post(`/agency/tenants/${BIZ_B}/billing`)
        .set(authHeader('superAdmin'))
        .send({ amount: 100, paymentDate: yesterday.toISOString(), notes: 't3 expiry' });
      expect(expired.status).toBeLessThan(300);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } })).status).toBe('ACTIVE');

      await ownerBGet().expect(200);
      const blocked = await ownerBWrite();
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toBe(READ_ONLY_MESSAGE);

      const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      const renew = await http()
        .post(`/agency/tenants/${BIZ_B}/billing`)
        .set(authHeader('superAdmin'))
        .send({ amount: 100, paymentDate: nextYear.toISOString(), notes: 't3 renewal' });
      expect(renew.status).toBeLessThan(300);
      const w = await ownerBWrite();
      expect(w.status).toBeLessThan(300);
      expect(
        await prisma.agencyBillingLog.count({ where: { businessId: BIZ_B, notes: { in: ['t3 expiry', 't3 renewal'] } } }),
      ).toBe(2);
    });

    it('renewal also lifts SUSPENDED', async () => {
      await setStatus('SUSPENDED').expect((r) => expect(r.status).toBeLessThan(300));
      await ownerBGet().expect(403);
      const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      await http()
        .post(`/agency/tenants/${BIZ_B}/billing`)
        .set(authHeader('superAdmin'))
        .send({ amount: 50, paymentDate: nextYear.toISOString(), notes: 't3 unsuspend' })
        .expect((r) => expect(r.status).toBeLessThan(300));
      await ownerBGet().expect(200);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: BIZ_B } })).status).toBe('ACTIVE');
    });
  });
});
