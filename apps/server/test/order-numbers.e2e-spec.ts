import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const BIZ = tenants.A.id;
const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;

describe('Per-branch order numbers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  const sell = (branchId: string, clientRef?: string) =>
    http()
      .post('/order/neworder')
      .set(authHeader('ownerA', branchId))
      .send({
        items: [
          {
            isService: true,
            quantity: 1,
            price: 100,
            serviceName: 'Order number test',
          },
        ],
        amountPaid: 100,
        paymentMethod: 'CASH',
        orderStatus: 'FINAL',
        ...(clientRef ? { clientRef } : {}),
      });

  const maxNumber = async (branchId?: string) =>
    (
      await prisma.order.aggregate({
        where: { businessId: BIZ, ...(branchId ? { branchId } : {}) },
        _max: { orderNumber: true },
      })
    )._max.orderNumber ?? 0;

  /**
   * Put a branch's counter back to the business max, the state a fresh seed
   * leaves. Earlier spec files create orders in one branch only, which pushes
   * that branch's counter ahead of the other; this keeps the expectations
   * meaningful without depending on file order.
   */
  const resetCounter = async (branchId: string) => {
    const last = await maxNumber();
    await prisma.orderNumberSequence.upsert({
      where: { businessId_branchId: { businessId: BIZ, branchId } },
      create: { businessId: BIZ, branchId, last },
      update: { last },
    });
    return last;
  };

  const counterOf = async (branchId: string) =>
    (
      await prisma.orderNumberSequence.findUniqueOrThrow({
        where: { businessId_branchId: { businessId: BIZ, branchId } },
      })
    ).last;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('gives each branch its own counter and a human label', async () => {
    const branches = await prisma.branch.findMany({
      where: { businessId: BIZ },
      select: { id: true, name: true, code: true },
    });
    const hall = branches.find((b) => b.id === HALL)!;
    const hafeez = branches.find((b) => b.id === HAFEEZ)!;
    expect(hall.code).toMatch(/^[A-Z]{2,4}$/);
    expect(hafeez.code).toMatch(/^[A-Z]{2,4}$/);

    const before = await resetCounter(HALL);
    await resetCounter(HAFEEZ);
    const [a, b] = await Promise.all([sell(HALL), sell(HAFEEZ)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Both branches start from the business max, so old receipts keep numbering.
    expect(a.body.order.orderNumber).toBe(before + 1);
    expect(b.body.order.orderNumber).toBe(before + 1);
    expect(a.body.order.orderLabel).toBe(`${hall.code}-${before + 1}`);
    expect(b.body.order.orderLabel).toBe(`${hafeez.code}-${before + 1}`);
  });

  it('20 concurrent sales in one branch get 20 distinct, gapless numbers', async () => {
    await resetCounter(HALL);
    const before = await counterOf(HALL);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => sell(HALL)),
    );
    for (const res of results) expect(res.status).toBe(201);
    const numbers = results
      .map((res) => res.body.order.orderNumber as number)
      .sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers).toEqual(
      Array.from({ length: 20 }, (_, i) => before + i + 1),
    );
    expect(await prisma.order.count({ where: { businessId: BIZ, branchId: HALL, orderNumber: { in: numbers } } })).toBe(20);
  });

  it('keeps the offline provisional ref on the synced order', async () => {
    const res = await sell(HALL, 'TMP-HR-ABC123');
    expect(res.status).toBe(201);
    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: res.body.order.id },
    });
    expect(saved.clientRef).toBe('TMP-HR-ABC123');
    expect(saved.branchId).toBe(HALL);
    expect(res.body.order.orderLabel).toMatch(/^[A-Z]{2,4}-\d+$/);
  });

  it('two offline tills syncing together still get distinct numbers', async () => {
    const [one, two] = await Promise.all([
      sell(HALL, 'TMP-HR-ONE001'),
      sell(HAFEEZ, 'TMP-HC-TWO002'),
    ]);
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(one.body.order.orderNumber).not.toBeUndefined();
    const saved = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: one.body.order.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: two.body.order.id } }),
    ]);
    expect(saved[0].clientRef).toBe('TMP-HR-ONE001');
    expect(saved[1].clientRef).toBe('TMP-HC-TWO002');
    expect(saved[0].orderNumber).not.toBe(saved[1].orderNumber);
  });

  it('leaves existing orders and their numbers untouched', async () => {
    const existing = await prisma.order.findFirstOrThrow({
      where: { businessId: BIZ },
      orderBy: { createdAt: 'asc' },
      select: { id: true, orderNumber: true, branchId: true },
    });
    const before = { ...existing };
    await sell(HALL);
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: existing.id },
      select: { id: true, orderNumber: true, branchId: true },
    });
    expect(after).toEqual(before);
    expect(after.branchId).not.toBeNull();
  });
});
