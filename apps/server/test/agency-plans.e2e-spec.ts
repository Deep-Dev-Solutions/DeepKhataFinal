import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import {
  addMonthsUtc,
  computeEffectiveStatus,
} from '../src/plans/subscriptions.service';

const BIZ_A = tenants.A.id;
const CREATED: string[] = [];
const stamp = Date.now().toString(36).toUpperCase();
const CODE = `ZZTEST${stamp}`;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const today = new Date();
const inDays = (n: number) => isoDay(new Date(today.getTime() + n * 86_400_000));

describe('Agency plans and plan-changing payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  let subSnapshot: Record<string, unknown> | null = null;
  let bizSnapshot: Record<string, unknown> | null = null;
  let dealIdsBefore: string[] = [];
  let billingIdsBefore: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();

    // This spec changes tenant A's plan, so remember the seeded state and put it
    // back afterwards: every spec file must leave the DB as it found it.
    const sub = await prisma.subscription.findUnique({ where: { businessId: BIZ_A } });
    if (sub) {
      const { id, businessId, createdAt, updatedAt, ...rest } = sub;
      void id;
      void businessId;
      void createdAt;
      void updatedAt;
      subSnapshot = rest;
    }
    const biz = await prisma.business.findUniqueOrThrow({ where: { id: BIZ_A } });
    bizSnapshot = { status: biz.status, subscriptionExpiresAt: biz.subscriptionExpiresAt };
    dealIdsBefore = (
      await prisma.dealHistory.findMany({ where: { businessId: BIZ_A }, select: { id: true } })
    ).map((r) => r.id);
    billingIdsBefore = (
      await prisma.agencyBillingLog.findMany({ where: { businessId: BIZ_A }, select: { id: true } })
    ).map((r) => r.id);
  });

  afterAll(async () => {
    if (CREATED.length > 0) {
      await prisma.plan.deleteMany({ where: { id: { in: CREATED } } });
    }
    await prisma.dealHistory.deleteMany({
      where: { businessId: BIZ_A, id: { notIn: dealIdsBefore } },
    });
    await prisma.agencyBillingLog.deleteMany({
      where: { businessId: BIZ_A, id: { notIn: billingIdsBefore } },
    });
    if (subSnapshot) {
      await prisma.subscription.update({ where: { businessId: BIZ_A }, data: subSnapshot });
    }
    if (bizSnapshot) {
      await prisma.business.update({ where: { id: BIZ_A }, data: bizSnapshot });
    }
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  async function effectiveStatus(businessId: string) {
    const sub = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: { select: { code: true } } },
    });
    expect(sub).not.toBeNull();
    return computeEffectiveStatus(sub as never, new Date()).status;
  }

  async function planByCode(code: string) {
    const plan = await prisma.plan.findUnique({ where: { code } });
    expect(plan).not.toBeNull();
    return plan!;
  }

  it('lists the seeded presets with prices as strings', async () => {
    const res = await http().get('/agency/plans').set(authHeader('superAdmin'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const basic = (res.body as Array<Record<string, unknown>>).find(
      (p) => p.code === 'BASIC',
    );
    expect(basic).toBeDefined();
    expect(basic!.name).toBe('Basic');
    expect(basic!.priceMonthly).toBe('3000');
    expect(basic!.priceYearly).toBe('30000');
    expect(typeof basic!.subscribers).toBe('number');

    const custom = (res.body as Array<Record<string, unknown>>).find(
      (p) => p.code === 'CUSTOM',
    );
    expect(custom).toBeDefined();
    expect(custom!.isPublic).toBe(false);
  });

  it('refuses plan management to a shop owner', async () => {
    const list = await http().get('/agency/plans').set(authHeader('ownerA'));
    expect(list.status).toBe(403);

    const create = await http()
      .post('/agency/plans')
      .set(authHeader('ownerA'))
      .send({ code: 'NOPE', name: 'Nope' });
    expect(create.status).toBe(403);
  });

  it('creates a preset, rejects a duplicate code, and edits it', async () => {
    const created = await http()
      .post('/agency/plans')
      .set(authHeader('superAdmin'))
      .send({
        code: CODE,
        name: 'Test Plan',
        priceMonthly: '4500',
        priceYearly: '45000',
        maxBranches: 4,
        maxUsers: 20,
        maxProducts: 500,
        trialDays: 14,
      });
    expect(created.status).toBe(201);
    CREATED.push(created.body.id as string);
    expect(created.body.priceMonthly).toBe('4500');
    expect(created.body.maxBranches).toBe(4);

    const duplicate = await http()
      .post('/agency/plans')
      .set(authHeader('superAdmin'))
      .send({ code: CODE, name: 'Again' });
    expect(duplicate.status).toBe(409);

    const badPrice = await http()
      .post('/agency/plans')
      .set(authHeader('superAdmin'))
      .send({ code: `${CODE}B`, name: 'Bad', priceMonthly: '12.345' });
    expect(badPrice.status).toBe(400);

    const patched = await http()
      .patch(`/agency/plans/${created.body.id}`)
      .set(authHeader('superAdmin'))
      .send({ name: 'Test Plan Renamed', priceMonthly: '5000', maxUsers: 25 });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Test Plan Renamed');
    expect(patched.body.priceMonthly).toBe('5000');
    expect(patched.body.maxUsers).toBe(25);
    expect(patched.body.code).toBe(CODE);

    const list = await http().get('/agency/plans').set(authHeader('superAdmin'));
    const found = (list.body as Array<Record<string, unknown>>).find(
      (p) => p.code === CODE,
    );
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test Plan Renamed');
  });

  it('rejects an unknown or malformed plan id', async () => {
    const missing = await http()
      .patch(`/agency/plans/${randomUUID()}`)
      .set(authHeader('superAdmin'))
      .send({ name: 'Ghost' });
    expect(missing.status).toBe(404);

    const malformed = await http()
      .patch('/agency/plans/not-a-uuid')
      .set(authHeader('superAdmin'))
      .send({ name: 'Ghost' });
    expect(malformed.status).toBe(400);
  });

  it('a payment records cash without changing the plan, expiry or status', async () => {
    // Start from a trial that has already run out - the exact state the report showed.
    await prisma.subscription.upsert({
      where: { businessId: BIZ_A },
      create: {
        businessId: BIZ_A,
        planId: (await planByCode('TRIAL')).id,
        status: 'TRIALING',
        trialEndsAt: new Date(today.getTime() - 86_400_000),
        currentPeriodStart: new Date(today.getTime() - 40 * 86_400_000),
        currentPeriodEnd: new Date(today.getTime() - 10 * 86_400_000),
        billingCycle: 'MONTHLY',
      },
      update: {
        planId: (await planByCode('TRIAL')).id,
        status: 'TRIALING',
        trialEndsAt: new Date(today.getTime() - 86_400_000),
        currentPeriodStart: new Date(today.getTime() - 40 * 86_400_000),
        currentPeriodEnd: new Date(today.getTime() - 10 * 86_400_000),
        graceEndsAt: null,
      },
    });
    expect(await effectiveStatus(BIZ_A)).toBe('READ_ONLY');

    const before = await http()
      .get(`/agency/tenants/${BIZ_A}`)
      .set(authHeader('superAdmin'));
    const beforeSub = before.body.subscription;
    const beforeBusiness = await prisma.business.findUniqueOrThrow({
      where: { id: BIZ_A },
    });

    const payment = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({
        amount: '30000',
        receivedAt: inDays(0),
        method: 'BANK',
        notes: 'Yearly upgrade paid',
      });
    expect(payment.status).toBe(201);
    expect(payment.body.billingLog.method).toBe('BANK');
    expect(payment.body.billingLog.amount).toBe('30000.00');

    const tenant = await http()
      .get(`/agency/tenants/${BIZ_A}`)
      .set(authHeader('superAdmin'));
    expect(tenant.status).toBe(200);
    // D2: the deal is the contract. Money never rewrites it.
    expect(tenant.body.subscription.planCode).toBe(beforeSub.planCode);
    expect(tenant.body.subscription.status).toBe(beforeSub.status);
    expect(tenant.body.subscription.billingCycle).toBe(beforeSub.billingCycle);
    expect(tenant.body.subscription.trialEndsAt).toBe(beforeSub.trialEndsAt);

    const afterBusiness = await prisma.business.findUniqueOrThrow({
      where: { id: BIZ_A },
    });
    expect(afterBusiness.subscriptionExpiresAt?.toISOString()).toBe(
      beforeBusiness.subscriptionExpiresAt?.toISOString(),
    );
    expect(afterBusiness.status).toBe(beforeBusiness.status);
    expect(await effectiveStatus(BIZ_A)).toBe('READ_ONLY');
  });

  it('reports due, paid and balance for the current deal period', async () => {
    // Isolate the money maths from the earlier tests.
    await prisma.agencyBillingLog.deleteMany({ where: { businessId: BIZ_A } });

    const deal = await http()
      .post(`/agency/tenants/${BIZ_A}/deal`)
      .set(authHeader('superAdmin'))
      .send({
        plan: 'BASIC',
        price: '3000',
        billingCycle: 'MONTHLY',
        startDate: inDays(-1),
        endDate: isoDay(addMonthsUtc(today, 1)),
        maxBranches: 1,
        maxUsers: 5,
      });
    expect(deal.status).toBe(201);

    const first = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({ amount: '1000', receivedAt: inDays(0), method: 'CASH' });
    expect(first.status).toBe(201);

    const second = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({ amount: '500.50', receivedAt: inDays(0), method: 'ONLINE' });
    expect(second.status).toBe(201);

    // A row written before D2: no receivedAt, and paymentDate was really an expiry.
    await prisma.agencyBillingLog.create({
      data: {
        businessId: BIZ_A,
        amount: '999',
        paymentDate: new Date(today.getTime() + 365 * 86_400_000),
        notes: 'legacy row',
      },
    });

    const billing = await http()
      .get(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'));
    expect(billing.status).toBe(200);
    expect(billing.body.deal.planCode).toBe('BASIC');
    expect(billing.body.totalDue).toBe('3000.00');
    // Decimal maths, and the legacy row is not money received in this period.
    expect(billing.body.totalReceived).toBe('1500.50');
    expect(billing.body.balance).toBe('1499.50');

    const legacy = billing.body.timeline.find(
      (row: { type: string }) => row.type === 'legacy-payment',
    );
    expect(legacy).toBeTruthy();
    expect(legacy.paidUntil).toBeTruthy();

    // One merged timeline, newest first, and the deal is part of it.
    const types = billing.body.timeline.map((row: { type: string }) => row.type);
    expect(types).toContain('deal');
    expect(types).toContain('payment');
    const times = billing.body.timeline.map((row: { at: string }) => Date.parse(row.at));
    expect([...times].sort((a: number, b: number) => b - a)).toEqual(times);
  });

  it('rejects a payment with no received-on date or an unknown method', async () => {
    const missing = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({ amount: '1000', method: 'CASH' });
    expect(missing.status).toBe(400);

    const badMethod = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({ amount: '1000', receivedAt: inDays(0), method: 'CHEQUE' });
    expect(badMethod.status).toBe(400);
  });

  it('hides the billing view from a shop owner and rejects unknown tenants', async () => {
    const owner = await http()
      .get(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('ownerA'));
    expect(owner.status).toBe(403);

    const missing = await http()
      .get('/agency/tenants/00000000-0000-4000-8000-000000000000/billing')
      .set(authHeader('superAdmin'));
    expect(missing.status).toBe(404);

    const malformed = await http()
      .get('/agency/tenants/not-a-uuid/billing')
      .set(authHeader('superAdmin'));
    expect(malformed.status).toBe(400);
  });

  it('moves a tenant from expired to active when the plan is renewed', async () => {
    const setDeal = (start: string, end: string, plan = 'STANDARD') =>
      http()
        .post(`/agency/tenants/${BIZ_A}/deal`)
        .set(authHeader('superAdmin'))
        .send({
          plan,
          price: '7000',
          billingCycle: 'MONTHLY',
          startDate: start,
          endDate: end,
          maxBranches: 2,
          maxUsers: 10,
          notes: 'renewal test',
        });

    const expired = await setDeal(inDays(-60), inDays(-1));
    expect(expired.status).toBe(201);
    expect(await effectiveStatus(BIZ_A)).toBe('READ_ONLY');

    const renewed = await setDeal(inDays(-1), inDays(1));
    expect(renewed.status).toBe(201);
    expect(renewed.body.subscription.trialEndsAt).toBeNull();
    expect(await effectiveStatus(BIZ_A)).toBe('ACTIVE');
  });

  it('does not leave a stale trial date behind when a paid plan replaces a trial', async () => {
    await prisma.subscription.update({
      where: { businessId: BIZ_A },
      data: {
        planId: (await planByCode('TRIAL')).id,
        status: 'TRIALING',
        trialEndsAt: new Date(today.getTime() - 5 * 86_400_000),
        currentPeriodEnd: new Date(today.getTime() - 5 * 86_400_000),
      },
    });
    expect(await effectiveStatus(BIZ_A)).toBe('READ_ONLY');

    const res = await http()
      .post(`/agency/tenants/${BIZ_A}/deal`)
      .set(authHeader('superAdmin'))
      .send({
        plan: 'STANDARD',
        price: '70000',
        billingCycle: 'YEARLY',
        startDate: inDays(-1),
        endDate: isoDay(addMonthsUtc(today, 12)),
        maxBranches: 2,
        maxUsers: 10,
      });
    expect(res.status).toBe(201);

    const after = await http()
      .get(`/agency/tenants/${BIZ_A}`)
      .set(authHeader('superAdmin'));
    expect(after.body.subscription.planCode).toBe('STANDARD');
    expect(after.body.subscription.trialEndsAt).toBeNull();
    expect(await effectiveStatus(BIZ_A)).toBe('ACTIVE');
  });
});
