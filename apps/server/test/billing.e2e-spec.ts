import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader } from './setup/auth';
import { MailService } from '../src/mail/mail.service';
import type { MailTransport, OutgoingMail } from '../src/mail/mail.types';
import { addMonthsUtc } from '../src/plans/subscriptions.service';
import { RenewalsService } from '../src/billing/renewals.service';

const DAY = 86_400_000;
const rand = () => randomUUID().slice(0, 8);
const admin = () => authHeader('superAdmin');

describe('Agency billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mail: MailService;
  let renewals: RenewalsService;
  const sent: OutgoingMail[] = [];
  let monthlyPlanId: string;
  let unpricedPlanId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.AGENCY_NAME = 'Test Agency';
    process.env.AGENCY_BANK_DETAILS = 'HBL 1234-5678';
    app = await createTestApp();
    prisma = new PrismaClient();
    mail = app.get(MailService);
    renewals = app.get(RenewalsService);
    const transport: MailTransport = {
      send: async (m) => {
        sent.push(m);
        return { providerId: 'test' };
      },
    };
    mail.setTransport(transport);

    const tag = rand();
    monthlyPlanId = (
      await prisma.plan.create({
        data: {
          code: `BILL-${tag}`,
          name: 'Billing Test',
          priceMonthly: '2500.50',
          priceYearly: '25000.00',
          isPublic: false,
        },
      })
    ).id;
    unpricedPlanId = (
      await prisma.plan.create({
        data: { code: `BILL-NP-${tag}`, name: 'No Price', isPublic: false },
      })
    ).id;
  });

  afterAll(async () => {
    mail.setTransport(null);
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  async function makeTenant(opts: { periodEnd?: Date | null; status?: 'ACTIVE' | 'TRIALING' } = {}) {
    const tag = rand();
    const owner = await prisma.user.create({
      data: {
        name: `Owner ${tag}`,
        email: `owner-${tag}@billing.test`,
        phone: '0300-1234567',
        role: 'OWNER',
      },
    });
    const business = await prisma.business.create({
      data: { name: `Billing ${tag}`, slug: `billing-${tag}`, ownerId: owner.id },
    });
    await prisma.user.update({ where: { id: owner.id }, data: { businessId: business.id } });
    if (opts.periodEnd !== null) {
      await prisma.subscription.create({
        data: {
          businessId: business.id,
          planId: monthlyPlanId,
          status: opts.status ?? 'ACTIVE',
          currentPeriodStart: new Date(Date.now() - 20 * DAY),
          currentPeriodEnd: opts.periodEnd ?? new Date(Date.now() + 5 * DAY),
        },
      });
    }
    return { owner, businessId: business.id, name: business.name };
  }

  async function createInvoice(body: Record<string, unknown>, expected = 201) {
    const res = await http().post('/agency/billing/invoices').set(admin()).send(body);
    expect(res.status).toBe(expected);
    return res.body;
  }

  async function sendInvoice(id: string) {
    const res = await http().post(`/agency/billing/invoices/${id}/send`).set(admin());
    expect(res.status).toBe(201);
    return res.body;
  }

  async function pay(id: string, amount: string | number, expected = 201) {
    const res = await http()
      .post(`/agency/billing/invoices/${id}/payments`)
      .set(admin())
      .send({ amount, method: 'BANK_TRANSFER', reference: 'TXN-1' });
    expect(res.status).toBe(expected);
    return res.body;
  }

  describe('creation and numbering', () => {
    it('prefills the line from the plan price, DRAFT, with a public token', async () => {
      const t = await makeTenant();
      const inv = await createInvoice({
        businessId: t.businessId,
        billingCycle: 'MONTHLY',
        planId: monthlyPlanId,
      });
      expect(inv.status).toBe('DRAFT');
      expect(inv.number).toMatch(/^DK-\d{4}-\d{4}$/);
      expect(inv.lines).toHaveLength(1);
      expect(inv.lines[0]).toMatchObject({ quantity: 1, unitPrice: 2500.5, amount: 2500.5 });
      expect(inv.subtotal).toBe(2500.5);
      expect(inv.total).toBe(2500.5);
      expect(inv.publicToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(inv.publicUrl).toMatch(/\/i\/.+/);
    });

    it('priceOverride wins over the plan price', async () => {
      const t = await makeTenant();
      await prisma.subscription.update({
        where: { businessId: t.businessId },
        data: { priceOverride: '1999.99' },
      });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY' });
      expect(inv.total).toBe(1999.99);
    });

    it('totals are Decimal-correct with discount (3 x 0.10 + 10 x 33.33 - 0.10)', async () => {
      const t = await makeTenant();
      const inv = await createInvoice({
        businessId: t.businessId,
        billingCycle: 'MONTHLY',
        lines: [
          { description: 'Setup', quantity: 3, unitPrice: '0.10' },
          { description: 'Training', quantity: 10, unitPrice: 33.33 },
        ],
        discount: '0.10',
      });
      expect(inv.subtotal).toBe(333.6);
      expect(inv.discount).toBe(0.1);
      expect(inv.total).toBe(333.5);
      const row = await prisma.agencyInvoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.total.toFixed(2)).toBe('333.50');
    });

    it('rejects bad input', async () => {
      const t = await makeTenant();
      await createInvoice({ businessId: randomUUID(), billingCycle: 'MONTHLY', planId: monthlyPlanId }, 404);
      await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: unpricedPlanId }, 400);
      await createInvoice(
        {
          businessId: t.businessId,
          billingCycle: 'MONTHLY',
          lines: [{ description: 'x', quantity: 1, unitPrice: '10' }],
          discount: '11',
        },
        400,
      );
      await createInvoice(
        {
          businessId: t.businessId,
          billingCycle: 'MONTHLY',
          lines: [{ description: 'x', quantity: 1, unitPrice: '1.999' }],
        },
        400,
      );
      await createInvoice({ businessId: t.businessId, billingCycle: 'WEEKLY' }, 400);
    });

    it('10 concurrent creates get 10 unique, consecutive numbers', async () => {
      const t = await makeTenant();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId }),
        ),
      );
      const numbers = results.map((r) => r.number as string);
      expect(new Set(numbers).size).toBe(10);
      const seq = numbers.map((n) => Number(n.split('-')[2])).sort((a, b) => a - b);
      expect(seq[9] - seq[0]).toBe(9);
      const year = new Date(Date.now() + 5 * 3_600_000).getUTCFullYear();
      const row = await prisma.agencyInvoiceSequence.findUniqueOrThrow({ where: { year } });
      expect(row.last).toBeGreaterThanOrEqual(seq[9]);
    });
  });

  describe('send, pdf and public link', () => {
    it('emails the owner with the PDF attached, marks SENT and returns a WhatsApp link', async () => {
      const t = await makeTenant();
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      const before = sent.length;
      const out = await sendInvoice(inv.id);

      expect(out.invoice.status).toBe('SENT');
      expect(out.invoice.sentAt).toBeTruthy();
      expect(out.whatsappUrl).toMatch(/^https:\/\/wa\.me\/923001234567\?text=/);
      expect(decodeURIComponent(out.whatsappUrl)).toContain(inv.publicUrl);

      expect(sent.length).toBe(before + 1);
      const mailOut = sent[sent.length - 1];
      expect(mailOut.to).toBe(t.owner.email);
      expect(mailOut.attachments?.[0].filename).toBe(`${inv.number}.pdf`);
      expect(mailOut.attachments?.[0].content.subarray(0, 4).toString()).toBe('%PDF');
      expect(mailOut.html + mailOut.text).toContain(inv.publicUrl);

      const log = await prisma.emailLog.findFirstOrThrow({
        where: { businessId: t.businessId, template: 'invoice' },
      });
      expect(log.status).toBe('SENT');
      expect(log.to).toBe(t.owner.email);
      const payload = log.payload as { attachments?: { filename: string }[] };
      expect(payload.attachments).toHaveLength(1);
    });

    it('serves the admin PDF', async () => {
      const t = await makeTenant();
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      const res = await http()
        .get(`/agency/billing/invoices/${inv.id}/pdf`)
        .set(admin())
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('the public token returns only that invoice, without auth', async () => {
      const a = await makeTenant();
      const b = await makeTenant();
      const invA = await createInvoice({ businessId: a.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      const invB = await createInvoice({ businessId: b.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      await sendInvoice(invA.id);
      await sendInvoice(invB.id);

      const res = await http().get(`/public/invoices/${invA.publicToken}`);
      expect(res.status).toBe(200);
      expect(res.body.number).toBe(invA.number);
      expect(res.body.businessName).toBe(a.name);
      expect(res.body.total).toBe(2500.5);
      expect(res.body.agency).toMatchObject({ name: 'Test Agency', bank: 'HBL 1234-5678' });
      expect(JSON.stringify(res.body)).not.toContain(invB.number);
      expect(res.body.publicToken).toBeUndefined();

      const pdf = await http().get(`/public/invoices/${invA.publicToken}/pdf`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
    });

    it('wrong tokens, listing attempts and draft tokens are 404', async () => {
      const t = await makeTenant();
      const draft = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      expect((await http().get('/public/invoices/not-a-real-token-0123456789abcdef')).status).toBe(404);
      expect((await http().get('/public/invoices/x')).status).toBe(404);
      expect((await http().get('/public/invoices/not-a-real-token-0123456789abcdef/pdf')).status).toBe(404);
      expect((await http().get('/public/invoices')).status).toBe(404);
      expect((await http().get(`/public/invoices/${draft.publicToken}`)).status).toBe(404);
    });

    it('void blocks further sending and payments', async () => {
      const t = await makeTenant();
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      const res = await http().post(`/agency/billing/invoices/${inv.id}/void`).set(admin());
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('VOID');
      expect((await http().post(`/agency/billing/invoices/${inv.id}/send`).set(admin())).status).toBe(400);
      await pay(inv.id, 100, 400);
    });
  });

  describe('listing', () => {
    it('filters invoices by business and status, and lists payments', async () => {
      const t = await makeTenant();
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      await sendInvoice(inv.id);
      await pay(inv.id, 100);

      const list = await http().get(`/agency/billing/invoices?businessId=${t.businessId}&status=SENT`).set(admin());
      expect(list.status).toBe(200);
      expect(list.body.map((i: { id: string }) => i.id)).toEqual([inv.id]);
      const none = await http().get(`/agency/billing/invoices?businessId=${t.businessId}&status=PAID`).set(admin());
      expect(none.body).toEqual([]);

      const one = await http().get(`/agency/billing/invoices/${inv.id}`).set(admin());
      expect(one.status).toBe(200);
      expect(one.body.payments).toHaveLength(1);
      expect((await http().get(`/agency/billing/invoices/${randomUUID()}`).set(admin())).status).toBe(404);

      const pays = await http().get(`/agency/billing/payments?businessId=${t.businessId}`).set(admin());
      expect(pays.status).toBe(200);
      expect(pays.body).toHaveLength(1);
      expect(pays.body[0].amount).toBe(100);
    });
  });

  describe('payments', () => {
    it('a partial payment keeps the invoice SENT and does not extend', async () => {
      const periodEnd = new Date(Date.now() + 5 * DAY);
      const t = await makeTenant({ periodEnd });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      await sendInvoice(inv.id);
      const p = await pay(inv.id, '1000.00');
      expect(p.invoiceStatus).toBe('SENT');
      expect(p.method).toBe('BANK_TRANSFER');

      const row = await prisma.agencyInvoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.status).toBe('SENT');
      expect(row.paidAt).toBeNull();
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
      expect(await prisma.emailLog.count({ where: { businessId: t.businessId, template: 'payment-receipt' } })).toBe(0);
    });

    it('the remaining balance pays the invoice, extends and sends a receipt', async () => {
      const periodEnd = new Date(Date.now() + 5 * DAY);
      const t = await makeTenant({ periodEnd });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      await sendInvoice(inv.id);
      await pay(inv.id, '1000.00');
      const p = await pay(inv.id, '1500.50');
      expect(p.invoiceStatus).toBe('PAID');

      const row = await prisma.agencyInvoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.status).toBe('PAID');
      expect(row.paidAt).not.toBeNull();
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.currentPeriodEnd?.getTime()).toBe(addMonthsUtc(periodEnd, 1).getTime());
      expect(sub.status).toBe('ACTIVE');
      expect(await prisma.emailLog.count({ where: { businessId: t.businessId, template: 'payment-receipt' } })).toBe(1);
      // A paid invoice takes no more payments.
      await pay(inv.id, 1, 400);
    });

    it('monthly payment from an expired period extends from now', async () => {
      const t = await makeTenant({ periodEnd: new Date(Date.now() - 10 * DAY) });
      await prisma.subscription.update({
        where: { businessId: t.businessId },
        data: { status: 'READ_ONLY' },
      });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      await sendInvoice(inv.id);
      const t0 = Date.now();
      await pay(inv.id, 2500.5);
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      const expected = addMonthsUtc(new Date(t0), 1).getTime();
      expect(Math.abs((sub.currentPeriodEnd as Date).getTime() - expected)).toBeLessThan(60_000);
      expect(sub.status).toBe('ACTIVE');
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.status).toBe('ACTIVE');
    });

    it('yearly payment from a future period end extends 12 months from that end', async () => {
      const periodEnd = new Date(Date.now() + 40 * DAY);
      const t = await makeTenant({ periodEnd });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'YEARLY', planId: monthlyPlanId });
      expect(inv.total).toBe(25000);
      await sendInvoice(inv.id);
      await pay(inv.id, 25000);
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.currentPeriodEnd?.getTime()).toBe(addMonthsUtc(periodEnd, 12).getTime());
      expect(sub.billingCycle).toBe('YEARLY');
    });

    it('yearly payment from an expired period extends 12 months from now', async () => {
      const t = await makeTenant({ periodEnd: new Date(Date.now() - 3 * DAY) });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'YEARLY', planId: monthlyPlanId });
      await sendInvoice(inv.id);
      const t0 = Date.now();
      await pay(inv.id, '25000');
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      const expected = addMonthsUtc(new Date(t0), 12).getTime();
      expect(Math.abs((sub.currentPeriodEnd as Date).getTime() - expected)).toBeLessThan(60_000);
    });

    it('multiple periods multiply the extension and the price', async () => {
      const periodEnd = new Date(Date.now() + 10 * DAY);
      const t = await makeTenant({ periodEnd });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId, periods: 3 });
      expect(inv.total).toBe(7501.5);
      await sendInvoice(inv.id);
      await pay(inv.id, 7501.5);
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.currentPeriodEnd?.getTime()).toBe(addMonthsUtc(periodEnd, 3).getTime());
    });

    it('concurrent full payments extend only once', async () => {
      const periodEnd = new Date(Date.now() + 10 * DAY);
      const t = await makeTenant({ periodEnd });
      const inv = await createInvoice({ businessId: t.businessId, billingCycle: 'MONTHLY', planId: monthlyPlanId });
      await sendInvoice(inv.id);
      const results = await Promise.all(
        [1, 2].map(() =>
          http()
            .post(`/agency/billing/invoices/${inv.id}/payments`)
            .set(admin())
            .send({ amount: 2500.5, method: 'CASH' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.currentPeriodEnd?.getTime()).toBe(addMonthsUtc(periodEnd, 1).getTime());
    });
  });

  describe('renewal job', () => {
    it('invoices once (idempotent), then OVERDUE + PAST_DUE, then READ_ONLY after grace', async () => {
      const now = new Date();
      const t = await makeTenant({ periodEnd: new Date(now.getTime() + 3 * DAY) });
      const scope = { businessId: t.businessId };

      const first = await renewals.runRenewals(now, scope);
      expect(first).toMatchObject({ created: 1, sent: 1 });
      const second = await renewals.runRenewals(now, scope);
      expect(second).toMatchObject({ created: 0, sent: 0, overdue: 0, readOnly: 0 });

      const invoices = await prisma.agencyInvoice.findMany({ where: { businessId: t.businessId } });
      expect(invoices).toHaveLength(1);
      const inv = invoices[0];
      expect(inv.status).toBe('SENT');
      expect(inv.total.toFixed(2)).toBe('2500.50');
      expect(inv.periodStart.getTime()).toBe(now.getTime() + 3 * DAY);
      expect(await prisma.emailLog.count({ where: { businessId: t.businessId, template: 'invoice' } })).toBe(1);

      // Not yet overdue the day before the due date.
      const early = await renewals.runRenewals(new Date(inv.dueDate.getTime() - DAY), scope);
      expect(early.overdue).toBe(0);

      const lateNow = new Date(inv.dueDate.getTime() + 1000);
      const overdue = await renewals.runRenewals(lateNow, scope);
      expect(overdue.overdue).toBe(1);
      const again = await renewals.runRenewals(lateNow, scope);
      expect(again.overdue).toBe(0);

      let sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.status).toBe('PAST_DUE');
      expect(sub.graceEndsAt?.getTime()).toBe(inv.dueDate.getTime() + 7 * DAY);
      expect((await prisma.agencyInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('OVERDUE');

      // Still inside the grace window.
      const inGrace = await renewals.runRenewals(new Date(inv.dueDate.getTime() + 3 * DAY), scope);
      expect(inGrace.readOnly).toBe(0);

      const afterGrace = new Date(inv.dueDate.getTime() + 7 * DAY + 1000);
      const ro = await renewals.runRenewals(afterGrace, scope);
      expect(ro.readOnly).toBe(1);
      expect((await renewals.runRenewals(afterGrace, scope)).readOnly).toBe(0);
      sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.status).toBe('READ_ONLY');
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: t.businessId } });
      expect(biz.status).toBe('READ_ONLY');

      // Paying the overdue invoice reactivates the tenant.
      await pay(inv.id, 2500.5);
      sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.businessId } });
      expect(sub.status).toBe('ACTIVE');
      expect(sub.graceEndsAt).toBeNull();
    });

    it('does not invoice trials, far-off periods or unpriced plans', async () => {
      const now = new Date();
      const trial = await makeTenant({ periodEnd: new Date(now.getTime() + 3 * DAY), status: 'TRIALING' });
      const far = await makeTenant({ periodEnd: new Date(now.getTime() + 30 * DAY) });
      const unpriced = await makeTenant({ periodEnd: new Date(now.getTime() + 2 * DAY) });
      await prisma.subscription.update({ where: { businessId: unpriced.businessId }, data: { planId: unpricedPlanId } });
      for (const t of [trial, far, unpriced]) {
        const s = await renewals.runRenewals(now, { businessId: t.businessId });
        expect(s.created).toBe(0);
        expect(await prisma.agencyInvoice.count({ where: { businessId: t.businessId } })).toBe(0);
      }
    });
  });

  describe('access control', () => {
    const id = randomUUID();
    const routes: [string, string][] = [
      ['post', '/agency/billing/invoices'],
      ['get', '/agency/billing/invoices'],
      ['get', `/agency/billing/invoices/${id}`],
      ['get', `/agency/billing/invoices/${id}/pdf`],
      ['post', `/agency/billing/invoices/${id}/send`],
      ['post', `/agency/billing/invoices/${id}/void`],
      ['post', `/agency/billing/invoices/${id}/payments`],
      ['get', '/agency/billing/payments'],
    ];

    it.each(['ownerA', 'managerA', 'staffA', 'ownerB'] as const)(
      '%s gets 403 on every /agency/billing route',
      async (user) => {
        for (const [method, url] of routes) {
          const req = (http() as unknown as Record<string, (u: string) => request.Test>)[method](url);
          const res = await req.set(authHeader(user)).send({});
          expect(res.status, `${method} ${url}`).toBe(403);
        }
      },
    );

    it('unauthenticated requests get 401', async () => {
      for (const [method, url] of routes) {
        const req = (http() as unknown as Record<string, (u: string) => request.Test>)[method](url);
        const res = await req.send({});
        expect(res.status, `${method} ${url}`).toBe(401);
      }
    });
  });
});
