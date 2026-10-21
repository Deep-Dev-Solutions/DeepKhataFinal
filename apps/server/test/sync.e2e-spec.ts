import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

describe('Offline sync batch (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const hallRoad = tenants.A.branches.hallRoad.id;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const post = (user: 'ownerA' | 'ownerB', branchId: string, items: unknown[]) =>
    request(app.getHttpServer())
      .post('/sync/batch')
      .set(authHeader(user, branchId))
      .send({ items });

  async function walkInPayload() {
    const instance = await prisma.productInstance.findFirst({
      where: {
        status: 'AVAILABLE',
        branchId: hallRoad,
        product: { businessId: tenants.A.id, deletedAt: null, minSalePrice: null },
      },
      include: { product: true },
    });
    expect(instance).not.toBeNull();
    const price = Number(instance!.product.basePrice);
    return {
      productId: instance!.productId,
      payload: {
        walkInName: 'Sync Walk-in',
        items: [{ productId: instance!.productId, quantity: 1, price }],
        amountPaid: price,
        orderStatus: 'FINAL',
        paymentMethod: 'CASH',
        branchId: hallRoad,
      },
    };
  }

  it('fails unsupported actions, syncs valid orders, is idempotent and tenant-safe', async () => {
    const { payload, productId } = await walkInPayload();
    const availableCount = () =>
      prisma.productInstance.count({
        where: { productId, branchId: hallRoad, status: 'AVAILABLE' },
      });
    const availableBefore = await availableCount();
    const badId = randomUUID();
    const orderId = randomUUID();
    const orderItem = { id: orderId, type: 'CREATE_ORDER', payload };

    const first = await post('ownerA', hallRoad, [
      { id: badId, type: 'UNKNOWN_ACTION', payload: {} },
      orderItem,
    ]).expect((r) => expect(r.status).toBeLessThan(300));
    expect(first.body.results[0].status).toBe('failed');
    expect(first.body.results[0].reason).toContain('Unsupported');
    expect(first.body.results[1].status).toBe('synced');
    expect(first.body.results[1].id).toBe(orderId);

    const created = await prisma.order.findMany({ where: { id: orderId } });
    expect(created).toHaveLength(1);
    expect(created[0].businessId).toBe(tenants.A.id);
    expect(await availableCount()).toBe(availableBefore - 1);

    // Replay: still synced, no duplicate order.
    const replay = await post('ownerA', hallRoad, [orderItem]).expect((r) =>
      expect(r.status).toBeLessThan(300),
    );
    expect(replay.body.results[0].status).toBe('synced');
    expect(await prisma.order.count({ where: { id: orderId } })).toBe(1);
    expect(await availableCount()).toBe(availableBefore - 1);

    // Another tenant reusing the id must never be reported as synced.
    const foreign = await post('ownerB', tenants.B.branches.mainBranch.id, [orderItem]).expect(
      (r) => expect(r.status).toBeLessThan(300),
    );
    expect(foreign.body.results[0].status).toBe('failed');
    expect(foreign.body.results[0].reason).toBe('Order id already in use');
    expect(await prisma.order.count({ where: { id: orderId } })).toBe(1);
    expect(await prisma.order.count({ where: { id: orderId, businessId: tenants.B.id } })).toBe(0);
  });

  it('flags only /sync orders as offline-synced; a client cannot set the flag', async () => {
    const productId = randomUUID();
    await prisma.product.create({
      data: {
        id: productId,
        name: `Sync Flag ${Date.now()}`,
        sku: `SYNCFLAG-${Date.now()}`,
        basePrice: 100,
        businessId: tenants.A.id,
      },
    });
    await prisma.productInstance.createMany({
      data: [1, 2, 3].map(() => ({ id: randomUUID(), productId, branchId: hallRoad, status: 'AVAILABLE' as const })),
    });
    const payload = {
      walkInName: 'Sync Walk-in',
      items: [{ productId, quantity: 1, price: 100 }],
      amountPaid: 100,
      orderStatus: 'FINAL',
      paymentMethod: 'CASH',
      branchId: hallRoad,
    };
    const syncedId = randomUUID();
    const syncItem = { id: syncedId, type: 'CREATE_ORDER', payload: { ...payload, isOfflineSync: false } };

    const pushed = await post('ownerA', hallRoad, [syncItem]).expect((r) =>
      expect(r.status).toBeLessThan(300),
    );
    expect(pushed.body.results[0].status).toBe('synced');
    const synced = await prisma.order.findUniqueOrThrow({ where: { id: syncedId } });
    expect(synced.isOfflineSync).toBe(true);

    // Replay keeps one row and the flag.
    await post('ownerA', hallRoad, [syncItem]).expect((r) => expect(r.status).toBeLessThan(300));
    expect(await prisma.order.count({ where: { id: syncedId } })).toBe(1);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: syncedId } })).isOfflineSync,
    ).toBe(true);

    // A normal online order is not flagged, even when the client asks for it.
    const online = await request(app.getHttpServer())
      .post('/order/neworder')
      .set(authHeader('ownerA', hallRoad))
      .send({ ...payload, isOfflineSync: true });
    expect(online.status).toBeLessThan(300);
    const onlineRow = await prisma.order.findUniqueOrThrow({ where: { id: online.body.order.id } });
    expect(onlineRow.isOfflineSync).toBe(false);

    const plain = await request(app.getHttpServer())
      .post('/order/neworder')
      .set(authHeader('ownerA', hallRoad))
      .send(payload);
    expect(plain.status).toBeLessThan(300);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: plain.body.order.id } })).isOfflineSync,
    ).toBe(false);
  });
});
