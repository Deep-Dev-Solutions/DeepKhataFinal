import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { catalog } from '../../e2e/fixtures/catalog';

const kb = catalog.keyboard840;
const HALL = tenants.A.branches.hallRoad.id;
const A = tenants.A.id;

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** Independent Karachi (UTC+5, no DST) start-of-day, as a UTC instant. */
function karachiDayStart(d = new Date()): Date {
  const shifted = new Date(d.getTime() + 5 * 3600 * 1000);
  const midnightUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(midnightUtc - 5 * 3600 * 1000);
}
const DAY = 24 * 3600 * 1000;

function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

describe('Phase 5 order rules (e2e)', () => {
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

  /** Own min-price product (base 9000, min 8000) at Hall Road so seeded stock is untouched. */
  async function makeProduct(count: number) {
    const tag = uniq();
    const product = await prisma.product.create({
      data: {
        businessId: A,
        name: `T2 Min Price Screen ${tag}`,
        sku: `T2-MPS-${tag}`,
        basePrice: 9000,
        minSalePrice: 8000,
        defaultCostPrice: 6500,
        searchText: `t2 min price screen ${tag}`,
      },
    });
    const instanceIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const inst = await prisma.productInstance.create({
        data: { productId: product.id, branchId: HALL, unitCost: 6500, status: 'AVAILABLE' },
      });
      instanceIds.push(inst.id);
    }
    return { product, instanceIds };
  }

  async function makeCustomer(paymentTermsDays: number | null) {
    return prisma.customer.create({
      data: {
        businessId: A,
        name: `T2 Customer ${uniq()}`,
        phone: `0300${Math.floor(1000000 + Math.random() * 8999999)}`,
        paymentTermsDays,
      },
    });
  }

  const sell = (
    user: 'staffA' | 'managerA' | 'ownerA',
    body: Record<string, unknown>,
  ) =>
    http()
      .post('/order/neworder')
      .set(authHeader(user, HALL))
      .send({ orderStatus: 'FINAL', paymentMethod: 'CASH', ...body });

  const orderCount = () => prisma.order.count({ where: { businessId: A } });

  describe('minimum sale price guard', () => {
    it('forbids staff selling below the minimum and creates nothing', async () => {
      const { product, instanceIds } = await makeProduct(2);
      const before = await orderCount();
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 7500 }],
        amountPaid: 7500,
      });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(`Minimum price for ${product.name} is Rs 8000. Ask the owner or manager.`);
      expect(await orderCount()).toBe(before);
      expect(await prisma.productInstance.count({ where: { id: { in: instanceIds }, status: 'AVAILABLE' } })).toBe(2);
    });

    it('does not let staff bypass the guard by supplying a reason', async () => {
      const { product } = await makeProduct(1);
      const before = await orderCount();
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 7500, priceOverrideReason: 'customer begged' }],
        amountPaid: 7500,
      });
      expect(res.status).toBe(403);
      expect(await orderCount()).toBe(before);
    });

    it('requires a reason from a manager selling below the minimum (400)', async () => {
      const { product, instanceIds } = await makeProduct(1);
      const before = await orderCount();
      const res = await sell('managerA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 7500 }],
        amountPaid: 7500,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('A reason is required to sell below the minimum price');
      expect(await orderCount()).toBe(before);
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('AVAILABLE');
    });

    it('treats a blank reason as missing for the owner (400)', async () => {
      const { product } = await makeProduct(1);
      const res = await sell('ownerA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 7500, priceOverrideReason: '   ' }],
        amountPaid: 7500,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('A reason is required to sell below the minimum price');
    });

    it('lets a manager sell below the minimum with a reason and stores the reason', async () => {
      const { product, instanceIds } = await makeProduct(1);
      const res = await sell('managerA', {
        walkInName: 'Walk In',
        items: [
          { productId: product.id, quantity: 1, price: 7500, priceOverrideReason: 'Bulk deal with regular dealer' },
        ],
        amountPaid: 7500,
      });
      expect(res.status).toBe(201);
      const order = await prisma.order.findFirstOrThrow({
        where: { businessId: A, items: { some: { productId: product.id } } },
        include: { items: true },
      });
      expect(order.items).toHaveLength(1);
      expect(order.items[0].priceOverrideReason).toBe('Bulk deal with regular dealer');
      expect(Number(order.items[0].price)).toBe(7500);
      expect(Number(order.totalAmount)).toBe(7500);
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('SOLD');
    });

    it('lets staff sell at 8500 (above the minimum) with no override reason recorded', async () => {
      const { product, instanceIds } = await makeProduct(1);
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 8500 }],
        amountPaid: 8500,
      });
      expect(res.status).toBe(201);
      const item = await prisma.orderItem.findFirstOrThrow({ where: { productId: product.id } });
      expect(Number(item.price)).toBe(8500);
      expect(item.priceOverrideReason).toBeNull();
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('SOLD');
    });

    it('lets staff sell exactly at the minimum (8000)', async () => {
      const { product } = await makeProduct(1);
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 8000 }],
        amountPaid: 8000,
      });
      expect(res.status).toBe(201);
    });

    it('applies the guard to the default price too: omitted price uses base 9000, so staff may sell', async () => {
      const { product } = await makeProduct(1);
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1 }],
        amountPaid: 9000,
      });
      expect(res.status).toBe(201);
      const item = await prisma.orderItem.findFirstOrThrow({ where: { productId: product.id } });
      expect(Number(item.price)).toBe(9000);
    });
  });

  describe('credit sale due dates', () => {
    it('defaults the due date to Karachi today plus the business default receivable days', async () => {
      const biz = await prisma.business.findUniqueOrThrow({ where: { id: A } });
      const customer = await makeCustomer(null);
      const { product } = await makeProduct(1);
      const res = await sell('staffA', {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 1000,
      });
      expect(res.status).toBe(201);
      const order = await prisma.order.findFirstOrThrow({ where: { customerId: customer.id } });
      expect(order.paymentStatus).toBe('PARTIAL');
      expect(order.dueDate).not.toBeNull();
      const expected = karachiDayStart().getTime() + biz.defaultReceivableDays * DAY;
      expect(order.dueDate!.getTime()).toBe(expected);
    });

    it("uses the customer's payment terms when set", async () => {
      const customer = await makeCustomer(14);
      const { product } = await makeProduct(1);
      const res = await sell('managerA', {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 0,
      });
      expect(res.status).toBe(201);
      const order = await prisma.order.findFirstOrThrow({ where: { customerId: customer.id } });
      expect(order.paymentStatus).toBe('UNPAID');
      expect(order.dueDate!.getTime()).toBe(karachiDayStart().getTime() + 14 * DAY);
    });

    it('stores an explicit future due date', async () => {
      const customer = await makeCustomer(null);
      const { product } = await makeProduct(1);
      const due = new Date(karachiDayStart().getTime() + 30 * DAY + 12 * 3600 * 1000);
      const res = await sell('staffA', {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 2000,
        dueDate: due.toISOString(),
      });
      expect(res.status).toBe(201);
      const order = await prisma.order.findFirstOrThrow({ where: { customerId: customer.id } });
      expect(order.dueDate!.getTime()).toBe(due.getTime());
    });

    it('rejects a past due date with 400 and creates nothing', async () => {
      const customer = await makeCustomer(null);
      const { product, instanceIds } = await makeProduct(1);
      const res = await sell('staffA', {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 1000,
        dueDate: new Date(Date.now() - 3 * DAY).toISOString(),
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Due date cannot be in the past');
      expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(0);
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('AVAILABLE');
    });

    it('leaves the due date null for a fully paid sale', async () => {
      const customer = await makeCustomer(14);
      const { product } = await makeProduct(1);
      const res = await sell('staffA', {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 9000,
        dueDate: new Date(karachiDayStart().getTime() + 10 * DAY).toISOString(),
      });
      expect(res.status).toBe(201);
      const order = await prisma.order.findFirstOrThrow({ where: { customerId: customer.id } });
      expect(order.paymentStatus).toBe('PAID');
      expect(order.dueDate).toBeNull();
    });

    it('refuses an unpaid completed sale to a walk-in customer', async () => {
      const { product, instanceIds } = await makeProduct(1);
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 1000,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('AVAILABLE');
    });
  });

  describe('reserved units', () => {
    it('never sells a reserved unit on a normal line, and sells it through its reservation', async () => {
      const { product, instanceIds } = await makeProduct(2);

      const rsv = await http()
        .post('/reservations')
        .set(authHeader('staffA', HALL))
        .send({ instanceId: instanceIds[0], customerName: 'T2 Reserved Buyer' });
      expect(rsv.status).toBe(201);
      const reservationId: string = rsv.body.id;
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('RESERVED');

      // Only 1 other unit is AVAILABLE: a normal sale of 2 must fail.
      const before = await orderCount();
      const tooMany = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 2, price: 9000 }],
        amountPaid: 18000,
      });
      expect(tooMany.status).toBeGreaterThanOrEqual(400);
      expect(tooMany.status).toBeLessThan(500);
      expect(await orderCount()).toBe(before);
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('RESERVED');
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[1] } })).status).toBe('AVAILABLE');
      expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe('ACTIVE');

      // A normal single-unit sale takes the free unit, not the reserved one.
      const normal = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 9000,
      });
      expect(normal.status).toBe(201);
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[1] } })).status).toBe('SOLD');
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('RESERVED');

      // With nothing else left, a normal sale fails but the reservation line works.
      const none = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 9000 }],
        amountPaid: 9000,
      });
      expect(none.status).toBeGreaterThanOrEqual(400);
      expect(none.status).toBeLessThan(500);

      const converted = await sell('staffA', {
        walkInName: 'T2 Reserved Buyer',
        items: [{ productId: product.id, quantity: 1, price: 9000, reservationId }],
        amountPaid: 9000,
      });
      expect(converted.status).toBe(201);
      expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe('CONVERTED');
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('SOLD');

      // The reservation cannot be converted again.
      const again = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 1, price: 9000, reservationId }],
        amountPaid: 9000,
      });
      expect(again.status).toBe(409);
    });

    it('requires a reserved line to be a single unit (400)', async () => {
      const { product, instanceIds } = await makeProduct(2);
      const rsv = await http()
        .post('/reservations')
        .set(authHeader('staffA', HALL))
        .send({ instanceId: instanceIds[0], customerName: 'T2 Multi' });
      expect(rsv.status).toBe(201);
      const res = await sell('staffA', {
        walkInName: 'Walk In',
        items: [{ productId: product.id, quantity: 2, price: 9000, reservationId: rsv.body.id }],
        amountPaid: 18000,
      });
      expect(res.status).toBe(400);
      expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: rsv.body.id } })).status).toBe('ACTIVE');
    });

    it('rejects a reservation that belongs to another tenant (tenant B cannot convert it)', async () => {
      const { product, instanceIds } = await makeProduct(1);
      const rsv = await http()
        .post('/reservations')
        .set(authHeader('staffA', HALL))
        .send({ instanceId: instanceIds[0], customerName: 'T2 Cross' });
      expect(rsv.status).toBe(201);
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerB', tenants.B.branches.mainBranch.id))
        .send({
          walkInName: 'Cross',
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
          items: [{ productId: product.id, quantity: 1, price: 9000, reservationId: rsv.body.id }],
          amountPaid: 9000,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect((await prisma.stockReservation.findUniqueOrThrow({ where: { id: rsv.body.id } })).status).toBe('ACTIVE');
      expect((await prisma.productInstance.findUniqueOrThrow({ where: { id: instanceIds[0] } })).status).toBe('RESERVED');
    });
  });

  describe('product PATCH and details', () => {
    it('rejects a minimum price above the sale price (400) and leaves the product unchanged', async () => {
      const { product } = await makeProduct(0);
      const res = await http()
        .patch(`/product/${product.id}`)
        .set(authHeader('ownerA', HALL))
        .send({ minSalePrice: 9500 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Minimum price cannot be above the sale price');
      const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(Number(row.minSalePrice)).toBe(8000);
      expect(Number(row.basePrice)).toBe(9000);
    });

    it('rejects lowering the sale price below the existing minimum (400)', async () => {
      const { product } = await makeProduct(0);
      const res = await http()
        .patch(`/product/${product.id}`)
        .set(authHeader('managerA', HALL))
        .send({ basePrice: 7000 });
      expect(res.status).toBe(400);
      expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).basePrice)).toBe(9000);
    });

    it('rejects min > base sent together (400)', async () => {
      const { product } = await makeProduct(0);
      const res = await http()
        .patch(`/product/${product.id}`)
        .set(authHeader('ownerA', HALL))
        .send({ basePrice: 5000, minSalePrice: 6000 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Minimum price cannot be above the sale price');
    });

    it('accepts a valid minimum price update and persists it', async () => {
      const { product } = await makeProduct(0);
      const res = await http()
        .patch(`/product/${product.id}`)
        .set(authHeader('ownerA', HALL))
        .send({ minSalePrice: 8200 });
      expect(res.status).toBeLessThan(300);
      expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).minSalePrice)).toBe(8200);
    });

    it('forbids staff from editing products', async () => {
      const { product } = await makeProduct(0);
      await http().patch(`/product/${product.id}`).set(authHeader('staffA', HALL)).send({ minSalePrice: 100 }).expect(403);
      expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).minSalePrice)).toBe(8000);
    });

    it('hides tenant A products from tenant B on PATCH and details (404)', async () => {
      const headers = authHeader('ownerB', tenants.B.branches.mainBranch.id);
      const patch = await http().patch(`/product/${kb.productId}`).set(headers).send({ minSalePrice: 1 });
      expect(patch.status).toBeGreaterThanOrEqual(400);
      expect(patch.status).toBeLessThan(500);
      expect(patch.status).toBe(404);
      const det = await http().get(`/product/${kb.productId}/details`).set(headers);
      expect(det.status).toBe(404);
      const row = await prisma.product.findUniqueOrThrow({ where: { id: kb.productId } });
      expect(Number(row.minSalePrice)).toBe(kb.minSalePrice);
    });

    it('strips defaultCostPrice from product details for staff (deep) but not for the owner', async () => {
      const staff = await http().get(`/product/${kb.productId}/details`).set(authHeader('staffA', HALL)).expect(200);
      const staffKeys = collectKeys(staff.body);
      expect(staffKeys.has('defaultCostPrice')).toBe(false);
      expect(staffKeys.has('unitCost')).toBe(false);
      expect(staff.body.name ?? staff.body.product?.name).toBeTruthy();

      const owner = await http().get(`/product/${kb.productId}/details`).set(authHeader('ownerA', HALL)).expect(200);
      const ownerKeys = collectKeys(owner.body);
      expect(ownerKeys.has('defaultCostPrice')).toBe(true);
    });

    it('keeps defaultCostPrice in the PATCH response for the owner', async () => {
      const { product } = await makeProduct(0);
      const res = await http()
        .patch(`/product/${product.id}`)
        .set(authHeader('ownerA', HALL))
        .send({ lowStockThreshold: 2 });
      expect(res.status).toBeLessThan(300);
      expect(collectKeys(res.body).has('defaultCostPrice')).toBe(true);
    });
  });
});
