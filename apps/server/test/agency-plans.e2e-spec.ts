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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    if (CREATED.length > 0) {
      await prisma.plan.deleteMany({ where: { id: { in: CREATED } } });
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

  it('a logged payment upgrades the plan and clears the trial', async () => {
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

    const basic = await planByCode('BASIC');
    const payment = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({
        amount: '30000',
        paymentDate: isoDay(addMonthsUtc(today, 12)),
        notes: 'Yearly upgrade paid',
        planId: basic.id,
        billingCycle: 'YEARLY',
      });
    expect(payment.status).toBe(201);

    const tenant = await http()
      .get(`/agency/tenants/${BIZ_A}`)
      .set(authHeader('superAdmin'));
    expect(tenant.status).toBe(200);
    expect(tenant.body.subscription.planCode).toBe('BASIC');
    expect(tenant.body.subscription.planName).toBe('Basic');
    expect(tenant.body.subscription.status).toBe('ACTIVE');
    expect(tenant.body.subscription.trialEndsAt).toBeNull();
    expect(tenant.body.subscription.billingCycle).toBe('YEARLY');
    expect(await effectiveStatus(BIZ_A)).toBe('ACTIVE');

    // The shop itself now reads the upgraded plan.
    const usage = await http().get('/plans/usage').set(authHeader('ownerA'));
    expect(usage.status).toBe(200);
    expect(usage.body.plan.code).toBe('BASIC');
    expect(usage.body.plan.name).toBe('Basic');
  });

  it('a payment without a plan keeps the current plan', async () => {
    const before = await http()
      .get(`/agency/tenants/${BIZ_A}`)
      .set(authHeader('superAdmin'));
    const planCode = before.body.subscription.planCode as string;

    const payment = await http()
      .post(`/agency/tenants/${BIZ_A}/billing`)
      .set(authHeader('superAdmin'))
      .send({ amount: '1000', paymentDate: inDays(30), notes: 'Top up' });
    expect(payment.status).toBe(201);

    const after = await http()
      .get(`/agency/tenants/${BIZ_A}`)
      .set(authHeader('superAdmin'));
    expect(after.body.subscription.planCode).toBe(planCode);
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
