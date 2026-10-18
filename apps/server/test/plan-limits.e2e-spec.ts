import { randomUUID } from 'node:crypto';
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { BillingCycle, PrismaClient, SubscriptionStatus } from '@prisma/client';
import { createTestApp, closeTestApp } from './setup/app';
import { tenants } from './setup/auth';
import { PlanLimitsService } from '../src/plans/plan-limits.service';
import {
  SubscriptionsService,
  addMonthsUtc,
} from '../src/plans/subscriptions.service';
import { PlansController } from '../src/plans/plans.controller';
import { SettingsService } from '../src/settings/settings.service';
import { ProductsService } from '../src/products/products.service';
import { AgencyService } from '../src/agency/agency.service';

const DAY = 86_400_000;
const rand = () => randomUUID().slice(0, 8);

async function limitError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    const err = e as ForbiddenException;
    expect(err.getStatus()).toBe(403);
    return err.getResponse() as Record<string, unknown>;
  }
  throw new Error('expected PLAN_LIMIT_REACHED but the call succeeded');
}

describe('Plan limits and subscriptions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let limits: PlanLimitsService;
  let subs: SubscriptionsService;
  let settings: SettingsService;
  let products: ProductsService;
  let agency: AgencyService;
  let plansController: PlansController;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    limits = app.get(PlanLimitsService);
    subs = app.get(SubscriptionsService);
    settings = app.get(SettingsService);
    products = app.get(ProductsService);
    agency = app.get(AgencyService);
    plansController = app.get(PlansController);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  /** Fresh tenant: owner, business, one branch. Plan is set by the caller. */
  async function makeTenant() {
    const tag = rand();
    const owner = await prisma.user.create({
      data: { name: `Owner ${tag}`, email: `owner-${tag}@plans.test`, role: 'OWNER' },
    });
    const business = await prisma.business.create({
      data: { name: `Plans ${tag}`, slug: `plans-${tag}`, ownerId: owner.id },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { businessId: business.id } });
    const branch = await prisma.branch.create({
      data: { name: 'Main Branch', businessId: business.id },
    });
    return { owner, business, branch, businessId: business.id };
  }

  async function makeTrialTenant() {
    const t = await makeTenant();
    await subs.startTrial(t.businessId);
    return t;
  }

  async function makeCustomTenant(customLimits: object) {
    const t = await makeTenant();
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'CUSTOM' } });
    await prisma.subscription.create({
      data: {
        businessId: t.businessId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        customLimits,
      },
    });
    return t;
  }

  async function addProducts(businessId: string, count: number) {
    await prisma.product.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        name: `Bulk ${i}`,
        sku: `B-${rand()}-${i}`,
        basePrice: 10,
        businessId,
      })),
    });
  }

  describe('trial plan (1 branch / 2 users / 100 products)', () => {
    it('getLimits reads the TRIAL plan', async () => {
      const t = await makeTrialTenant();
      expect(await limits.getLimits(t.businessId)).toEqual({
        plan: { code: 'TRIAL', name: 'Free Trial' },
        maxBranches: 1,
        maxUsers: 2,
        maxProducts: 100,
      });
    });

    it('blocks the 2nd branch with the exact error body', async () => {
      const t = await makeTrialTenant();
      const body = await limitError(settings.createBranch(t.owner.id, { name: 'Second' }));
      expect(body).toEqual({
        statusCode: 403,
        code: 'PLAN_LIMIT_REACHED',
        resource: 'branches',
        limit: 1,
        used: 1,
        plan: 'TRIAL',
        message: 'Plan limit reached: 1 branches on Free Trial',
      });
      expect(await prisma.branch.count({ where: { businessId: t.businessId } })).toBe(1);
    });

    it('blocks the 3rd user: owner + a pending invite already use both seats', async () => {
      const t = await makeTrialTenant();
      await prisma.invitation.create({
        data: {
          email: `pending-${rand()}@plans.test`,
          role: 'STAFF',
          token: randomUUID(),
          businessId: t.businessId,
          expiresAt: new Date(Date.now() + DAY),
        },
      });
      const body = await limitError(
        settings.inviteStaff(t.owner.id, { email: `third-${rand()}@plans.test`, role: 'STAFF' }),
      );
      expect(body).toEqual({
        statusCode: 403,
        code: 'PLAN_LIMIT_REACHED',
        resource: 'users',
        limit: 2,
        used: 2,
        plan: 'TRIAL',
        message: 'Plan limit reached: 2 users on Free Trial',
      });
    });

    it('expired invites and deactivated members do not count as users', async () => {
      const t = await makeTrialTenant();
      await prisma.invitation.create({
        data: {
          email: `old-${rand()}@plans.test`,
          role: 'STAFF',
          token: randomUUID(),
          businessId: t.businessId,
          expiresAt: new Date(Date.now() - DAY),
        },
      });
      await prisma.user.create({
        data: {
          name: 'Gone',
          email: `gone-${rand()}@plans.test`,
          role: 'STAFF',
          businessId: t.businessId,
          deactivatedAt: new Date(),
        },
      });
      expect((await limits.getUsage(t.businessId)).users).toBe(1);
      await expect(limits.assert(t.businessId, 'users')).resolves.toBeUndefined();
      await expect(limits.assert(t.businessId, 'users', 2)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks the 101st product', async () => {
      const t = await makeTrialTenant();
      await prisma.category.create({ data: { name: 'Cat', businessId: t.businessId } });
      await addProducts(t.businessId, 99);

      const hundredth = await products.addProduct(t.owner.id, {
        name: 'Hundredth',
        price: 10,
        category: 'Cat',
        quantity: 1,
        branchId: t.branch.id,
      });
      expect(hundredth).toBeTruthy();
      expect((await limits.getUsage(t.businessId)).products).toBe(100);

      const body = await limitError(
        products.addProduct(t.owner.id, {
          name: 'One too many',
          price: 10,
          category: 'Cat',
          quantity: 1,
          branchId: t.branch.id,
        }),
      );
      expect(body).toMatchObject({
        code: 'PLAN_LIMIT_REACHED',
        resource: 'products',
        limit: 100,
        used: 100,
        plan: 'TRIAL',
        message: 'Plan limit reached: 100 products on Free Trial',
      });
      expect(await prisma.product.count({ where: { businessId: t.businessId } })).toBe(100);
    });

    it('bulk import over capacity is rejected and writes nothing; within capacity succeeds', async () => {
      const t = await makeTrialTenant();
      await addProducts(t.businessId, 98);
      const before = {
        products: await prisma.product.count({ where: { businessId: t.businessId } }),
        categories: await prisma.category.count({ where: { businessId: t.businessId } }),
      };

      const body = await limitError(
        products.importProducts(t.owner.id, [
          { name: 'I1', price: 5, category: 'NewCat', stock: 1 },
          { name: 'I2', price: 5, category: 'NewCat', stock: 1 },
          { name: 'I3', price: 5, category: 'NewCat', stock: 1 },
        ]),
      );
      expect(body).toMatchObject({
        code: 'PLAN_LIMIT_REACHED',
        resource: 'products',
        limit: 100,
        used: 98,
      });
      expect(await prisma.product.count({ where: { businessId: t.businessId } })).toBe(
        before.products,
      );
      expect(await prisma.category.count({ where: { businessId: t.businessId } })).toBe(
        before.categories,
      );
      expect(await prisma.productInstance.count({ where: { product: { businessId: t.businessId } } })).toBe(0);

      const ok = await products.importProducts(t.owner.id, [
        { name: 'I1', price: 5, stock: 1 },
        { name: 'I2', price: 5, stock: 1 },
      ]);
      expect(ok.importedCount).toBe(2);
      expect((await limits.getUsage(t.businessId)).products).toBe(100);
    });
  });

  describe('CUSTOM plan keeps the pre-plans caps (2 branches / 5 users)', () => {
    it('seeded tenant A resolves to 2 / 5 / unlimited on CUSTOM', async () => {
      expect(await limits.getLimits(tenants.A.id)).toEqual({
        plan: { code: 'CUSTOM', name: 'Custom' },
        maxBranches: 2,
        maxUsers: 5,
        maxProducts: null,
      });
    });

    it('allows a 2nd branch, blocks the 3rd; customLimits null means unlimited', async () => {
      const t = await makeCustomTenant({ maxBranches: 2, maxUsers: 5, maxProducts: null });
      await settings.createBranch(t.owner.id, { name: 'Second' });
      const body = await limitError(settings.createBranch(t.owner.id, { name: 'Third' }));
      expect(body).toMatchObject({
        resource: 'branches',
        limit: 2,
        used: 2,
        plan: 'CUSTOM',
        message: 'Plan limit reached: 2 branches on Custom',
      });
      // products are unlimited
      await expect(limits.assert(t.businessId, 'products', 100000)).resolves.toBeUndefined();
    });

    it('blocks the 6th user (members + invites)', async () => {
      const t = await makeCustomTenant({ maxBranches: 2, maxUsers: 5, maxProducts: null });
      for (let i = 0; i < 3; i++) {
        await prisma.user.create({
          data: { name: `M${i}`, email: `m${i}-${rand()}@plans.test`, role: 'STAFF', businessId: t.businessId },
        });
      }
      await prisma.invitation.create({
        data: { email: `inv-${rand()}@plans.test`, role: 'STAFF', token: randomUUID(), businessId: t.businessId },
      });
      const body = await limitError(
        settings.inviteStaff(t.owner.id, { email: `sixth-${rand()}@plans.test`, role: 'STAFF' }),
      );
      expect(body).toMatchObject({ resource: 'users', limit: 5, used: 5, plan: 'CUSTOM' });
    });

    it('customLimits override the plan columns', async () => {
      const t = await makeTrialTenant();
      await prisma.subscription.update({
        where: { businessId: t.businessId },
        data: { customLimits: { maxProducts: 500, maxBranches: null } },
      });
      expect(await limits.getLimits(t.businessId)).toMatchObject({
        plan: { code: 'TRIAL', name: 'Free Trial' },
        maxBranches: null,
        maxUsers: 2,
        maxProducts: 500,
      });
    });
  });

  describe('GET /plans/usage payload', () => {
    it('returns plan, limits, usage and subscription for the session tenant', async () => {
      const t = await makeTrialTenant();
      await addProducts(t.businessId, 7);
      await prisma.invitation.create({
        data: { email: `u-${rand()}@plans.test`, role: 'STAFF', token: randomUUID(), businessId: t.businessId },
      });
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });

      const res = await plansController.usage({
        businessId: t.businessId,
        branchId: null,
        userId: t.owner.id,
        role: 'OWNER',
      });
      expect(res).toEqual({
        plan: { code: 'TRIAL', name: 'Free Trial' },
        limits: { maxBranches: 1, maxUsers: 2, maxProducts: 100 },
        usage: { branches: 1, users: 2, products: 7 },
        subscription: {
          status: 'TRIALING',
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
        },
      });
    });
  });

  describe('getEffectiveStatus', () => {
    async function withSub(data: {
      status: SubscriptionStatus;
      trialEndsAt?: Date | null;
      currentPeriodEnd?: Date | null;
      graceEndsAt?: Date | null;
    }) {
      const t = await makeTenant();
      const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'TRIAL' } });
      await prisma.subscription.create({
        data: { businessId: t.businessId, planId: plan.id, currentPeriodStart: new Date('2026-01-01'), ...data },
      });
      return t.businessId;
    }
    const now = new Date('2026-06-15T12:00:00Z');
    const before = new Date('2026-06-01T00:00:00Z');
    const after = new Date('2026-07-01T00:00:00Z');

    it('TRIALING: active before trialEndsAt, READ_ONLY after (fake clock)', async () => {
      const id = await withSub({ status: 'TRIALING', trialEndsAt: after, currentPeriodEnd: after });
      expect(await subs.getEffectiveStatus(id, now)).toEqual({
        status: 'ACTIVE',
        subscriptionExpiresAt: after,
        subscriptionStatus: 'TRIALING',
        planCode: 'TRIAL',
      });
      const later = new Date('2026-07-02T00:00:00Z');
      expect((await subs.getEffectiveStatus(id, later)).status).toBe('READ_ONLY');
    });

    it('TRIALING with a past currentPeriodEnd only is READ_ONLY', async () => {
      const id = await withSub({ status: 'TRIALING', trialEndsAt: after, currentPeriodEnd: before });
      expect((await subs.getEffectiveStatus(id, now)).status).toBe('READ_ONLY');
    });

    it('ACTIVE: active until currentPeriodEnd, then READ_ONLY; open-ended stays active', async () => {
      const live = await withSub({ status: 'ACTIVE', currentPeriodEnd: after });
      const lapsed = await withSub({ status: 'ACTIVE', currentPeriodEnd: before });
      const open = await withSub({ status: 'ACTIVE', currentPeriodEnd: null });
      expect((await subs.getEffectiveStatus(live, now)).status).toBe('ACTIVE');
      expect((await subs.getEffectiveStatus(lapsed, now)).status).toBe('READ_ONLY');
      expect((await subs.getEffectiveStatus(open, now)).status).toBe('ACTIVE');
    });

    it('PAST_DUE: ACTIVE until graceEndsAt, then READ_ONLY', async () => {
      const inGrace = await withSub({ status: 'PAST_DUE', currentPeriodEnd: before, graceEndsAt: after });
      const pastGrace = await withSub({ status: 'PAST_DUE', currentPeriodEnd: before, graceEndsAt: before });
      expect((await subs.getEffectiveStatus(inGrace, now)).status).toBe('ACTIVE');
      expect((await subs.getEffectiveStatus(pastGrace, now)).status).toBe('READ_ONLY');
    });

    it('READ_ONLY, SUSPENDED and CANCELLED map directly', async () => {
      const ro = await withSub({ status: 'READ_ONLY' });
      const su = await withSub({ status: 'SUSPENDED' });
      const ca = await withSub({ status: 'CANCELLED' });
      expect((await subs.getEffectiveStatus(ro, now)).status).toBe('READ_ONLY');
      expect((await subs.getEffectiveStatus(su, now)).status).toBe('SUSPENDED');
      expect((await subs.getEffectiveStatus(ca, now)).status).toBe('SUSPENDED');
    });

    it('without a Subscription row it falls back to Business.status / subscriptionExpiresAt', async () => {
      const t = await makeTenant();
      const expires = new Date('2026-12-01T00:00:00Z');
      await prisma.business.update({
        where: { id: t.businessId },
        data: { status: 'READ_ONLY', subscriptionExpiresAt: expires },
      });
      expect(await subs.getEffectiveStatus(t.businessId, now)).toEqual({
        status: 'READ_ONLY',
        subscriptionExpiresAt: expires,
        subscriptionStatus: null,
        planCode: null,
      });
    });
  });

  describe('startTrial, extend and setStatus', () => {
    it('startTrial uses trialDays from the TRIAL plan and mirrors Business', async () => {
      const t = await makeTenant();
      const now = new Date('2026-03-01T00:00:00Z');
      const sub = await subs.startTrial(t.businessId, undefined, now);
      expect(sub.status).toBe('TRIALING');
      expect(sub.trialEndsAt).toEqual(new Date(now.getTime() + 30 * DAY));
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.status).toBe('ACTIVE');
      expect(biz.subscriptionExpiresAt).toEqual(sub.trialEndsAt);
    });

    it('extend monthly from an expired period starts at now', async () => {
      const t = await makeCustomTenant({});
      await prisma.subscription.update({
        where: { businessId: t.businessId },
        data: { status: 'READ_ONLY', currentPeriodEnd: new Date('2026-01-10T00:00:00Z'), graceEndsAt: new Date() },
      });
      const now = new Date('2026-05-15T00:00:00Z');
      const sub = await subs.extend(t.businessId, { months: 1 }, undefined, now);
      expect(sub.currentPeriodEnd).toEqual(new Date('2026-06-15T00:00:00Z'));
      expect(sub.status).toBe('ACTIVE');
      expect(sub.graceEndsAt).toBeNull();
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.status).toBe('ACTIVE');
      expect(biz.subscriptionExpiresAt).toEqual(sub.currentPeriodEnd);
    });

    it('extend monthly from a future period end stacks on top of it', async () => {
      const t = await makeCustomTenant({});
      await prisma.subscription.update({
        where: { businessId: t.businessId },
        data: { currentPeriodEnd: new Date('2026-08-20T00:00:00Z') },
      });
      const now = new Date('2026-05-15T00:00:00Z');
      const sub = await subs.extend(t.businessId, { months: 1 }, undefined, now);
      expect(sub.currentPeriodEnd).toEqual(new Date('2026-09-20T00:00:00Z'));
    });

    it('extend yearly from expired and from future', async () => {
      const expired = await makeCustomTenant({});
      await prisma.subscription.update({
        where: { businessId: expired.businessId },
        data: { currentPeriodEnd: new Date('2025-01-01T00:00:00Z') },
      });
      const future = await makeCustomTenant({});
      await prisma.subscription.update({
        where: { businessId: future.businessId },
        data: { currentPeriodEnd: new Date('2027-02-28T00:00:00Z') },
      });
      const now = new Date('2026-05-15T00:00:00Z');
      const a = await subs.extend(expired.businessId, { years: 1 }, undefined, now);
      const b = await subs.extend(future.businessId, { years: 1 }, undefined, now);
      expect(a.currentPeriodEnd).toEqual(new Date('2027-05-15T00:00:00Z'));
      expect(a.billingCycle).toBe(BillingCycle.YEARLY);
      expect(b.currentPeriodEnd).toEqual(new Date('2028-02-28T00:00:00Z'));
    });

    it('extend can switch plan and billing cycle', async () => {
      const t = await makeTrialTenant();
      const business = await prisma.plan.findUniqueOrThrow({ where: { code: 'BUSINESS' } });
      await subs.extend(t.businessId, { months: 12, planId: business.id, billingCycle: 'YEARLY' });
      expect((await limits.getLimits(t.businessId)).plan.code).toBe('BUSINESS');
    });

    it('addMonthsUtc clamps the day of month', () => {
      expect(addMonthsUtc(new Date('2026-01-31T00:00:00Z'), 1)).toEqual(new Date('2026-02-28T00:00:00Z'));
    });

    it('setStatus mirrors Business.status', async () => {
      const t = await makeTrialTenant();
      await subs.setStatus(t.businessId, 'SUSPENDED');
      expect((await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } })).status).toBe('SUSPENDED');
      await subs.setStatus(t.businessId, 'READ_ONLY');
      expect((await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } })).status).toBe('READ_ONLY');
      await subs.setStatus(t.businessId, 'ACTIVE');
      expect((await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } })).status).toBe('ACTIVE');
    });
  });

  describe('agency', () => {
    it('onboardTenant creates a TRIALING subscription on the TRIAL plan', async () => {
      const tag = rand();
      const res = await agency.onboardTenant({
        businessName: `Agency Onboard ${tag}`,
        ownerName: 'Owner',
        ownerEmail: `agency-${tag}@plans.test`,
        ownerPassword: 'Passw0rd!123',
      });
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: res.business.id },
        include: { plan: true },
      });
      expect(sub.plan.code).toBe('TRIAL');
      expect(sub.status).toBe('TRIALING');
      expect(sub.trialEndsAt).not.toBeNull();
    });

    it('addBranchToTenant asserts the branch cap unless override: true', async () => {
      const t = await makeTrialTenant();
      const body = await limitError(agency.addBranchToTenant(t.businessId, { name: 'Extra' }));
      expect(body).toMatchObject({ code: 'PLAN_LIMIT_REACHED', resource: 'branches', limit: 1, used: 1, plan: 'TRIAL' });
      const res = await agency.addBranchToTenant(t.businessId, { name: 'Extra', override: true });
      expect(res.branch.name).toBe('Extra');
      expect(await prisma.branch.count({ where: { businessId: t.businessId } })).toBe(2);
    });

    it('logPaymentAndExtend also moves the Subscription to the paid-through date', async () => {
      const t = await makeTrialTenant();
      const paidUntil = new Date(Date.now() + 90 * DAY);
      const res = await agency.logPaymentAndExtend(t.businessId, {
        amount: 3000,
        paymentDate: paidUntil,
        notes: 'plan-limits test',
      });
      expect(res.status).toBe('ACTIVE');
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.status).toBe('ACTIVE');
      expect(sub.currentPeriodEnd).toEqual(paidUntil);
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.subscriptionExpiresAt).toEqual(paidUntil);
      expect(biz.status).toBe('ACTIVE');
    });
  });
});
