import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { INestApplication } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { expectBalanced } from './helpers/ledger';

const run = promisify(execFile);
const BIZ = tenants.A.id;
const BRANCH = tenants.A.branches.hafeezCentre.id;
const letters = () =>
  Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe('Phase 2 money and ledger correctness (e2e)', () => {
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

  /** Own product with `units` AVAILABLE instances at Hafeez Centre, no min price. */
  async function makeProduct(name: string, price: number, units: number) {
    const id = randomUUID();
    await prisma.product.create({
      data: {
        id,
        name: `T3 ${name} ${uniq()}`,
        sku: `T3-${uniq()}`,
        basePrice: price,
        businessId: BIZ,
      },
    });
    await prisma.productInstance.createMany({
      data: Array.from({ length: units }, () => ({
        id: randomUUID(),
        productId: id,
        branchId: BRANCH,
        status: 'AVAILABLE' as const,
      })),
    });
    return id;
  }

  async function makeCustomer(name: string) {
    return prisma.customer.create({
      data: {
        name: `T3 ${name} ${letters()}`,
        phone: `0300${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        businessId: BIZ,
        creditLimit: 1000000,
      },
    });
  }

  async function ordersTransactions(orderId: string) {
    const txs = await prisma.transaction.findMany({
      where: {
        businessId: BIZ,
        OR: [{ referenceId: orderId }, { referenceId: `RET-${orderId}` }],
      },
      include: { postings: true },
      orderBy: { createdAt: 'asc' },
    });
    return txs;
  }

  /** Sum of posting amounts (as Decimal) for an account across the given transactions. */
  function netFor(
    txs: Awaited<ReturnType<typeof ordersTransactions>>,
    accountType: string,
    accountId?: string,
  ): Prisma.Decimal {
    return txs
      .flatMap((t) => t.postings)
      .filter((p) => p.accountType === accountType && (!accountId || p.accountId === accountId))
      .reduce((acc, p) => acc.plus(p.amount), new Prisma.Decimal(0));
  }

  describe('(a) Decimal rounding and JSON shape', () => {
    it('3 x 33.33 with discount 0.99 and full payment totals exactly 99.00', async () => {
      const productId = await makeProduct('Round', 33.33, 3);
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          walkInName: 'T3 Round',
          items: [{ productId, quantity: 3, price: 33.33 }],
          discount: 0.99,
          amountPaid: 99,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(res.status).toBeLessThan(300);
      const orderId = res.body.order.id as string;

      // JSON: money fields are plain numbers with at most 2 decimals.
      expect(typeof res.body.order.totalAmount).toBe('number');
      expect(res.body.order.totalAmount).toBe(99);
      expect(typeof res.body.order.discount).toBe('number');
      expect(res.body.order.discount).toBe(0.99);
      expect(res.body.order.items[0].price).toBe(33.33);
      expect(typeof res.body.order.items[0].price).toBe('number');
      expect(res.body.order.paymentStatus).toBe('PAID');

      // DB: exact Decimal(14,2).
      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.totalAmount.toFixed(2)).toBe('99.00');
      expect(row.discount.toFixed(2)).toBe('0.99');
      const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
      expect(item.price.toFixed(2)).toBe('33.33');

      // Read-back through the API keeps the number shape.
      const got = await http()
        .get(`/order/${orderId}`)
        .set(authHeader('ownerA', BRANCH))
        .expect(200);
      expect(typeof got.body.order.totalAmount).toBe('number');
      expect(got.body.order.totalAmount).toBe(99);

      // Ledger: SALE balances; revenue -99.00, cash +99.00, nothing receivable.
      const txs = await ordersTransactions(orderId);
      const sale = txs.filter((t) => t.type === 'SALE');
      expect(sale).toHaveLength(1);
      await expectBalanced(prisma, sale.map((t) => t.id));
      expect(netFor(sale, 'REVENUE').toFixed(2)).toBe('-99.00');
      expect(netFor(sale, 'ASSET', 'CASH').toFixed(2)).toBe('99.00');
      expect(netFor(sale, 'OTHER_AR').toFixed(2)).toBe('0.00');
    });

    it('does not leak float error: 3 x 0.10 + 0.20 totals exactly 0.50', async () => {
      const p1 = await makeProduct('Float1', 0.1, 3);
      const p2 = await makeProduct('Float2', 0.2, 1);
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          walkInName: 'T3 Float',
          items: [
            { productId: p1, quantity: 3, price: 0.1 },
            { productId: p2, quantity: 1, price: 0.2 },
          ],
          amountPaid: 0.5,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(res.status).toBeLessThan(300);
      expect(res.body.order.totalAmount).toBe(0.5);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: res.body.order.id } });
      expect(row.totalAmount.toFixed(2)).toBe('0.50');
      expect(res.body.order.paymentStatus).toBe('PAID');
      const txs = await ordersTransactions(res.body.order.id);
      await expectBalanced(prisma, txs.map((t) => t.id));
      expect(netFor(txs, 'REVENUE').toFixed(2)).toBe('-0.50');
    });

    it('order list exposes numeric totalPaid and pendingBalance', async () => {
      const productId = await makeProduct('List', 10.1, 1);
      const customer = await makeCustomer('ListCust');
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          customerId: customer.id,
          items: [{ productId, quantity: 1, price: 10.1 }],
          amountPaid: 3.3,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(res.status).toBeLessThan(300);
      const list = await http()
        .get('/order/getallorders')
        .query({ search: customer.name, days: 'all', branchId: BRANCH })
        .set(authHeader('ownerA', BRANCH))
        .expect(200);
      const found = list.body.orders.find((o: any) => o.id === res.body.order.id);
      expect(found).toBeDefined();
      expect(typeof found.totalPaid).toBe('number');
      expect(found.totalPaid).toBe(3.3);
      expect(found.pendingBalance).toBe(6.8);
      expect(found.totalAmount).toBe(10.1);
    });

    // The order search turns any digits in the term into an int orderNumber filter;
    // an 11-digit phone number overflows Postgres int4 and the request 500s.
    it('searching orders by an 11-digit phone number does not error', async () => {
      const res = await http()
        .get('/order/getallorders')
        .query({ search: '03001234567', days: 'all', branchId: BRANCH })
        .set(authHeader('ownerA', BRANCH));
      expect(res.status).toBe(200);
    });

    // A fully-paid, discounted walk-in sale that is wholly returned must net to
    // zero revenue and zero cash. processReturn refunds the gross item price, not
    // the amount actually charged, so revenue is left at +0.99.
    it('full return of a discounted sale nets revenue and receivables to zero', async () => {
      const productId = await makeProduct('RetDisc', 33.33, 3);
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          walkInName: 'T3 RetDisc',
          items: [{ productId, quantity: 3, price: 33.33 }],
          discount: 0.99,
          amountPaid: 99,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        })
        .expect(201);
      const orderId = res.body.order.id as string;
      await http()
        .post(`/order/${orderId}/return`)
        .set(authHeader('ownerA', BRANCH))
        .send({ itemsToReturn: [{ productId, quantity: 3 }] })
        .expect(201);
      const txs = await ordersTransactions(orderId);
      await expectBalanced(prisma, txs.map((t) => t.id));
      expect(netFor(txs, 'ASSET', 'CASH').toFixed(2)).toBe('0.00');
      expect(netFor(txs, 'REVENUE').toFixed(2)).toBe('0.00');
      expect(netFor(txs, 'OTHER_AR').toFixed(2)).toBe('0.00');
    });
  });

  describe('(b) walk-in receivables', () => {
    it('rejects a partly paid walk-in FINAL sale and leaves no trace', async () => {
      const productId = await makeProduct('WalkFinal', 33.33, 3);
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          walkInName: 'T3 WalkFinalRejected',
          items: [{ productId, quantity: 3, price: 33.33 }],
          amountPaid: 50,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/pay in full/i);
      expect(await prisma.order.count({ where: { walkInName: 'T3 WalkFinalRejected' } })).toBe(0);
      expect(await prisma.productInstance.count({ where: { productId, status: 'AVAILABLE' } })).toBe(3);
    });

    it('walk-in memo settled partly posts the remainder to OTHER_AR keyed by the order id, then recordpayment clears it', async () => {
      const productId = await makeProduct('WalkMemo', 33.33, 3);
      const created = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          walkInName: 'T3 WalkMemo',
          items: [{ productId, quantity: 3, price: 33.33 }],
          amountPaid: 40,
          orderStatus: 'MEMO',
          paymentMethod: 'CASH',
        });
      expect(created.status).toBeLessThan(300);
      const orderId = created.body.order.id as string;
      expect(created.body.order.totalAmount).toBe(99.99);
      expect(await prisma.productInstance.count({ where: { productId, status: 'MEMO_LOCKED' } })).toBe(3);
      // A memo does not touch the ledger yet.
      expect(await ordersTransactions(orderId)).toHaveLength(0);

      await http()
        .patch(`/order/${orderId}/settle-memo`)
        .set(authHeader('ownerA', BRANCH))
        .send({ amountPaid: 20, paymentMethod: 'CASH' })
        .expect(200);

      const settled = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(settled.status).toBe('FINAL');
      expect(settled.paymentStatus).toBe('PARTIAL');
      expect(await prisma.productInstance.count({ where: { productId, status: 'SOLD' } })).toBe(3);

      let txs = await ordersTransactions(orderId);
      const sale = txs.filter((t) => t.type === 'SALE');
      expect(sale).toHaveLength(1);
      await expectBalanced(prisma, [sale[0].id]);
      const ar = sale[0].postings.filter((p) => p.accountType === 'OTHER_AR');
      expect(ar).toHaveLength(1);
      expect(ar[0].accountId).toBe(orderId);
      expect(ar[0].amount.toFixed(2)).toBe('39.99'); // 99.99 - (40 + 20)
      expect(netFor(sale, 'REVENUE').toFixed(2)).toBe('-99.99');
      expect(netFor(sale, 'ASSET', 'CASH').toFixed(2)).toBe('60.00');
      expect(sale[0].postings.some((p) => p.accountType === 'CUSTOMER_AR')).toBe(false);

      // Pay the rest.
      await http()
        .post('/order/recordpayment')
        .set(authHeader('ownerA', BRANCH))
        .send({ orderId, amount: 39.99, method: 'CASH' })
        .expect(201);
      const paid = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(paid.paymentStatus).toBe('PAID');
      txs = await ordersTransactions(orderId);
      const payment = txs.filter((t) => t.type === 'PAYMENT');
      expect(payment).toHaveLength(1);
      await expectBalanced(prisma, txs.map((t) => t.id));
      expect(netFor(payment, 'OTHER_AR', orderId).toFixed(2)).toBe('-39.99');
      // The receivable for this order is fully cleared and cash equals the total.
      expect(netFor(txs, 'OTHER_AR', orderId).toFixed(2)).toBe('0.00');
      expect(netFor(txs, 'ASSET', 'CASH').toFixed(2)).toBe('99.99');

      // Nothing left to pay, and an over-payment is refused (no extra ledger rows).
      const again = await http()
        .post('/order/recordpayment')
        .set(authHeader('ownerA', BRANCH))
        .send({ orderId, amount: 1, method: 'CASH' });
      expect(again.status).toBe(400);
      expect(await prisma.transaction.count({ where: { referenceId: orderId, type: 'PAYMENT' } })).toBe(1);
    });
  });

  describe('(c) customer credit flows', () => {
    it('credit sale posts CUSTOMER_AR; payment and full return keep the ledger balanced and net to zero', async () => {
      const productId = await makeProduct('Credit', 33.33, 2);
      const customer = await makeCustomer('Credit');
      const created = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', BRANCH))
        .send({
          customerId: customer.id,
          items: [{ productId, quantity: 2, price: 33.33 }],
          amountPaid: 10,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(created.status).toBeLessThan(300);
      const orderId = created.body.order.id as string;
      expect(created.body.order.totalAmount).toBe(66.66);
      expect(created.body.order.paymentStatus).toBe('PARTIAL');

      let txs = await ordersTransactions(orderId);
      const sale = txs.filter((t) => t.type === 'SALE');
      expect(sale).toHaveLength(1);
      await expectBalanced(prisma, [sale[0].id]);
      const ar = sale[0].postings.filter((p) => p.accountType === 'CUSTOMER_AR');
      expect(ar).toHaveLength(1);
      expect(ar[0].accountId).toBe(customer.id);
      expect(ar[0].amount.toFixed(2)).toBe('56.66');
      expect(sale[0].postings.some((p) => p.accountType === 'OTHER_AR')).toBe(false);

      await http()
        .post('/order/recordpayment')
        .set(authHeader('ownerA', BRANCH))
        .send({ orderId, amount: 20, method: 'CASH' })
        .expect(201);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('PARTIAL');
      txs = await ordersTransactions(orderId);
      expect(netFor(txs, 'CUSTOMER_AR', customer.id).toFixed(2)).toBe('36.66');
      await expectBalanced(prisma, txs.map((t) => t.id));

      await http()
        .post(`/order/${orderId}/return`)
        .set(authHeader('ownerA', BRANCH))
        .send({ itemsToReturn: [{ productId, quantity: 2 }] })
        .expect(201);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('RETURNED');
      expect(await prisma.productInstance.count({ where: { productId, status: 'AVAILABLE' } })).toBe(2);

      txs = await ordersTransactions(orderId);
      expect(txs.map((t) => t.type).sort()).toEqual(['PAYMENT', 'RETURN', 'SALE']);
      await expectBalanced(prisma, txs.map((t) => t.id));
      expect(netFor(txs, 'CUSTOMER_AR', customer.id).toFixed(2)).toBe('0.00');
      expect(netFor(txs, 'REVENUE').toFixed(2)).toBe('0.00');
      expect(netFor(txs, 'ASSET', 'CASH').toFixed(2)).toBe('0.00');
    });

    it('every transaction in the database is balanced after all flows', async () => {
      await expectBalanced(prisma);
      const bizTx = await prisma.transaction.findMany({ where: { businessId: BIZ }, select: { id: true } });
      expect(bizTx.length).toBeGreaterThan(0);
      await expectBalanced(prisma, bizTx.map((t) => t.id));
    });
  });

  describe('(d) scripts/verify-ledger.ts', () => {
    const serverRoot = process.cwd();
    const dbUrl = () => process.env.DATABASE_URL_TEST as string;

    function verify(args: string[] = []) {
      return run('npx', ['tsx', 'scripts/verify-ledger.ts', ...args], {
        cwd: serverRoot,
        env: { ...process.env, DATABASE_URL: dbUrl(), DIRECT_URL: dbUrl() },
        timeout: 60000,
      });
    }

    it('reports Ledger OK on the balanced test database', async () => {
      const { stdout } = await verify();
      expect(stdout).toMatch(/Ledger OK: \d+ transactions checked/);
      const checked = Number(/Ledger OK: (\d+)/.exec(stdout)![1]);
      expect(checked).toBe(await prisma.transaction.count());
    });

    it('exits 1 and names the offender when a transaction is unbalanced', async () => {
      const drift = await prisma.transaction.create({
        data: {
          businessId: tenants.B.id,
          type: 'T3_DRIFT',
          referenceId: `t3-drift-${uniq()}`,
          postings: {
            create: [
              { accountId: 'CASH', accountType: 'ASSET', amount: 10 },
              { accountId: 'REVENUE', accountType: 'REVENUE', amount: -9.99 },
            ],
          },
        },
      });
      try {
        await expect(verify()).rejects.toMatchObject({ code: 1 });
        const err: any = await verify().catch((e) => e);
        expect(err.stderr).toContain('Ledger DRIFT');
        expect(err.stderr).toContain(drift.id);
        // Scoped to the other business, the drift is not visible.
        const { stdout } = await verify(['--business', tenants.A.id]);
        expect(stdout).toMatch(/Ledger OK/);
      } finally {
        await prisma.transaction.delete({ where: { id: drift.id } });
      }
      const { stdout } = await verify();
      expect(stdout).toMatch(/Ledger OK/);
    }, 120000);
  });
});
