import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader } from './setup/auth';
import { MailService } from '../src/mail/mail.service';
import { LifecycleService } from '../src/lifecycle/lifecycle.service';

const DAY = 86_400_000;
const ALERT_EMAIL = 'agency-alerts@deepkhata.test';
const READ_ONLY_MESSAGE = 'Subscription expired. System is in read-only mode.';
const tag = () => randomUUID().slice(0, 8);
const mobile = () => `0312${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describe('Self-serve onboarding and trial lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let lifecycle: LifecycleService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AGENCY_ALERT_EMAIL = ALERT_EMAIL;
    app = await createTestApp();
    prisma = new PrismaClient();
    lifecycle = app.get(LifecycleService);
    // Never send real mail; EmailLog rows are still written.
    app.get(MailService).setTransport({
      send: async () => ({ providerId: 'test' }),
    });
  });

  afterAll(async () => {
    app.get(MailService).setTransport(null);
    delete process.env.AGENCY_ALERT_EMAIL;
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  /** A signed-in owner who has not onboarded yet, minted like global-setup does. */
  async function makeOwner() {
    const t = tag();
    const user = await prisma.user.create({
      data: { name: `Owner ${t}`, email: `owner-${t}@onboard.test`, role: 'OWNER' },
    });
    const token = `onb-session-${t}`;
    await prisma.session.create({
      data: {
        id: randomUUID(),
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 365 * DAY),
      },
    });
    return { user, headers: { Authorization: `Bearer ${token}` } };
  }

  const body = (extra: Record<string, unknown> = {}) => ({
    shopName: `Shop ${tag()}`,
    city: 'Karachi',
    market: 'Saddar',
    phone: mobile(),
    branchName: 'Main Counter',
    acceptTerms: true,
    ...extra,
  });

  async function onboard(extra: Record<string, unknown> = {}) {
    const owner = await makeOwner();
    const payload = body(extra);
    const res = await http()
      .post('/onboard/onboarding')
      .set(owner.headers)
      .send(payload);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const businessId = res.body.business.id as string;
    const branch = await prisma.branch.findFirstOrThrow({ where: { businessId } });
    return {
      owner: owner.user,
      payload,
      res,
      businessId,
      branchId: branch.id,
      auth: { Authorization: `Bearer ${res.body.accessToken}` },
    };
  }

  describe('POST /onboard/onboarding', () => {
    it('creates a TRIAL business with branch, alert email and feedback task', async () => {
      const t = await onboard();
      expect(typeof t.res.body.accessToken).toBe('string');
      expect(t.res.body.trialEndsAt).toBeTruthy();

      const biz = await prisma.business.findUniqueOrThrow({
        where: { id: t.businessId },
        include: { subscription: { include: { plan: true } } },
      });
      expect(biz.name).toBe(t.payload.shopName);
      expect(biz.city).toBe('Karachi');
      expect(biz.market).toBe('Saddar');
      expect(biz.termsAcceptedAt).not.toBeNull();
      expect(biz.sampleDataLoaded).toBe(false);
      expect(biz.followUpStatus).toBe('NEW');
      expect(biz.slug).toMatch(/^shop-/);
      expect(biz.subscription?.status).toBe('TRIALING');
      expect(biz.subscription?.plan.code).toBe('TRIAL');
      const days = Math.round(
        (biz.subscription!.trialEndsAt!.getTime() - Date.now()) / DAY,
      );
      expect(days).toBe(30);

      const branches = await prisma.branch.findMany({ where: { businessId: t.businessId } });
      expect(branches.map((b) => b.name)).toEqual(['Main Counter']);

      const owner = await prisma.user.findUniqueOrThrow({ where: { id: t.owner.id } });
      expect(owner.role).toBe('OWNER');
      expect(owner.businessId).toBe(t.businessId);

      const alert = await prisma.emailLog.findFirst({
        where: { businessId: t.businessId, template: 'agency-signup-alert' },
      });
      expect(alert?.to).toBe(ALERT_EMAIL);
      expect(alert?.status).toBe('SENT');
      const alertData = (alert!.payload as { data: { waLink: string } }).data;
      expect(alertData.waLink).toBe(
        `https://wa.me/92${t.payload.phone.slice(1)}`,
      );
      const welcome = await prisma.emailLog.count({
        where: { businessId: t.businessId, template: 'welcome', to: t.owner.email },
      });
      expect(welcome).toBe(1);

      const task = await prisma.agencyTask.findFirstOrThrow({
        where: { businessId: t.businessId, type: 'FEEDBACK_CALL' },
      });
      expect(task.status).toBe('OPEN');
      expect(Math.round((task.dueAt.getTime() - Date.now()) / DAY)).toBe(3);

      expect(
        await prisma.lifecycleMessage.count({
          where: { businessId: t.businessId, key: 'trial-day0' },
        }),
      ).toBe(1);

      // The returned token already works against the new tenant.
      const checklist = await http().get('/onboard/checklist').set(t.auth);
      expect(checklist.status).toBe(200);
    });

    it('rejects a missing phone, a bad phone and missing acceptTerms with 400', async () => {
      const owner = await makeOwner();
      const noPhone: Record<string, unknown> = body();
      delete noPhone.phone;
      const r1 = await http().post('/onboard/onboarding').set(owner.headers).send(noPhone);
      expect(r1.status).toBe(400);

      const r2 = await http()
        .post('/onboard/onboarding')
        .set(owner.headers)
        .send(body({ phone: '12345' }));
      expect(r2.status).toBe(400);

      const noTerms: Record<string, unknown> = body();
      delete noTerms.acceptTerms;
      const r3 = await http().post('/onboard/onboarding').set(owner.headers).send(noTerms);
      expect(r3.status).toBe(400);

      const falseTerms = await http()
        .post('/onboard/onboarding')
        .set(owner.headers)
        .send(body({ acceptTerms: false }));
      expect(falseTerms.status).toBe(400);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } });
      expect(user.businessId).toBeNull();
    });

    it('accepts +92 phone numbers and normalises them', async () => {
      const t = await onboard({ phone: '+92 321 1234567' });
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.phone).toBe('03211234567');
    });

    it('refuses a second onboarding for the same user with 409', async () => {
      const t = await onboard();
      const again = await http()
        .post('/onboard/onboarding')
        .set(t.auth)
        .send(body());
      expect(again.status).toBe(409);
    });
  });

  describe('sample data pack', () => {
    it('loads 10 demo products and 2 demo customers, and wipe removes only them', async () => {
      const t = await onboard({ loadSampleData: true });
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.sampleDataLoaded).toBe(true);

      const products = await prisma.product.findMany({
        where: { businessId: t.businessId },
        include: { instances: true },
      });
      expect(products).toHaveLength(10);
      for (const p of products) {
        expect(p.name.startsWith('Demo: ')).toBe(true);
        expect(p.instances.length).toBeGreaterThanOrEqual(1);
        expect(p.instances.length).toBeLessThanOrEqual(3);
        expect(p.instances.every((i) => i.branchId === t.branchId)).toBe(true);
      }
      const customers = await prisma.customer.findMany({ where: { businessId: t.businessId } });
      expect(customers.map((c) => c.name).sort()).toEqual([
        'Demo Customer 1',
        'Demo Customer 2',
      ]);

      // Real rows added next to the demo ones must survive the wipe.
      const real = await prisma.product.create({
        data: {
          name: 'Real Product',
          sku: `REAL-${tag()}`,
          basePrice: 100,
          businessId: t.businessId,
          branchId: t.branchId,
        },
      });
      const realCustomer = await prisma.customer.create({
        data: { name: 'Real Customer', phone: '03001234567', businessId: t.businessId },
      });

      const wipe = await http().post('/onboard/sample-data/wipe').set(t.auth);
      expect(wipe.status, JSON.stringify(wipe.body)).toBe(201);

      const live = await prisma.product.findMany({
        where: { businessId: t.businessId, deletedAt: null },
      });
      expect(live.map((p) => p.id)).toEqual([real.id]);
      const liveCustomers = await prisma.customer.findMany({
        where: { businessId: t.businessId, deletedAt: null },
      });
      expect(liveCustomers.map((c) => c.id)).toEqual([realCustomer.id]);
      expect(
        await prisma.productInstance.count({
          where: { product: { businessId: t.businessId, name: { startsWith: 'Demo: ' } } },
        }),
      ).toBe(0);
      const after = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(after.sampleDataLoaded).toBe(false);

      const again = await http().post('/onboard/sample-data/wipe').set(t.auth);
      expect(again.status).toBe(400);
    });

    it('refuses the wipe with 409 once a demo product has a sale', async () => {
      const t = await onboard({ loadSampleData: true });
      const demo = await prisma.product.findFirstOrThrow({
        where: { businessId: t.businessId },
      });
      const sale = await http()
        .post('/order/neworder')
        .set({ ...t.auth, 'x-branch-id': t.branchId })
        .send({
          walkInName: 'Walk In',
          items: [{ productId: demo.id, quantity: 1, price: 100 }],
          amountPaid: 100,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(sale.status, JSON.stringify(sale.body)).toBeLessThan(300);

      const wipe = await http().post('/onboard/sample-data/wipe').set(t.auth);
      expect(wipe.status).toBe(409);
      expect(
        await prisma.product.count({
          where: { businessId: t.businessId, deletedAt: null },
        }),
      ).toBe(10);
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.sampleDataLoaded).toBe(true);
    });

    it('does not let another tenant or a non-owner wipe', async () => {
      const a = await onboard({ loadSampleData: true });
      const b = await onboard({ loadSampleData: true });
      await http().post('/onboard/sample-data/wipe').set(b.auth).expect(201);
      // Tenant A is untouched by tenant B's wipe.
      expect(
        await prisma.product.count({
          where: { businessId: a.businessId, deletedAt: null },
        }),
      ).toBe(10);
      const staff = await http()
        .post('/onboard/sample-data/wipe')
        .set(authHeader('staffA'));
      expect(staff.status).toBe(403);
    });
  });

  describe('checklist', () => {
    it('starts empty, ignores demo rows, and flips as real data appears', async () => {
      const t = await onboard({ loadSampleData: true });
      const get = async () => (await http().get('/onboard/checklist').set(t.auth)).body;
      const done = (c: { items: { key: string; done: boolean }[] }, key: string) =>
        c.items.find((i) => i.key === key)!.done;

      const start = await get();
      expect(start.total).toBe(5);
      expect(start.completed).toBe(0);
      expect(start.items.map((i: { key: string }) => i.key)).toEqual([
        'first_product',
        'first_sale',
        'udhar_customer',
        'staff_user',
        'notification_prefs',
      ]);

      const product = await prisma.product.create({
        data: {
          name: 'Real Soap',
          sku: `RS-${tag()}`,
          basePrice: 80,
          businessId: t.businessId,
          branchId: t.branchId,
        },
      });
      await prisma.productInstance.createMany({
        data: [{ productId: product.id, branchId: t.branchId, status: 'AVAILABLE' }],
      });
      const afterProduct = await get();
      expect(done(afterProduct, 'first_product')).toBe(true);
      expect(done(afterProduct, 'first_sale')).toBe(false);
      expect(afterProduct.completed).toBe(1);

      const sale = await http()
        .post('/order/neworder')
        .set({ ...t.auth, 'x-branch-id': t.branchId })
        .send({
          walkInName: 'Walk In',
          items: [{ productId: product.id, quantity: 1, price: 80 }],
          amountPaid: 80,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(sale.status, JSON.stringify(sale.body)).toBeLessThan(300);
      const afterSale = await get();
      expect(done(afterSale, 'first_sale')).toBe(true);
      expect(afterSale.completed).toBe(2);

      // A khata entry for a demo customer does not count; a real one does.
      const demoCustomer = await prisma.customer.findFirstOrThrow({
        where: { businessId: t.businessId, name: 'Demo Customer 1' },
      });
      await prisma.khataEntry.create({
        data: {
          businessId: t.businessId,
          direction: 'RECEIVABLE',
          partyType: 'CUSTOMER',
          customerId: demoCustomer.id,
          partyName: 'Demo Customer 1',
          amount: 500,
          dueDate: new Date(Date.now() + 7 * DAY),
          createdById: t.owner.id,
        },
      });
      expect(done(await get(), 'udhar_customer')).toBe(false);
      await prisma.khataEntry.create({
        data: {
          businessId: t.businessId,
          direction: 'RECEIVABLE',
          partyType: 'CUSTOMER',
          partyName: 'Real Buyer',
          amount: 300,
          dueDate: new Date(Date.now() + 7 * DAY),
          createdById: t.owner.id,
        },
      });
      expect(done(await get(), 'udhar_customer')).toBe(true);

      const dismiss = await http().post('/onboard/checklist/dismiss').set(t.auth);
      expect(dismiss.status).toBe(201);
      const dismissed = await get();
      expect(dismissed.dismissed).toBe(true);
      // Dismissing keeps the sample pack tracking intact.
      expect(
        (await http().post('/onboard/sample-data/wipe').set(t.auth)).status,
      ).toBe(409);
    });
  });

  describe('trial lifecycle job', () => {
    it('sends each day-N step once, catches up, and goes read-only at day 30', async () => {
      const t = await onboard();
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: t.businessId },
      });
      const start = sub.currentPeriodStart.getTime();
      const at = (days: number) => new Date(start + days * DAY + 3_600_000);
      const sent = (template: string) =>
        prisma.emailLog.count({
          where: { businessId: t.businessId, template, to: t.owner.email },
        });
      const tasks = (type: 'FOLLOW_UP' | 'CONVERSION') =>
        prisma.agencyTask.count({ where: { businessId: t.businessId, type } });
      const runTwice = async (days: number) => {
        await lifecycle.run(at(days), { businessId: t.businessId });
        await lifecycle.run(at(days), { businessId: t.businessId });
      };

      // Day 1 and 2: nothing yet.
      await runTwice(2);
      expect(await sent('trial-tips')).toBe(0);

      await runTwice(3);
      expect(await sent('trial-tips')).toBe(1);
      expect(await tasks('FOLLOW_UP')).toBe(1);

      // Real usage shows up in the day-7 email.
      const product = await prisma.product.create({
        data: { name: 'Item', sku: `LC-${tag()}`, basePrice: 250, businessId: t.businessId },
      });
      await prisma.productInstance.create({
        data: { productId: product.id, branchId: t.branchId, status: 'AVAILABLE' },
      });
      await http()
        .post('/order/neworder')
        .set({ ...t.auth, 'x-branch-id': t.branchId })
        .send({
          walkInName: 'Walk In',
          items: [{ productId: product.id, quantity: 1, price: 250 }],
          amountPaid: 250,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        })
        .expect((r) => expect(r.status).toBeLessThan(300));
      await runTwice(7);
      expect(await sent('trial-usage')).toBe(1);
      const usage = await prisma.emailLog.findFirstOrThrow({
        where: { businessId: t.businessId, template: 'trial-usage' },
      });
      const usageData = (
        usage.payload as { data: { salesCount: number; salesTotal: string; duesTracked: number } }
      ).data;
      expect(usageData.salesCount).toBe(1);
      expect(usageData.salesTotal).toBe('250.00');
      expect(usageData.duesTracked).toBe(0);

      await runTwice(25);
      expect(await sent('trial-ending')).toBe(1);
      expect(await tasks('CONVERSION')).toBe(1);
      const ending = await prisma.emailLog.findFirstOrThrow({
        where: { businessId: t.businessId, template: 'trial-ending' },
      });
      expect((ending.payload as { data: { daysLeft: number } }).data.daysLeft).toBe(5);
      // Still writable before day 30.
      const before = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: t.businessId },
      });
      expect(before.status).toBe('TRIALING');

      await runTwice(30);
      expect(await sent('trial-ended')).toBe(1);
      const after = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: t.businessId },
      });
      expect(after.status).toBe('READ_ONLY');
      const write = await http()
        .post('/product/addcategory')
        .set({ ...t.auth, 'x-branch-id': t.branchId })
        .send({ name: 'Blocked' });
      expect(write.status).toBe(403);
      expect(write.body.message).toBe(READ_ONLY_MESSAGE);
      // Reads still work.
      await http().get('/onboard/checklist').set(t.auth).expect(200);

      // A tenant already READ_ONLY keeps getting the later steps.
      await runTwice(45);
      expect(await sent('trial-reminder')).toBe(1);
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.followUpStatus).toBe('LOST');

      // Every key exactly once, and nothing was sent a second time.
      const keys = await prisma.lifecycleMessage.findMany({
        where: { businessId: t.businessId },
        select: { key: true },
      });
      expect(keys.map((k) => k.key).sort()).toEqual([
        'trial-day0',
        'trial-day25',
        'trial-day3',
        'trial-day30',
        'trial-day45',
        'trial-day7',
      ]);
      for (const template of [
        'trial-tips',
        'trial-usage',
        'trial-ending',
        'trial-ended',
        'trial-reminder',
      ]) {
        expect(await sent(template), template).toBe(1);
      }
    });

    it('catches up a missed day but does not spam old informational steps', async () => {
      const t = await onboard();
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: t.businessId },
      });
      const late = new Date(sub.currentPeriodStart.getTime() + 31 * DAY + 3_600_000);
      await lifecycle.run(late, { businessId: t.businessId });
      const templates = (
        await prisma.emailLog.findMany({
          where: { businessId: t.businessId, to: t.owner.email },
          select: { template: true },
        })
      ).map((e) => e.template);
      expect(templates).toContain('trial-ended');
      expect(templates).not.toContain('trial-tips');
      const now = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: t.businessId },
      });
      expect(now.status).toBe('READ_ONLY');
    });

    it('leaves a converted (ACTIVE) tenant alone', async () => {
      const t = await onboard();
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: t.businessId },
      });
      await prisma.subscription.update({
        where: { businessId: t.businessId },
        data: { status: 'ACTIVE' },
      });
      await lifecycle.run(new Date(sub.currentPeriodStart.getTime() + 46 * DAY), {
        businessId: t.businessId,
      });
      expect(
        await prisma.lifecycleMessage.count({
          where: { businessId: t.businessId, key: { not: 'trial-day0' } },
        }),
      ).toBe(0);
    });
  });

  describe('agency signups and tasks', () => {
    it('lists signups with owner info and updates follow-up', async () => {
      const t = await onboard({ source: 'whatsapp' });
      const list = await http().get('/agency/signups').set(authHeader('superAdmin'));
      expect(list.status).toBe(200);
      const row = list.body.find(
        (r: { businessId: string }) => r.businessId === t.businessId,
      );
      expect(row).toMatchObject({
        businessName: t.payload.shopName,
        ownerName: t.owner.name,
        ownerEmail: t.owner.email,
        city: 'Karachi',
        market: 'Saddar',
        source: 'whatsapp',
        followUpStatus: 'NEW',
        trialDaysLeft: 30,
      });
      expect(row.phone).toBe(t.payload.phone);

      const patch = await http()
        .patch(`/agency/signups/${t.businessId}`)
        .set(authHeader('superAdmin'))
        .send({ followUpStatus: 'CONTACTED', followUpNotes: 'Called, wants demo' });
      expect(patch.status).toBe(200);
      expect(patch.body.followUpStatus).toBe('CONTACTED');

      const filtered = await http()
        .get('/agency/signups?status=CONTACTED')
        .set(authHeader('superAdmin'));
      expect(
        filtered.body.some((r: { businessId: string }) => r.businessId === t.businessId),
      ).toBe(true);
      expect(
        filtered.body.every((r: { followUpStatus: string }) => r.followUpStatus === 'CONTACTED'),
      ).toBe(true);

      const future = await http()
        .get(`/agency/signups?from=${new Date(Date.now() + DAY).toISOString()}`)
        .set(authHeader('superAdmin'));
      expect(future.body).toEqual([]);

      const bad = await http()
        .patch(`/agency/signups/${t.businessId}`)
        .set(authHeader('superAdmin'))
        .send({ followUpStatus: 'NOPE' });
      expect(bad.status).toBe(400);

      const missing = await http()
        .patch(`/agency/signups/${randomUUID()}`)
        .set(authHeader('superAdmin'))
        .send({ followUpStatus: 'LOST' });
      expect(missing.status).toBe(404);
    });

    it('lists and completes tasks', async () => {
      const t = await onboard();
      const open = await http().get('/agency/tasks?status=OPEN').set(authHeader('superAdmin'));
      expect(open.status).toBe(200);
      const task = open.body.find(
        (x: { businessId: string; type: string }) =>
          x.businessId === t.businessId && x.type === 'FEEDBACK_CALL',
      );
      expect(task).toBeTruthy();

      const done = await http()
        .patch(`/agency/tasks/${task.id}`)
        .set(authHeader('superAdmin'))
        .send({ status: 'DONE', notes: 'Happy customer' });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('DONE');
      expect(done.body.notes).toBe('Happy customer');
      expect(done.body.doneAt).toBeTruthy();

      const stillOpen = await http()
        .get('/agency/tasks?status=OPEN')
        .set(authHeader('superAdmin'));
      expect(stillOpen.body.some((x: { id: string }) => x.id === task.id)).toBe(false);

      const bad = await http()
        .patch(`/agency/tasks/${task.id}`)
        .set(authHeader('superAdmin'))
        .send({ status: 'OPEN' });
      expect(bad.status).toBe(400);
      const missing = await http()
        .patch(`/agency/tasks/${randomUUID()}`)
        .set(authHeader('superAdmin'))
        .send({ status: 'DONE' });
      expect(missing.status).toBe(404);
    });

    it('returns 403 for non super-admins on signups and tasks', async () => {
      const t = await onboard();
      const task = await prisma.agencyTask.findFirstOrThrow({
        where: { businessId: t.businessId },
      });
      for (const headers of [authHeader('ownerA'), authHeader('staffA'), t.auth]) {
        expect((await http().get('/agency/signups').set(headers)).status).toBe(403);
        expect(
          (
            await http()
              .patch(`/agency/signups/${t.businessId}`)
              .set(headers)
              .send({ followUpStatus: 'LOST' })
          ).status,
        ).toBe(403);
        expect((await http().get('/agency/tasks').set(headers)).status).toBe(403);
        expect(
          (
            await http()
              .patch(`/agency/tasks/${task.id}`)
              .set(headers)
              .send({ status: 'DONE' })
          ).status,
        ).toBe(403);
      }
      expect((await http().get('/agency/signups')).status).toBe(401);
    });
  });
});
