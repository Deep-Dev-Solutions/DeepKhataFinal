import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants, users } from './setup/auth';
import { UsageRollupService } from '../src/analytics/usage-rollup.service';

const rand = () => randomUUID().slice(0, 8);
const D = Prisma.Decimal;

/** Instant for a Karachi (UTC+5) wall-clock time. */
const karachi = (date: string, time = '12:00:00') => new Date(`${date}T${time}+05:00`);
const dateOnly = (date: string) => new Date(`${date}T00:00:00.000Z`);

describe('Tenant analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let rollup: UsageRollupService;
  const http = () => request(app.getHttpServer());
  const admin = () => authHeader('superAdmin');
  let planId: string;
  let monthlyPlanId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    rollup = app.get(UsageRollupService);
    const tag = rand();
    planId = (
      await prisma.plan.create({
        data: {
          code: `ANL-${tag}`,
          name: 'Analytics Test',
          priceMonthly: '2000.00',
          priceYearly: '12000.00',
          maxUsers: 10,
          maxProducts: 100,
          maxBranches: 3,
          features: { gmvThreshold: 100000 },
          isPublic: false,
        },
      })
    ).id;
    monthlyPlanId = planId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  async function makeTenant(
    opts: { createdAt?: Date; status?: 'TRIALING' | 'ACTIVE' | 'PAST_DUE'; plan?: string; billingCycle?: 'MONTHLY' | 'YEARLY' } = {},
  ) {
    const tag = rand();
    const owner = await prisma.user.create({
      data: { name: `Owner ${tag}`, email: `owner-${tag}@analytics.test`, role: 'OWNER' },
    });
    const business = await prisma.business.create({
      data: {
        name: `Analytics ${tag}`,
        slug: `analytics-${tag}`,
        ownerId: owner.id,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { businessId: business.id } });
    const branch = await prisma.branch.create({
      data: { name: 'Main', businessId: business.id },
    });
    const sub = await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: opts.plan ?? planId,
        status: opts.status ?? 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
        billingCycle: opts.billingCycle ?? 'MONTHLY',
        ...(opts.status === 'TRIALING'
          ? { trialEndsAt: new Date(Date.now() + 5 * 86_400_000) }
          : {}),
      },
    });
    return { owner, businessId: business.id, branchId: branch.id, subId: sub.id };
  }

  // ------------------------------------------------------------------ rollup

  describe('UsageRollupService', () => {
    const DAY = '2026-02-10';
    let t: Awaited<ReturnType<typeof makeTenant>>;
    let member: { id: string };

    async function order(
      status: 'FINAL' | 'COMPLETED' | 'MEMO',
      total: string,
      at: Date,
      paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID',
      items: { qty: number; productId?: string }[],
    ) {
      return prisma.order.create({
        data: {
          businessId: t.businessId,
          branchId: t.branchId,
          status,
          paymentStatus,
          totalAmount: total,
          createdBy: t.owner.id,
          createdAt: at,
          items: {
            create: items.map((i) => ({
              quantity: i.qty,
              price: '10.00',
              ...(i.productId
                ? { productId: i.productId }
                : { isService: true, serviceName: 'Service' }),
            })),
          },
        },
      });
    }

    const pay = (orderId: string, amount: string, at: Date) =>
      prisma.payment.create({
        data: { orderId, amount, method: 'CASH', receivedBy: t.owner.id, createdAt: at },
      });

    beforeAll(async () => {
      t = await makeTenant();
      member = await prisma.user.create({
        data: {
          name: 'Member',
          email: `member-${rand()}@analytics.test`,
          role: 'STAFF',
          businessId: t.businessId,
        },
      });

      const p1 = await prisma.product.create({
        data: {
          name: 'Old product', sku: `OLD-${rand()}`, basePrice: '10.00',
          businessId: t.businessId,
        },
      });
      const p2 = await prisma.product.create({
        data: {
          name: 'New product', sku: `NEW-${rand()}`, basePrice: '10.00',
          businessId: t.businessId,
        },
      });
      // Product has no createdAt: the rollup counts INITIAL_STOCK movements.
      const initialStock = (productId: string, at: Date) =>
        prisma.inventoryMovement.create({
          data: {
            productId, quantity: 5, direction: 'IN', referenceType: 'INITIAL_STOCK',
            userId: t.owner.id, businessId: t.businessId, createdAt: at,
          },
        });
      await initialStock(p1.id, karachi('2026-01-31'));
      await initialStock(p2.id, karachi(DAY, '09:00:00'));

      const o1 = await order('FINAL', '1000.00', karachi(DAY, '08:00:00'), 'PARTIAL', [
        { qty: 2, productId: p1.id }, { qty: 3 },
      ]);
      const o2 = await order('COMPLETED', '500.50', karachi(DAY, '12:00:00'), 'PAID', [{ qty: 1 }]);
      await order('MEMO', '300.00', karachi(DAY, '13:00:00'), 'UNPAID', [{ qty: 7 }]);
      const o4 = await order('FINAL', '200.00', karachi(DAY, '23:30:00'), 'PAID', [{ qty: 4 }]);
      // Next Karachi day by 30 minutes, and previous Karachi day by one minute.
      await order('FINAL', '999.00', karachi('2026-02-11', '00:30:00'), 'UNPAID', [{ qty: 9 }]);
      await order('FINAL', '100.00', karachi('2026-02-09', '23:59:00'), 'UNPAID', [{ qty: 1 }]);

      await pay(o1.id, '400.00', karachi(DAY, '08:30:00'));
      await pay(o1.id, '100.00', karachi('2026-02-11', '09:00:00')); // after the day: not in dues-as-of
      await pay(o2.id, '500.50', karachi(DAY, '12:05:00'));
      await pay(o4.id, '200.00', karachi(DAY, '23:31:00'));

      for (const [i, at] of [karachi(DAY, '10:00:00'), karachi(DAY, '16:00:00'), karachi('2026-02-11', '10:00:00')].entries()) {
        await prisma.customer.create({
          data: { name: `C${i}`, phone: `0300000000${i}`, businessId: t.businessId, createdAt: at },
        });
      }

      const sess = (userId: string, at: Date, impersonatedBy?: string) =>
        prisma.session.create({
          data: {
            id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000),
            createdAt: at, updatedAt: at, impersonatedBy: impersonatedBy ?? null,
          },
        });
      await sess(t.owner.id, karachi(DAY, '09:00:00'));
      await sess(t.owner.id, karachi(DAY, '15:00:00'));
      await sess(member.id, karachi(DAY, '11:00:00'));
      await sess(t.owner.id, karachi(DAY, '17:00:00'), users.superAdmin.id); // support session
      await sess(t.owner.id, karachi('2026-02-11', '09:00:00'));

      // Returns: one on the day, one the next day.
      for (const at of [karachi(DAY, '14:00:00'), karachi('2026-02-11', '14:00:00')]) {
        await prisma.transaction.create({
          data: {
            businessId: t.businessId,
            type: 'RETURN',
            referenceId: `RET-${rand()}`,
            createdAt: at,
            postings: {
              create: [
                { accountId: 'REVENUE', accountType: 'REVENUE', amount: '100.00' },
                { accountId: 'CASH', accountType: 'ASSET', amount: '-100.00' },
              ],
            },
          },
        });
      }

      // Khata: receivable 500 with 200 settled (open 300), payable 250, one created after the day.
      const khata = (direction: 'RECEIVABLE' | 'PAYABLE', amount: string, settled: string, at: Date) =>
        prisma.khataEntry.create({
          data: {
            businessId: t.businessId, direction, partyType: 'OTHER', partyName: 'Party',
            amount, settledAmount: settled, status: settled === '0' ? 'OPEN' : 'PARTIAL',
            dueDate: new Date(), createdById: t.owner.id, createdAt: at,
          },
        });
      await khata('RECEIVABLE', '500.00', '200.00', karachi('2026-02-05'));
      await khata('PAYABLE', '250.00', '0', karachi('2026-02-05'));
      await khata('RECEIVABLE', '777.00', '0', karachi('2026-02-12'));

      // Vendor payable: purchase 1000, paid 400 on the day -> open 600.
      const vendor = await prisma.vendor.create({
        data: { businessName: 'Vendor', businessId: t.businessId },
      });
      const ledger = (type: string, amounts: [string, string], at: Date) =>
        prisma.transaction.create({
          data: {
            businessId: t.businessId, type, createdAt: at,
            postings: {
              create: [
                { accountId: vendor.id, accountType: 'VENDOR_PAYABLE', amount: amounts[0] },
                { accountId: 'INVENTORY', accountType: 'ASSET', amount: amounts[1] },
              ],
            },
          },
        });
      await ledger('VENDOR_PURCHASE', ['-1000.00', '1000.00'], karachi('2026-02-07'));
      await ledger('VENDOR_PAYMENT', ['400.00', '-400.00'], karachi(DAY, '18:00:00'));
    });

    it('computeDay equals the direct counts for a fixed Karachi day', async () => {
      const row = await rollup.computeDay(t.businessId, DAY);
      expect(row.date.toISOString().slice(0, 10)).toBe(DAY);

      // Direct queries on the same window.
      const start = karachi(DAY, '00:00:00');
      const end = new Date(start.getTime() + 86_400_000);
      const direct = await prisma.order.aggregate({
        where: {
          businessId: t.businessId,
          status: { in: ['FINAL', 'COMPLETED'] },
          createdAt: { gte: start, lt: end },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
      });
      const [{ items }] = await prisma.$queryRaw<{ items: number }[]>`
        SELECT COALESCE(sum(oi.quantity), 0)::int AS items
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."businessId" = ${t.businessId} AND o.status IN ('FINAL', 'COMPLETED')
          AND o."createdAt" >= ${start} AND o."createdAt" < ${end}`;
      const directPayments = await prisma.payment.aggregate({
        where: { order: { businessId: t.businessId }, createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      });

      expect(row.ordersCount).toBe(direct._count._all);
      expect(row.gmv.equals(direct._sum.totalAmount as Prisma.Decimal)).toBe(true);
      expect(row.itemsSold).toBe(items);
      expect(row.paymentsReceived.equals(directPayments._sum.amount as Prisma.Decimal)).toBe(true);

      expect(row.ordersCount).toBe(3);
      expect(row.gmv.toFixed(2)).toBe('1700.50');
      expect(row.itemsSold).toBe(10);
      expect(row.returnsCount).toBe(1);
      expect(row.paymentsReceived.toFixed(2)).toBe('1100.50');
      expect(row.newCustomers).toBe(2);
      expect(row.newProducts).toBe(1);
      expect(row.logins).toBe(3); // support session excluded
      expect(row.activeUsers).toBe(2); // owner + member
      expect(row.offlineSyncedOrders).toBe(0);
      // orders: O1 open 600 (the later 100 does not count), MEMO 300, previous-day 100; khata 300
      expect(row.duesOpenReceivable.toFixed(2)).toBe('1300.00');
      // khata payable 250 + vendor 1000 - 400
      expect(row.duesOpenPayable.toFixed(2)).toBe('850.00');
    });

    it('running the rollup twice leaves identical rows', async () => {
      const snapshot = async () =>
        (
          await prisma.tenantDailyUsage.findMany({
            where: { date: dateOnly(DAY) },
            orderBy: { businessId: 'asc' },
          })
        ).map(({ computedAt: _c, id: _i, ...rest }) => JSON.stringify(rest));

      const n1 = await rollup.rollup(DAY);
      const first = await snapshot();
      const n2 = await rollup.rollup(DAY);
      const second = await snapshot();

      expect(n1).toBe(await prisma.business.count());
      expect(n2).toBe(n1);
      expect(second).toEqual(first);
      expect(first.length).toBe(n1);
      const mine = await prisma.tenantDailyUsage.count({
        where: { businessId: t.businessId, date: dateOnly(DAY) },
      });
      expect(mine).toBe(1);
    });

    it('backfill over 3 days creates 3 rows per tenant', async () => {
      const result = await rollup.backfill('2026-03-01', '2026-03-03');
      expect(result.days).toBe(3);
      const businesses = await prisma.business.count();
      expect(result.rows).toBe(businesses * 3);

      const grouped = await prisma.tenantDailyUsage.groupBy({
        by: ['businessId'],
        where: { date: { gte: dateOnly('2026-03-01'), lte: dateOnly('2026-03-03') } },
        _count: { _all: true },
      });
      expect(grouped.length).toBe(businesses);
      expect(grouped.every((g) => g._count._all === 3)).toBe(true);

      // Single-business backfill is idempotent.
      const again = await rollup.backfill('2026-03-01', '2026-03-03', t.businessId);
      expect(again.rows).toBe(3);
      expect(
        await prisma.tenantDailyUsage.count({
          where: { businessId: t.businessId, date: { gte: dateOnly('2026-03-01'), lte: dateOnly('2026-03-03') } },
        }),
      ).toBe(3);
    });
  });

  // ------------------------------------------------------------------ guards

  describe('access control', () => {
    const anyId = '33333333-3333-4000-8000-000000000001';
    const routes: [string, string][] = [
      ['get', '/agency/analytics/overview'],
      ['get', '/agency/analytics/tenants'],
      ['get', `/agency/analytics/tenants/${tenants.A.id}`],
      ['get', `/agency/analytics/tenants/${tenants.A.id}/usage-statement.pdf`],
      ['post', `/agency/tenants/${tenants.A.id}/view-as`],
    ];

    it.each(routes)('%s %s is 403 for tenant users and 401 anonymously', async (method, path) => {
      for (const who of ['ownerA', 'managerA', 'staffA', 'ownerB'] as const) {
        const res = await (http() as any)[method](path).set(authHeader(who));
        expect(res.status).toBe(403);
      }
      const anon = await (http() as any)[method](path);
      expect(anon.status).toBe(401);
    });

    it('unknown tenant is 404 and a non-uuid id is 400', async () => {
      expect((await http().get(`/agency/analytics/tenants/${anyId}`).set(admin())).status).toBe(404);
      expect((await http().get(`/agency/analytics/tenants/${anyId}/usage-statement.pdf`).set(admin())).status).toBe(404);
      expect((await http().post(`/agency/tenants/${anyId}/view-as`).set(admin())).status).toBe(404);
      expect((await http().get('/agency/analytics/tenants/not-a-uuid').set(admin())).status).toBe(400);
      expect((await http().get('/agency/analytics/tenants?filter=bogus').set(admin())).status).toBe(400);
    });
  });

  // ------------------------------------------------------------------ view-as

  describe('view as tenant', () => {
    it('is read-only, logged, and visible to the tenant only', async () => {
      const before = await prisma.adminAccessLog.count({ where: { businessId: tenants.A.id } });

      const res = await http().post(`/agency/tenants/${tenants.A.id}/view-as`).set(admin());
      expect(res.status).toBe(201);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.url).toMatch(/\/view-as\?token=[0-9a-f]{64}$/);

      const session = await prisma.session.findUnique({ where: { token: res.body.token } });
      expect(session?.impersonatedBy).toBe(users.superAdmin.id);
      expect(session?.userId).toBe(users.ownerA.id);
      const ttl = session!.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(55 * 60_000);
      expect(ttl).toBeLessThanOrEqual(60 * 60_000);

      const viewer = { Authorization: `Bearer ${res.body.token}` };
      const read = await http().get('/customer/getallcustomers').set(viewer);
      expect(read.status).toBe(200);

      const post = await http().post('/customer/newcustomer').set(viewer).send({ name: 'X', phone: '03001234567' });
      expect(post.status).toBe(403);
      expect(post.body.message).toBe('Read-only while viewing as tenant');
      const patch = await http().patch(`/customer/customerrisk/${randomUUID()}`).set(viewer).send({});
      expect(patch.status).toBe(403);
      expect(patch.body.message).toBe('Read-only while viewing as tenant');
      expect((await http().put('/settings/business').set(viewer).send({})).status).toBe(403);

      // Admin looking at the tenant detail is logged too.
      expect((await http().get(`/agency/analytics/tenants/${tenants.A.id}`).set(admin())).status).toBe(200);

      const rows = await prisma.adminAccessLog.findMany({
        where: { businessId: tenants.A.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.length).toBeGreaterThanOrEqual(before + 3);
      const mine = rows.slice(before);
      expect(mine.every((r) => r.adminId === users.superAdmin.id)).toBe(true);
      expect(mine.some((r) => r.action === 'VIEW_AS' && r.method === 'POST')).toBe(true);
      expect(mine.some((r) => r.method === 'GET' && r.route.includes('getallcustomers'))).toBe(true);
      expect(mine.some((r) => r.action === 'tenantDetail' && r.route.includes(tenants.A.id))).toBe(true);

      // Tenant side.
      const seen = await http().get('/settings/access-log?limit=50').set(authHeader('ownerA'));
      expect(seen.status).toBe(200);
      expect(seen.body.length).toBeGreaterThanOrEqual(3);
      expect(seen.body[0]).toEqual(
        expect.objectContaining({
          createdAt: expect.any(String),
          action: expect.any(String),
          route: expect.any(String),
          adminName: `Support (${process.env.APP_NAME || 'DeepKhata'})`,
        }),
      );
      expect(JSON.stringify(seen.body)).not.toContain(users.superAdmin.email);
      expect(seen.body.some((r: { action: string }) => r.action === 'VIEW_AS')).toBe(true);
      const limited = await http().get('/settings/access-log?limit=1').set(authHeader('managerA'));
      expect(limited.status).toBe(200);
      expect(limited.body).toHaveLength(1);

      // Isolation: tenant B sees none of tenant A's log; staff may not read it.
      const other = await http().get('/settings/access-log').set(authHeader('ownerB'));
      expect(other.status).toBe(200);
      expect(other.body.some((r: { route: string }) => r.route.includes(tenants.A.id))).toBe(false);
      expect((await http().get('/settings/access-log').set(authHeader('staffA'))).status).toBe(403);
      expect((await http().get('/settings/access-log').set(admin())).status).toBe(403);
    });
  });

  // -------------------------------------------------------------- tenants list

  describe('tenants list', () => {
    const synthetic: { id: string; kind: string }[] = [];
    let idleId: string;
    let busyId: string;
    let trialId: string;
    let pastDueId: string;

    beforeAll(async () => {
      const now = Date.now();
      const old = new Date(now - 90 * 86_400_000);
      const tag = rand();
      const N = 200;
      const userRows = Array.from({ length: N }, (_, i) => ({
        id: randomUUID(), name: `Bulk ${i}`, email: `bulk-${tag}-${i}@analytics.test`, role: 'OWNER' as const,
      }));
      await prisma.user.createMany({ data: userRows });
      const bizRows = userRows.map((u, i) => ({
        id: randomUUID(), name: `Bulk Biz ${tag}-${i}`, slug: `bulk-${tag}-${i}`, ownerId: u.id, createdAt: old,
        lastActiveAt: new Date(now - (i % 10) * 86_400_000),
      }));
      await prisma.business.createMany({ data: bizRows });

      const kinds = bizRows.map((_, i) => (i === 0 ? 'idle' : i === 1 ? 'busy' : i === 2 ? 'trial' : i === 3 ? 'pastdue' : 'normal'));
      idleId = bizRows[0].id;
      busyId = bizRows[1].id;
      trialId = bizRows[2].id;
      pastDueId = bizRows[3].id;
      bizRows.forEach((b, i) => synthetic.push({ id: b.id, kind: kinds[i] }));

      await prisma.subscription.createMany({
        data: bizRows.map((b, i) => ({
          businessId: b.id,
          planId,
          status: kinds[i] === 'trial' ? ('TRIALING' as const) : kinds[i] === 'pastdue' ? ('PAST_DUE' as const) : ('ACTIVE' as const),
          currentPeriodStart: new Date(now - 10 * 86_400_000),
          currentPeriodEnd: new Date(now + (i % 20) * 86_400_000),
          ...(kinds[i] === 'trial' ? { trialEndsAt: new Date(now + 3 * 86_400_000) } : {}),
        })),
      });

      const today = new Date(now + 5 * 3_600_000);
      today.setUTCHours(0, 0, 0, 0);
      const usage: Prisma.TenantDailyUsageCreateManyInput[] = [];
      bizRows.forEach((b, i) => {
        for (let d = 0; d < 30; d++) {
          const date = new Date(today.getTime() - d * 86_400_000);
          const kind = kinds[i];
          if (kind === 'idle') {
            if (d > 2) continue; // 3 orders in 30 days
            usage.push({ businessId: b.id, date, ordersCount: 1, gmv: '100.00', activeUsers: 1, logins: 1 });
          } else if (kind === 'busy') {
            usage.push({ businessId: b.id, date, ordersCount: 20, gmv: '10000.00', activeUsers: 3, logins: 3 });
          } else {
            usage.push({ businessId: b.id, date, ordersCount: 5 + (i % 7), gmv: '500.00', activeUsers: 2, logins: 2 });
          }
        }
      });
      await prisma.tenantDailyUsage.createMany({ data: usage });
    }, 120_000);

    it('answers for 200+ tenants in under a second', async () => {
      const t0 = Date.now();
      const first = await http().get('/agency/analytics/tenants').set(admin());
      const coldMs = Date.now() - t0;
      expect(first.status).toBe(200);
      expect(first.body.length).toBeGreaterThanOrEqual(200);

      const t1 = Date.now();
      const warm = await http().get('/agency/analytics/tenants?sort=gmv').set(admin());
      const warmMs = Date.now() - t1;
      expect(warm.status).toBe(200);
      // eslint-disable-next-line no-console
      console.log(`tenants list (${warm.body.length} rows): cold ${coldMs} ms, warm ${warmMs} ms`);
      expect(coldMs).toBeLessThan(1000);
      expect(warmMs).toBeLessThan(1000);

      const row = first.body.find((r: { businessId: string }) => r.businessId === busyId);
      expect(row).toEqual(
        expect.objectContaining({
          businessId: busyId,
          plan: 'Analytics Test',
          status: 'ACTIVE',
          trialDaysLeft: null,
          orders30: 600,
          gmv30: 300000,
          activeUsers: 3,
          maxUsers: 10,
          maxProducts: 100,
          maxBranches: 3,
        }),
      );
      expect(row.health).toEqual({ score: expect.any(Number), reason: expect.any(String) });
      expect(row.health.score).toBeGreaterThanOrEqual(0);
      expect(row.health.score).toBeLessThanOrEqual(100);
    });

    it('flags plan fit, health and filters', async () => {
      const all = (await http().get('/agency/analytics/tenants').set(admin())).body as any[];
      const by = (id: string) => all.find((r) => r.businessId === id);

      expect(by(busyId).planFit).toBe('UPGRADE_CANDIDATE'); // gmv30 300000 > 100000
      expect(by(idleId).planFit).toBe('CHURN_RISK'); // 3 orders, old business, tiny footprint
      expect(by(idleId).health.score).toBeLessThan(by(busyId).health.score);
      expect(by(idleId).health.reason).toMatch(/\S/);
      const normal = synthetic.find((s) => s.kind === 'normal')!;
      expect(by(normal.id).planFit).toBeNull();

      const trialing = (await http().get('/agency/analytics/tenants?filter=trialing').set(admin())).body as any[];
      expect(trialing.map((r) => r.businessId)).toContain(trialId);
      expect(trialing.every((r) => r.status === 'TRIALING')).toBe(true);
      expect(trialing.find((r) => r.businessId === trialId).trialDaysLeft).toBe(3);

      const pastdue = (await http().get('/agency/analytics/tenants?filter=pastdue').set(admin())).body as any[];
      expect(pastdue.map((r) => r.businessId)).toContain(pastDueId);
      expect(pastdue.every((r) => r.status === 'PAST_DUE')).toBe(true);

      const over = (await http().get('/agency/analytics/tenants?filter=overlimit').set(admin())).body as any[];
      expect(over.map((r) => r.businessId)).toContain(busyId);
      expect(over.map((r) => r.businessId)).not.toContain(idleId);

      const expiring = (await http().get('/agency/analytics/tenants?filter=expiring7').set(admin())).body as any[];
      expect(expiring.length).toBeGreaterThan(0);

      const inactive = (await http().get('/agency/analytics/tenants?filter=inactive7').set(admin())).body as any[];
      expect(inactive.every((r) => !r.lastActiveAt || Date.now() - Date.parse(r.lastActiveAt) >= 7 * 86_400_000)).toBe(true);
      expect(inactive.length).toBeGreaterThan(0);

      const byGmv = (await http().get('/agency/analytics/tenants?sort=gmv').set(admin())).body as any[];
      for (let i = 1; i < byGmv.length; i++) {
        expect(byGmv[i - 1].gmv30).toBeGreaterThanOrEqual(byGmv[i].gmv30);
      }
      expect(byGmv[0].gmv30).toBe(300000);

      const byActive = (await http().get('/agency/analytics/tenants?sort=lastActive').set(admin())).body as any[];
      const times = byActive.map((r) => (r.lastActiveAt ? Date.parse(r.lastActiveAt) : 0));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('exports CSV', async () => {
      const res = await http().get('/agency/analytics/tenants?format=csv&filter=trialing').set(admin());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('businessId,name,plan,status');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('enriches the existing /agency/tenants routes', async () => {
      const list = await http().get('/agency/tenants').set(admin());
      expect(list.status).toBe(200);
      const row = list.body.find((r: { id: string }) => r.id === busyId);
      expect(row.subscription).toEqual(expect.objectContaining({ status: 'ACTIVE', planName: 'Analytics Test' }));
      expect(row.usage30).toEqual({ orders: 600, gmv: 300000 });
      const one = await http().get(`/agency/tenants/${busyId}`).set(admin());
      expect(one.status).toBe(200);
      expect(one.body.usage30.orders).toBe(600);
      expect(one.body.subscription.planCode).toMatch(/^ANL-/);
    });
  });

  // -------------------------------------------------------------- tenant detail

  describe('tenant detail', () => {
    it('returns 90 days, a 7x24 heatmap, top products, branch split and limits', async () => {
      const t = await makeTenant();
      // Yesterday (Karachi), 10:00 local.
      const nowK = new Date(Date.now() + 5 * 3_600_000);
      const y = new Date(Date.UTC(nowK.getUTCFullYear(), nowK.getUTCMonth(), nowK.getUTCDate() - 1));
      const yStr = y.toISOString().slice(0, 10);
      const product = await prisma.product.create({
        data: { name: 'Top seller', sku: `TOP-${rand()}`, basePrice: '10.00', businessId: t.businessId },
      });
      for (const total of ['300.00', '200.00']) {
        await prisma.order.create({
          data: {
            businessId: t.businessId, branchId: t.branchId, status: 'FINAL', paymentStatus: 'PAID',
            totalAmount: total, createdBy: t.owner.id, createdAt: karachi(yStr, '10:15:00'),
            items: { create: [{ productId: product.id, quantity: 5, price: Number(total) / 5 }] },
          },
        });
      }
      await rollup.computeDay(t.businessId, yStr);

      const res = await http().get(`/agency/analytics/tenants/${t.businessId}`).set(admin());
      expect(res.status).toBe(200);
      expect(res.body.daily).toHaveLength(90);
      const day = res.body.daily.find((d: { date: string }) => d.date === yStr);
      expect(day).toEqual({ date: yStr, orders: 2, gmv: 500 });

      expect(res.body.heatmap).toHaveLength(7);
      expect(res.body.heatmap.every((r: number[]) => r.length === 24)).toBe(true);
      expect(res.body.heatmap[y.getUTCDay()][10]).toBe(2);
      expect(res.body.heatmap.flat().reduce((a: number, b: number) => a + b, 0)).toBe(2);

      expect(res.body.topProducts[0]).toEqual(
        expect.objectContaining({ productId: product.id, name: 'Top seller', quantity: 10, revenue: 500 }),
      );
      expect(res.body.branchSplit).toEqual([
        { branchId: t.branchId, name: 'Main', orders: 2, gmv: 500 },
      ]);
      expect(res.body.users[0]).toEqual(
        expect.objectContaining({ id: t.owner.id, role: 'OWNER', sessions: 0 }),
      );
      expect(res.body.limits).toEqual(expect.objectContaining({ maxUsers: 10, maxProducts: 100 }));
      expect(res.body.usage).toEqual(expect.objectContaining({ products: 1, branches: 1 }));
      expect(res.body.subscription.current.status).toBe('ACTIVE');
      expect(res.body.subscription.invoices).toEqual([]);
      expect(res.body.followUp).toEqual(expect.objectContaining({ status: 'NEW' }));
    });
  });

  // ----------------------------------------------------------- usage statement

  describe('usage statement', () => {
    it('PDF totals equal the TenantDailyUsage rows for the period', async () => {
      const t = await makeTenant();
      const rows = [
        { date: '2026-04-01', orders: 4, gmv: '1000.50', items: 9, returns: 1, pay: '800.00', active: 2, recv: '50.00', pay2: '10.00' },
        { date: '2026-04-02', orders: 6, gmv: '2000.25', items: 14, returns: 0, pay: '1500.00', active: 3, recv: '75.00', pay2: '20.00' },
        { date: '2026-04-03', orders: 1, gmv: '300.00', items: 2, returns: 2, pay: '300.00', active: 1, recv: '90.00', pay2: '30.00' },
        { date: '2026-04-10', orders: 99, gmv: '99999.00', items: 99, returns: 9, pay: '1.00', active: 9, recv: '1.00', pay2: '1.00' }, // outside
      ];
      await prisma.tenantDailyUsage.createMany({
        data: rows.map((r) => ({
          businessId: t.businessId, date: dateOnly(r.date), ordersCount: r.orders, gmv: r.gmv,
          itemsSold: r.items, returnsCount: r.returns, paymentsReceived: r.pay, activeUsers: r.active,
          duesOpenReceivable: r.recv, duesOpenPayable: r.pay2,
        })),
      });

      const url = `/agency/analytics/tenants/${t.businessId}/usage-statement.pdf?from=2026-04-01&to=2026-04-03`;
      const pdf = await http().get(url).set(admin()).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      const body = pdf.body as Buffer;
      expect(body.subarray(0, 5).toString()).toBe('%PDF-');

      const json = await http().get(`${url}&format=json`).set(admin());
      expect(json.status).toBe(200);
      const sum = (f: (r: (typeof rows)[number]) => string | number) =>
        rows.slice(0, 3).reduce((a, r) => a.plus(f(r)), new D(0));
      expect(json.body.daysCovered).toBe(3);
      expect(json.body.orders).toBe(sum((r) => r.orders).toNumber());
      expect(json.body.gmv).toBe(sum((r) => r.gmv).toNumber());
      expect(json.body.itemsSold).toBe(25);
      expect(json.body.returns).toBe(3);
      expect(json.body.paymentsReceived).toBe(sum((r) => r.pay).toNumber());
      expect(json.body.invoicesPrinted).toBe(11);
      expect(json.body.activeStaff).toBe(3);
      expect(json.body.duesOpenReceivable).toBe(90); // as at the last day of the period
      expect(json.body.duesOpenPayable).toBe(30);

      // The numbers are printed in the PDF (text is stored uncompressed, hex-encoded).
      const text = pdfText(body);
      expect(text).toContain('Usage statement');
      expect(text).toContain(String(json.body.orders));
      expect(text).toContain('3,300.75'); // 1000.50 + 2000.25 + 300.00
      expect(text).toContain('2,600.00'); // payments
    });

    it('rejects bad ranges', async () => {
      const t = await makeTenant();
      const base = `/agency/analytics/tenants/${t.businessId}/usage-statement.pdf`;
      expect((await http().get(`${base}?from=2026-04-05&to=2026-04-01`).set(admin())).status).toBe(400);
      expect((await http().get(`${base}?from=nope`).set(admin())).status).toBe(400);
      expect((await http().get(`${base}?from=2024-01-01&to=2026-04-01`).set(admin())).status).toBe(400);
    });
  });

  // ------------------------------------------------------------------ overview

  describe('overview', () => {
    it('reports MRR, trials, churn, GMV and signups', async () => {
      const before = (await http().get('/agency/analytics/overview').set(admin())).body;
      const monthly = await makeTenant({ status: 'ACTIVE', plan: monthlyPlanId, billingCycle: 'MONTHLY' });
      const yearly = await makeTenant({ status: 'ACTIVE', plan: monthlyPlanId, billingCycle: 'YEARLY' });
      await prisma.business.updateMany({
        where: { id: { in: [monthly.businessId, yearly.businessId] } },
        data: { city: 'Lahore', market: 'Hafeez Centre' },
      });
      await prisma.subscription.update({ where: { id: yearly.subId }, data: { trialEndsAt: new Date() } });
      const cancelled = await makeTenant({ status: 'ACTIVE' });
      await prisma.subscription.update({ where: { id: cancelled.subId }, data: { status: 'CANCELLED' } });

      const res = await http().get('/agency/analytics/overview').set(admin());
      expect(res.status).toBe(200);
      // monthly 2000 + yearly 12000 / 12 = 1000
      expect(new D(res.body.mrr).minus(before.mrr).toFixed(2)).toBe('3000.00');
      expect(res.body.trialsStartedThisMonth).toBe(before.trialsStartedThisMonth + 1);
      expect(res.body.churned).toBe(before.churned + 1);
      expect(res.body.trialToPaid).toBeGreaterThanOrEqual(0);
      expect(res.body.trialToPaid).toBeLessThanOrEqual(1);
      expect(typeof res.body.totalGmv30).toBe('number');
      const beforeLahore = before.signupsByCity?.find((c: { city: string }) => c.city === 'Lahore')?.count ?? 0;
      const beforeMarket = before.signupsByMarket?.find((c: { market: string }) => c.market === 'Hafeez Centre')?.count ?? 0;
      const lahore = res.body.signupsByCity.find((c: { city: string }) => c.city === 'Lahore');
      expect(lahore.count).toBe(beforeLahore + 2);
      expect(res.body.signupsByMarket.find((c: { market: string }) => c.market === 'Hafeez Centre').count).toBe(beforeMarket + 2);
      expect(res.body.signupsByCity.some((c: { city: string }) => c.city === 'Unknown')).toBe(true);
    });
  });
});

/** Concatenates the hex-encoded text strings of an uncompressed pdfkit file. */
function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/\[([^\]]*)\]\s*TJ|<([0-9a-f]+)>\s*Tj/gi)) {
    const hexes = [...(m[1] ?? `<${m[2]}>`).matchAll(/<([0-9a-f]*)>/gi)];
    out.push(hexes.map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
  }
  return out.join('\n');
}
