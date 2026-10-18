import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

describe('Khata entries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const http = () => request(app.getHttpServer());

  async function createEntry(
    overrides: Record<string, unknown> = {},
    as: 'ownerA' | 'managerA' = 'ownerA',
  ) {
    const res = await http()
      .post('/khata-entries')
      .set(authHeader(as))
      .send({
        direction: 'RECEIVABLE',
        partyType: 'OTHER',
        partyName: 'Rana Electronics',
        partyPhone: '0321-5551234',
        amount: 2000,
        ...overrides,
      })
      .expect(201);
    return res.body as { id: string };
  }

  async function postingsFor(entryId: string, type?: string) {
    return prisma.posting.findMany({
      where: {
        transaction: { referenceId: entryId, ...(type ? { type } : {}) },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function txIdsFor(entryId: string) {
    const txs = await prisma.transaction.findMany({
      where: { referenceId: entryId },
      select: { id: true },
    });
    return txs.map((t) => t.id);
  }

  it('creates a RECEIVABLE OTHER entry with balanced OTHER_AR / CASH postings', async () => {
    const entry = await createEntry();
    const created = await prisma.khataEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(created.status).toBe('OPEN');
    expect(Number(created.amount)).toBe(2000);
    expect(created.partyName).toBe('Rana Electronics');

    const postings = await postingsFor(entry.id, 'KHATA_ENTRY');
    expect(postings).toHaveLength(2);
    const ar = postings.find((p) => p.accountType === 'OTHER_AR');
    const cash = postings.find((p) => p.accountId === 'CASH');
    expect(ar && Number(ar.amount)).toBe(2000);
    expect(ar?.accountId).toBe(entry.id);
    expect(cash && Number(cash.amount)).toBe(-2000);
    await expectBalanced(prisma, await txIdsFor(entry.id));
  });

  it('settles partially then fully, rejects a further settle, and stays balanced', async () => {
    const entry = await createEntry();

    const first = await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 500 })
      .expect(201);
    expect(first.body.status).toBe('PARTIAL');
    expect(Number(first.body.settledAmount)).toBe(500);

    const detail = await http().get(`/khata-entries/${entry.id}`).set(authHeader('ownerA')).expect(200);
    expect(Number(detail.body.openAmount)).toBe(1500);

    const second = await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 1500 })
      .expect(201);
    expect(second.body.status).toBe('SETTLED');

    const done = await http().get(`/khata-entries/${entry.id}`).set(authHeader('ownerA')).expect(200);
    expect(Number(done.body.openAmount)).toBe(0);
    const types = done.body.transactions.map((t: { type: string }) => t.type).sort();
    expect(types).toEqual(['KHATA_ENTRY', 'KHATA_SETTLEMENT', 'KHATA_SETTLEMENT']);

    const res = await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 100 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // The party account nets to zero once fully settled.
    const ar = (await postingsFor(entry.id)).filter((p) => p.accountType === 'OTHER_AR');
    expect(ar.reduce((s, p) => s + Number(p.amount), 0)).toBe(0);
    await expectBalanced(prisma, await txIdsFor(entry.id));
  });

  it('rejects settling more than the open balance and does not change the ledger', async () => {
    const entry = await createEntry();
    const res = await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 2000.01 });
    expect(res.status).toBe(400);
    const row = await prisma.khataEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.status).toBe('OPEN');
    expect(Number(row.settledAmount)).toBe(0);
    expect(await txIdsFor(entry.id)).toHaveLength(1);
  });

  it('forbids write-off for MANAGER, allows it for OWNER and posts to bad debt', async () => {
    const entry = await createEntry();
    await http()
      .post(`/khata-entries/${entry.id}/write-off`)
      .set(authHeader('managerA'))
      .send({ reason: 'manager attempt' })
      .expect(403);
    expect((await prisma.khataEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('OPEN');

    const fresh = await createEntry({ partyName: 'Bad Debtor', amount: 1200 });
    await http()
      .post(`/khata-entries/${fresh.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 200 })
      .expect(201);
    const res = await http()
      .post(`/khata-entries/${fresh.id}/write-off`)
      .set(authHeader('ownerA'))
      .send({ reason: 'customer gone' })
      .expect(201);
    expect(res.body.status).toBe('WRITTEN_OFF');

    const wo = await postingsFor(fresh.id, 'KHATA_WRITE_OFF');
    const bad = wo.find((p) => p.accountType === 'BAD_DEBT_EXPENSE');
    const ar = wo.find((p) => p.accountType === 'OTHER_AR');
    expect(bad && Number(bad.amount)).toBe(1000);
    expect(ar && Number(ar.amount)).toBe(-1000);
    await expectBalanced(prisma, await txIdsFor(fresh.id));

    // A written-off entry cannot be settled again.
    const again = await http()
      .post(`/khata-entries/${fresh.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 10 });
    expect(again.status).toBe(400);
  });

  it('creates and settles a PAYABLE OTHER entry with balanced postings', async () => {
    const entry = await createEntry({
      direction: 'PAYABLE',
      partyName: 'Chacha Carriage',
      amount: 3000,
    });
    const created = await postingsFor(entry.id, 'KHATA_ENTRY');
    const ap = created.find((p) => p.accountType === 'OTHER_AP');
    const cash = created.find((p) => p.accountId === 'CASH');
    expect(ap && Number(ap.amount)).toBe(-3000);
    expect(cash && Number(cash.amount)).toBe(3000);

    const res = await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 3000 })
      .expect(201);
    expect(res.body.status).toBe('SETTLED');
    const settle = await postingsFor(entry.id, 'KHATA_SETTLEMENT');
    expect(Number(settle.find((p) => p.accountType === 'OTHER_AP')?.amount)).toBe(3000);
    expect(Number(settle.find((p) => p.accountId === 'CASH')?.amount)).toBe(-3000);
    await expectBalanced(prisma, await txIdsFor(entry.id));

    // Payables cannot be written off.
    const p2 = await createEntry({ direction: 'PAYABLE', partyName: 'Another Payee', amount: 100 });
    await http()
      .post(`/khata-entries/${p2.id}/write-off`)
      .set(authHeader('ownerA'))
      .send({})
      .expect(400);
  });

  it('promotes an OTHER receivable to a new customer, moving the open amount via a balanced reclass', async () => {
    const entry = await createEntry({
      partyName: 'Promote Me Traders',
      partyPhone: '0333-7778899',
      amount: 3000,
    });
    await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 1000 })
      .expect(201);

    const res = await http()
      .post(`/khata-entries/${entry.id}/promote`)
      .set(authHeader('ownerA'))
      .send({})
      .expect(201);
    expect(res.body.partyType).toBe('CUSTOMER');
    const customerId = res.body.customerId as string;
    expect(customerId).toBeTruthy();

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(customer.name).toBe('Promote Me Traders');
    expect(customer.businessId).toBe((await prisma.khataEntry.findUniqueOrThrow({ where: { id: entry.id } })).businessId);

    const reclass = await postingsFor(entry.id, 'KHATA_RECLASS');
    expect(reclass).toHaveLength(2);
    await expectBalanced(prisma, await txIdsFor(entry.id));

    const customerAr = await prisma.posting.findMany({
      where: { accountId: customerId, accountType: 'CUSTOMER_AR' },
    });
    expect(customerAr.reduce((s, p) => s + Number(p.amount), 0)).toBe(2000);
    // Old OTHER_AR account is now fully cleared.
    const otherAr = (await postingsFor(entry.id)).filter((p) => p.accountType === 'OTHER_AR');
    expect(otherAr.reduce((s, p) => s + Number(p.amount), 0)).toBe(0);

    // Settling after promotion now reduces the CUSTOMER_AR account.
    await http()
      .post(`/khata-entries/${entry.id}/settle`)
      .set(authHeader('ownerA'))
      .send({ amount: 2000 })
      .expect(201);
    const after = await prisma.posting.findMany({
      where: { accountId: customerId, accountType: 'CUSTOMER_AR' },
    });
    expect(after.reduce((s, p) => s + Number(p.amount), 0)).toBe(0);
    await expectBalanced(prisma, await txIdsFor(entry.id));

    // An already-promoted entry cannot be promoted again.
    await http()
      .post(`/khata-entries/${entry.id}/promote`)
      .set(authHeader('ownerA'))
      .send({})
      .expect(400);
  });

  it('forbids STAFF from creating or reading khata entries', async () => {
    const body = { direction: 'RECEIVABLE', partyType: 'OTHER', partyName: 'Staff Try', amount: 100 };
    const before = await prisma.khataEntry.count({ where: { partyName: 'Staff Try' } });
    await http().post('/khata-entries').set(authHeader('staffA')).send(body).expect(403);
    expect(await prisma.khataEntry.count({ where: { partyName: 'Staff Try' } })).toBe(before);
    await http().get('/khata-entries').set(authHeader('staffA')).expect(403);
  });

  it('rejects an OTHER entry without partyName and non-positive amounts', async () => {
    await http()
      .post('/khata-entries')
      .set(authHeader('ownerA'))
      .send({ direction: 'RECEIVABLE', partyType: 'OTHER', amount: 100 })
      .expect(400);
    await http()
      .post('/khata-entries')
      .set(authHeader('ownerA'))
      .send({ direction: 'RECEIVABLE', partyType: 'OTHER', partyName: 'Zero', amount: 0 })
      .expect(400);
  });

  describe('tenant isolation: tenant B cannot touch tenant A entries', () => {
    it('returns 404 for GET, PATCH, settle, write-off and promote, leaving the entry untouched', async () => {
      const entry = await createEntry({ partyName: 'Isolated Debtor', amount: 800 });
      const id = entry.id;
      const b = authHeader('ownerB');

      await http().get(`/khata-entries/${id}`).set(b).expect(404);
      await http().patch(`/khata-entries/${id}`).set(b).send({ note: 'hijack' }).expect(404);
      await http().post(`/khata-entries/${id}/settle`).set(b).send({ amount: 100 }).expect(404);
      await http().post(`/khata-entries/${id}/write-off`).set(b).send({ reason: 'x' }).expect(404);
      await http().post(`/khata-entries/${id}/promote`).set(b).send({}).expect(404);

      const row = await prisma.khataEntry.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('OPEN');
      expect(row.note).not.toBe('hijack');
      expect(Number(row.settledAmount)).toBe(0);
      expect(await txIdsFor(id)).toHaveLength(1);
    });

    it('does not list tenant A entries for tenant B', async () => {
      const entry = await createEntry({ partyName: 'Hidden From B', amount: 50 });
      const res = await http().get('/khata-entries').set(authHeader('ownerB')).expect(200);
      expect((res.body as { id: string }[]).some((e) => e.id === entry.id)).toBe(false);
    });
  });
});
