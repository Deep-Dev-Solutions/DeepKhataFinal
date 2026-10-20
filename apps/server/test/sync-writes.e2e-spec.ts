import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const BIZ = tenants.A.id;
const BRANCH = tenants.A.branches.hafeezCentre.id;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

type Who = 'ownerA' | 'managerA' | 'staffA' | 'ownerB';

describe('Offline sync batch: id-keyed writes (e2e)', () => {
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

  async function send(
    who: Who,
    type: string,
    id: string,
    payload: Record<string, unknown>,
    branchId = who === 'ownerB' ? tenants.B.branches.mainBranch.id : BRANCH,
  ) {
    const res = await request(app.getHttpServer())
      .post('/sync/batch')
      .set(authHeader(who, branchId))
      .send({ items: [{ id, type, payload }] });
    expect(res.status).toBeLessThan(300);
    return res.body.results[0] as { id: string; status: string; reason?: string };
  }

  async function txIdsFor(referenceId: string) {
    const txs = await prisma.transaction.findMany({
      where: { referenceId },
      select: { id: true },
    });
    return txs.map((t) => t.id);
  }

  describe('UPSERT_CUSTOMER', () => {
    it('creates once, updates on replay with the same id, and refuses another tenant', async () => {
      const id = randomUUID();
      const phone = `0311${uniq().slice(-7)}`;
      const first = await send('staffA', 'UPSERT_CUSTOMER', id, {
        name: 'Sync Customer',
        phone,
        shopName: 'Sync Shop',
      });
      expect(first.status).toBe('synced');
      expect(await prisma.customer.count({ where: { id } })).toBe(1);

      const second = await send('staffA', 'UPSERT_CUSTOMER', id, {
        name: 'Sync Customer Renamed',
        phone,
        creditLimit: 1,
        isDefaulter: true,
      });
      expect(second.status).toBe('synced');
      const row = await prisma.customer.findUniqueOrThrow({ where: { id } });
      expect(await prisma.customer.count({ where: { id } })).toBe(1);
      expect(row.name).toBe('Sync Customer Renamed');
      expect(row.businessId).toBe(BIZ);
      // Risk fields are not writable from the offline queue on update.
      expect(row.isDefaulter).toBe(false);
      expect(row.creditLimit.toFixed(2)).toBe('50000.00');

      const foreign = await send('ownerB', 'UPSERT_CUSTOMER', id, {
        name: 'Hijack',
        phone: '0399000111',
      });
      expect(foreign.status).toBe('failed');
      expect(foreign.reason).toBe('Id already in use');
      expect((await prisma.customer.findUniqueOrThrow({ where: { id } })).name).toBe(
        'Sync Customer Renamed',
      );
    });

    it('fails a different id that reuses an existing phone number', async () => {
      const phone = `0312${uniq().slice(-7)}`;
      const a = randomUUID();
      const b = randomUUID();
      expect((await send('ownerA', 'UPSERT_CUSTOMER', a, { name: 'One', phone })).status).toBe(
        'synced',
      );
      const dup = await send('ownerA', 'UPSERT_CUSTOMER', b, { name: 'Two', phone });
      expect(dup.status).toBe('failed');
      expect(dup.reason).toMatch(/already exists/i);
      expect(await prisma.customer.count({ where: { id: b } })).toBe(0);
    });
  });

  describe('CREATE_KHATA_ENTRY', () => {
    const entry = () => ({
      direction: 'RECEIVABLE',
      partyType: 'OTHER',
      partyName: 'Sync Rana',
      amount: 1250.5,
    });

    it('creates one entry with one balanced ledger transaction, however often it is replayed', async () => {
      const id = randomUUID();
      expect((await send('managerA', 'CREATE_KHATA_ENTRY', id, entry())).status).toBe('synced');
      expect((await send('managerA', 'CREATE_KHATA_ENTRY', id, entry())).status).toBe('synced');
      expect(await prisma.khataEntry.count({ where: { id } })).toBe(1);
      const row = await prisma.khataEntry.findUniqueOrThrow({ where: { id } });
      expect(row.businessId).toBe(BIZ);
      expect(row.branchId).toBe(BRANCH);
      const txIds = await txIdsFor(id);
      expect(txIds).toHaveLength(1);
      await expectBalanced(prisma, txIds);
    });

    it('rejects another tenant reusing the id, an invalid payload and a role without manage:dues', async () => {
      const id = randomUUID();
      await send('ownerA', 'CREATE_KHATA_ENTRY', id, entry());
      const foreign = await send('ownerB', 'CREATE_KHATA_ENTRY', id, entry());
      expect(foreign.status).toBe('failed');
      expect(foreign.reason).toBe('Id already in use');
      expect(await prisma.khataEntry.count({ where: { id } })).toBe(1);

      const bad = await send('ownerA', 'CREATE_KHATA_ENTRY', randomUUID(), {
        direction: 'RECEIVABLE',
        partyType: 'OTHER',
        amount: -5,
      });
      expect(bad.status).toBe('failed');

      const staffId = randomUUID();
      const denied = await send('staffA', 'CREATE_KHATA_ENTRY', staffId, entry());
      expect(denied.status).toBe('failed');
      expect(denied.reason).toBe('Permission denied');
      expect(await prisma.khataEntry.count({ where: { id: staffId } })).toBe(0);
    });
  });

  describe('CREATE_EXPENSE', () => {
    it('logs one expense with one balanced ledger transaction on replay, and refuses a foreign id', async () => {
      const id = randomUUID();
      const payload = {
        amount: 150.25,
        category: 'repair_parts',
        description: 'Sync soldering iron',
        branchId: BRANCH,
      };
      expect((await send('staffA', 'CREATE_EXPENSE', id, payload)).status).toBe('synced');
      expect((await send('staffA', 'CREATE_EXPENSE', id, payload)).status).toBe('synced');
      expect(await prisma.expense.count({ where: { id } })).toBe(1);
      const row = await prisma.expense.findUniqueOrThrow({ where: { id } });
      expect(row.businessId).toBe(BIZ);
      expect(row.amount.toFixed(2)).toBe('150.25');
      expect(row.transactionId).not.toBeNull();
      const txIds = await txIdsFor(id);
      expect(txIds).toHaveLength(1);
      await expectBalanced(prisma, txIds);

      const foreign = await send('ownerB', 'CREATE_EXPENSE', id, { amount: 1, category: 'OTHER' });
      expect(foreign.status).toBe('failed');
      expect(foreign.reason).toBe('Id already in use');
      expect(await prisma.expense.count({ where: { id } })).toBe(1);
    });

    it('rejects a branch of another business', async () => {
      const id = randomUUID();
      const res = await send('ownerA', 'CREATE_EXPENSE', id, {
        amount: 10,
        category: 'OTHER',
        branchId: tenants.B.branches.mainBranch.id,
      });
      expect(res.status).toBe('failed');
      expect(await prisma.expense.count({ where: { id } })).toBe(0);
    });
  });

  describe('RECORD_PAYMENT', () => {
    async function creditOrder() {
      const productId = randomUUID();
      await prisma.product.create({
        data: {
          id: productId,
          name: `Sync Pay ${uniq()}`,
          sku: `SYNC-${uniq()}`,
          basePrice: 100,
          businessId: BIZ,
        },
      });
      await prisma.productInstance.create({
        data: { id: randomUUID(), productId, branchId: BRANCH, status: 'AVAILABLE' },
      });
      const customer = await prisma.customer.create({
        data: {
          name: `Sync Payer ${uniq()}`,
          phone: `0313${uniq().slice(-7)}`,
          businessId: BIZ,
          creditLimit: 1000000,
        },
      });
      const orderId = randomUUID();
      const res = await send('ownerA', 'CREATE_ORDER', orderId, {
        customerId: customer.id,
        items: [{ productId, quantity: 1, price: 100 }],
        amountPaid: 10,
        orderStatus: 'FINAL',
        paymentMethod: 'CASH',
      });
      expect(res.status).toBe('synced');
      return orderId;
    }

    it('records a payment once per id, keeps the ledger balanced and refuses a foreign id', async () => {
      const orderId = await creditOrder();
      const paymentId = randomUUID();
      const payload = { orderId, amount: 30, method: 'CASH' };
      expect((await send('staffA', 'RECORD_PAYMENT', paymentId, payload)).status).toBe('synced');
      expect((await send('staffA', 'RECORD_PAYMENT', paymentId, payload)).status).toBe('synced');
      expect(await prisma.payment.count({ where: { id: paymentId } })).toBe(1);
      const payments = await prisma.payment.findMany({ where: { orderId } });
      // 10 at sale time + the one synced payment (the replay added nothing).
      expect(payments.map((p) => p.amount.toFixed(2)).sort()).toEqual(['10.00', '30.00']);

      const txs = await prisma.transaction.findMany({
        where: { businessId: BIZ, referenceId: orderId },
        select: { id: true, type: true },
      });
      expect(txs.filter((t) => t.type === 'PAYMENT')).toHaveLength(1);
      await expectBalanced(prisma, txs.map((t) => t.id));

      const foreign = await send('ownerB', 'RECORD_PAYMENT', paymentId, payload);
      expect(foreign.status).toBe('failed');
      expect(foreign.reason).toBe('Id already in use');
      expect(await prisma.payment.count({ where: { id: paymentId } })).toBe(1);
    });

    it('fails a payment over the remaining balance with a reason and writes nothing', async () => {
      const orderId = await creditOrder();
      const before = await prisma.transaction.count({ where: { referenceId: orderId } });
      const id = randomUUID();
      const res = await send('ownerA', 'RECORD_PAYMENT', id, {
        orderId,
        amount: 500,
        method: 'CASH',
      });
      expect(res.status).toBe('failed');
      expect(res.reason).toMatch(/exceeds the pending balance/i);
      expect(await prisma.payment.count({ where: { id } })).toBe(0);
      expect(await prisma.transaction.count({ where: { referenceId: orderId } })).toBe(before);
    });

    it('cannot pay an order that belongs to another tenant', async () => {
      const orderId = await creditOrder();
      const id = randomUUID();
      const res = await send('ownerB', 'RECORD_PAYMENT', id, {
        orderId,
        amount: 5,
        method: 'CASH',
      });
      expect(res.status).toBe('failed');
      expect(await prisma.payment.count({ where: { id } })).toBe(0);
    });
  });
});
