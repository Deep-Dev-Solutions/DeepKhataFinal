import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { catalog } from '../../e2e/fixtures/catalog';
import { DuesService } from '../src/dues/dues.service';
import { normalizePkPhone } from '../src/dues/phone';

const { vendorPurchases, khataOther, creditOrder } = catalog;

type ApiDue = {
  entityType: string;
  entityId: string;
  amountOpen: number;
  ageDays: number;
  bucket: string;
  partyName: string;
  promiseDate: string | null;
  lastReminderAt: string | null;
};

describe('Dues (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let dues: DuesService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    dues = app.get(DuesService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const http = () => request(app.getHttpServer());

  async function createOwnEntry(overrides: Record<string, unknown> = {}) {
    const res = await http()
      .post('/khata-entries')
      .set(authHeader('ownerA'))
      .send({
        direction: 'RECEIVABLE',
        partyType: 'OTHER',
        partyName: 'Dues Spec Debtor',
        partyPhone: '0300-9998877',
        amount: 750,
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        ...overrides,
      })
      .expect(201);
    return res.body as { id: string };
  }

  describe('summary and lists', () => {
    it('summary reports the seeded payable and receivable totals', async () => {
      const res = await http().get('/dues/summary').set(authHeader('ownerA')).expect(200);
      // 15,000 (partly paid purchase, FIFO) + 12,000 (open purchase)
      expect(res.body.toPay).toBeGreaterThanOrEqual(27000);
      // 5,000 khata + 5,000 credit order, at minimum
      expect(res.body.toReceive).toBeGreaterThanOrEqual(10000);
    });

    it('payable list holds both seeded purchases with FIFO-reduced open amounts', async () => {
      const res = await http()
        .get('/dues?direction=payable')
        .set(authHeader('ownerA'))
        .expect(200);
      const items = res.body.items as ApiDue[];
      const a = items.find((i) => i.entityId === vendorPurchases.partlyPaidPurchaseId);
      const b = items.find((i) => i.entityId === vendorPurchases.openPurchaseId);
      expect(a?.entityType).toBe('VENDOR_PURCHASE');
      expect(a?.amountOpen).toBe(15000);
      expect(b?.entityType).toBe('VENDOR_PURCHASE');
      expect(b?.amountOpen).toBe(12000);
    });

    it('receivable list holds the seeded khata entry and credit order at Rs 5,000 each', async () => {
      const res = await http().get('/dues?direction=receivable').set(authHeader('ownerA')).expect(200);
      const items = res.body.items as ApiDue[];
      const k = items.find((i) => i.entityId === khataOther.entryId);
      const o = items.find((i) => i.entityId === creditOrder.orderId);
      expect(k?.entityType).toBe('KHATA_ENTRY');
      expect(k?.partyName).toBe('Malik Mobile');
      expect(k?.amountOpen).toBe(5000);
      expect(o?.entityType).toBe('ORDER');
      expect(o?.amountOpen).toBe(5000);
    });

    it('filters by bucket and search text', async () => {
      const res = await http()
        .get('/dues?direction=receivable&q=malik')
        .set(authHeader('ownerA'))
        .expect(200);
      const items = res.body.items as ApiDue[];
      const mine = items.find((i) => i.entityId === khataOther.entryId);
      expect(mine?.bucket).toBe('8-30');
      expect(items.every((i) => /malik/i.test(i.partyName))).toBe(true);

      const entry = await prisma.khataEntry.findUniqueOrThrow({ where: { id: khataOther.entryId } });
      const bucketed = await http()
        .get('/dues')
        .query({ direction: 'receivable', bucket: mine?.bucket })
        .set(authHeader('ownerA'))
        .expect(200);
      expect(
        (bucketed.body.items as ApiDue[]).some((i) => i.entityId === entry.id),
      ).toBe(true);
      const other = '90+';
      const empty = await http()
        .get('/dues')
        .query({ direction: 'receivable', bucket: other })
        .set(authHeader('ownerA'))
        .expect(200);
      expect(
        (empty.body.items as ApiDue[]).some((i) => i.entityId === entry.id),
      ).toBe(false);
    });

    it('rejects an invalid bucket and STAFF access', async () => {
      await http().get('/dues?bucket=bogus').set(authHeader('ownerA')).expect(400);
      await http().get('/dues/summary').set(authHeader('staffA')).expect(403);
      await http().get('/dues').set(authHeader('staffA')).expect(403);
    });

    it('tenant B never sees tenant A dues', async () => {
      const res = await http().get('/dues?direction=receivable').set(authHeader('ownerB')).expect(200);
      const ids = (res.body.items as ApiDue[]).map((i) => i.entityId);
      expect(ids).not.toContain(khataOther.entryId);
      expect(ids).not.toContain(creditOrder.orderId);
      const pay = await http().get('/dues?direction=payable').set(authHeader('ownerB')).expect(200);
      const payIds = (pay.body.items as ApiDue[]).map((i) => i.entityId);
      expect(payIds).not.toContain(vendorPurchases.openPurchaseId);
    });
  });

  describe('aging with a fixed clock', () => {
    it('places the seeded khata entry in 0-7 at age 7 and 8-30 at age 8', async () => {
      const entry = await prisma.khataEntry.findUniqueOrThrow({ where: { id: khataOther.entryId } });
      const day = 24 * 60 * 60 * 1000;

      const at7 = await dues.listOpen(tenants.A.id, undefined, new Date(entry.createdAt.getTime() + 7 * day));
      const i7 = at7.find((i) => i.entityId === khataOther.entryId);
      expect(i7?.ageDays).toBe(7);
      expect(i7?.bucket).toBe('0-7');

      const at8 = await dues.listOpen(tenants.A.id, undefined, new Date(entry.createdAt.getTime() + 8 * day));
      const i8 = at8.find((i) => i.entityId === khataOther.entryId);
      expect(i8?.ageDays).toBe(8);
      expect(i8?.bucket).toBe('8-30');

      const at31 = await dues.listOpen(tenants.A.id, 'RECEIVABLE', new Date(entry.createdAt.getTime() + 31 * day));
      expect(at31.find((i) => i.entityId === khataOther.entryId)?.bucket).toBe('31-90');
      const at91 = await dues.listOpen(tenants.A.id, 'RECEIVABLE', new Date(entry.createdAt.getTime() + 91 * day));
      expect(at91.find((i) => i.entityId === khataOther.entryId)?.bucket).toBe('90+');
    });

    it('direction filter excludes the other side', async () => {
      const rec = await dues.listOpen(tenants.A.id, 'RECEIVABLE');
      const pay = await dues.listOpen(tenants.A.id, 'PAYABLE');
      expect(rec.every((i) => i.direction === 'RECEIVABLE')).toBe(true);
      expect(pay.every((i) => i.direction === 'PAYABLE')).toBe(true);
      expect(pay.some((i) => i.entityId === vendorPurchases.openPurchaseId)).toBe(true);
    });
  });

  describe('promise and reminded', () => {
    it('records a promise and exposes promiseDate on the due item', async () => {
      const entry = await createOwnEntry({ partyName: 'Promise Spec Debtor' });
      const promised = '2031-03-15T07:00:00.000Z';
      const res = await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/promise`)
        .set(authHeader('managerA'))
        .send({ promisedDate: promised, note: 'will pay on Friday' })
        .expect(201);
      expect(res.body.kind).toBe('PROMISE');

      const row = await prisma.promiseToPay.findFirstOrThrow({ where: { entityId: entry.id } });
      expect(row.promisedDate.toISOString()).toBe(promised);
      expect(row.note).toBe('will pay on Friday');

      const items = await dues.listOpen(tenants.A.id, 'RECEIVABLE');
      const item = items.find((i) => i.entityId === entry.id);
      expect(item?.promiseDate?.toISOString()).toBe(promised);
    });

    it('a later promise supersedes an earlier one', async () => {
      const entry = await createOwnEntry({ partyName: 'Second Promise Debtor' });
      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/promise`)
        .set(authHeader('ownerA'))
        .send({ promisedDate: '2031-04-01T07:00:00.000Z' })
        .expect(201);
      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/promise`)
        .set(authHeader('ownerA'))
        .send({ promisedDate: '2031-04-20T07:00:00.000Z' })
        .expect(201);
      const item = (await dues.listOpen(tenants.A.id, 'RECEIVABLE')).find((i) => i.entityId === entry.id);
      expect(item?.promiseDate?.toISOString()).toBe('2031-04-20T07:00:00.000Z');
    });

    it('rejects a malformed promisedDate', async () => {
      const entry = await createOwnEntry();
      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/promise`)
        .set(authHeader('ownerA'))
        .send({ promisedDate: 'next friday' })
        .expect(400);
      expect(await prisma.promiseToPay.count({ where: { entityId: entry.id } })).toBe(0);
    });

    it('logs a reminder and sets lastReminderAt', async () => {
      const entry = await createOwnEntry({ partyName: 'Reminded Spec Debtor' });
      const before = (await dues.listOpen(tenants.A.id, 'RECEIVABLE')).find((i) => i.entityId === entry.id);
      expect(before?.lastReminderAt).toBeNull();

      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/reminded`)
        .set(authHeader('ownerA'))
        .send({ channel: 'CALL' })
        .expect(201);

      const row = await prisma.dueReminder.findFirstOrThrow({ where: { entityId: entry.id } });
      expect(row.channel).toBe('CALL');
      const after = (await dues.listOpen(tenants.A.id, 'RECEIVABLE')).find((i) => i.entityId === entry.id);
      expect(after?.lastReminderAt?.getTime()).toBe(row.createdAt.getTime());

      const list = await http().get('/dues?direction=receivable').set(authHeader('ownerA')).expect(200);
      const api = (list.body.items as ApiDue[]).find((i) => i.entityId === entry.id);
      expect(api?.lastReminderAt).toBe(row.createdAt.toISOString());
    });

    it('rejects an unknown reminder channel', async () => {
      const entry = await createOwnEntry();
      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/reminded`)
        .set(authHeader('ownerA'))
        .send({ channel: 'PIGEON' })
        .expect(400);
      expect(await prisma.dueReminder.count({ where: { entityId: entry.id } })).toBe(0);
    });

    it('forbids STAFF from promise and reminded', async () => {
      const entry = await createOwnEntry();
      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/promise`)
        .set(authHeader('staffA'))
        .send({ promisedDate: '2031-04-01T07:00:00.000Z' })
        .expect(403);
      await http()
        .post(`/dues/KHATA_ENTRY/${entry.id}/reminded`)
        .set(authHeader('staffA'))
        .send({})
        .expect(403);
      expect(await prisma.promiseToPay.count({ where: { entityId: entry.id } })).toBe(0);
      expect(await prisma.dueReminder.count({ where: { entityId: entry.id } })).toBe(0);
    });
  });

  describe('WhatsApp link', () => {
    it('builds an Urdu link for the credit order with amount and business name', async () => {
      const res = await http()
        .get(`/dues/ORDER/${creditOrder.orderId}/whatsapp-link?lang=ur`)
        .set(authHeader('ownerA'))
        .expect(200);
      expect(res.body.url.startsWith('https://wa.me/92')).toBe(true);
      expect(res.body.phone).toMatch(/^92\d{10}$/);
      expect(res.body.text).toContain('Rs 5,000');
      expect(res.body.text).toContain(tenants.A.name);
      expect(res.body.url).toContain(`text=${encodeURIComponent(res.body.text)}`);

      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: creditOrder.customerId } });
      expect(res.body.phone).toBe(normalizePkPhone(customer.phone));
    });

    it('builds an English link and normalises the khata party phone', async () => {
      const res = await http()
        .get(`/dues/KHATA_ENTRY/${khataOther.entryId}/whatsapp-link?lang=en`)
        .set(authHeader('managerA'))
        .expect(200);
      expect(res.body.phone).toBe('923001112233');
      expect(res.body.url.startsWith('https://wa.me/923001112233?text=')).toBe(true);
      expect(res.body.text).toContain('Hello Malik Mobile');
      expect(res.body.text).toContain('Rs 5,000');
      expect(res.body.text).toContain(tenants.A.name);
    });

    it('returns 400 for a vendor purchase (payable)', async () => {
      await http()
        .get(`/dues/VENDOR_PURCHASE/${vendorPurchases.openPurchaseId}/whatsapp-link`)
        .set(authHeader('ownerA'))
        .expect(400);
    });

    it('returns 400 when the party has no phone number', async () => {
      const entry = await createOwnEntry({ partyName: 'No Phone Debtor', partyPhone: undefined });
      await http()
        .get(`/dues/KHATA_ENTRY/${entry.id}/whatsapp-link`)
        .set(authHeader('ownerA'))
        .expect(400);
    });

    it('rejects an unsupported language', async () => {
      await http()
        .get(`/dues/ORDER/${creditOrder.orderId}/whatsapp-link?lang=fr`)
        .set(authHeader('ownerA'))
        .expect(400);
    });
  });

  describe('normalizePkPhone', () => {
    it.each([
      ['0300-1234567', '923001234567'],
      ['+92 300 1234567', '923001234567'],
      ['3001234567', '923001234567'],
      ['00923001234567', '923001234567'],
      ['923001234567', '923001234567'],
    ])('normalises %s', (raw, expected) => {
      expect(normalizePkPhone(raw)).toBe(expected);
    });

    it.each([['12345'], [''], [null], [undefined], ['0300-12345']])('rejects %s', (raw) => {
      expect(normalizePkPhone(raw as string | null | undefined)).toBeNull();
    });
  });

  describe('tenant isolation: tenant B on tenant A entities', () => {
    const targets: [string, string][] = [
      ['KHATA_ENTRY', khataOther.entryId],
      ['ORDER', creditOrder.orderId],
      ['VENDOR_PURCHASE', vendorPurchases.openPurchaseId],
    ];

    it.each(targets)('%s: promise, reminded and whatsapp-link all return 404', async (type, id) => {
      const b = authHeader('ownerB');
      await http()
        .post(`/dues/${type}/${id}/promise`)
        .set(b)
        .send({ promisedDate: '2031-04-01T07:00:00.000Z' })
        .expect(404);
      await http().post(`/dues/${type}/${id}/reminded`).set(b).send({ channel: 'CALL' }).expect(404);
      await http().get(`/dues/${type}/${id}/whatsapp-link`).set(b).expect(404);

      expect(await prisma.promiseToPay.count({ where: { entityId: id, businessId: tenants.B.id } })).toBe(0);
      expect(await prisma.dueReminder.count({ where: { entityId: id, businessId: tenants.B.id } })).toBe(0);
    });

    it('returns 400 for an unknown entityType on every route', async () => {
      const b = authHeader('ownerA');
      await http()
        .post(`/dues/BOGUS/${khataOther.entryId}/promise`)
        .set(b)
        .send({ promisedDate: '2031-04-01T07:00:00.000Z' })
        .expect(400);
      await http().post(`/dues/BOGUS/${khataOther.entryId}/reminded`).set(b).send({}).expect(400);
      await http().get(`/dues/BOGUS/${khataOther.entryId}/whatsapp-link`).set(b).expect(400);
    });
  });
});
