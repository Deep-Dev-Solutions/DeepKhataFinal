import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const BIZ = tenants.A.id;
const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;

describe('Stock transfer requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const stamp = Date.now();

  let productId = '';
  let cabinetId = '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();

    const category = await prisma.category.findFirstOrThrow({
      where: { businessId: BIZ },
    });
    const cabinet = await prisma.cabinet.findFirstOrThrow({
      where: { businessId: BIZ, branchId: HAFEEZ },
    });
    cabinetId = cabinet.id;
    const product = await prisma.product.create({
      data: {
        name: `Transfer test ${stamp}`,
        sku: `TR-${stamp}`,
        basePrice: 900,
        businessId: BIZ,
        categoryId: category.id,
      },
    });
    productId = product.id;
    await prisma.productInstance.createMany({
      data: [
        { productId, cabinetId, branchId: HAFEEZ, status: 'AVAILABLE' },
        { productId, cabinetId, branchId: HAFEEZ, status: 'AVAILABLE' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const createTransfer = (
    branchId: string | null,
    body: Record<string, unknown>,
    user: 'ownerA' | 'ownerB' = 'ownerA',
  ) => {
    const req = http().post('/stock-transfers');
    return (branchId ? req.set(authHeader(user, branchId)) : req.set(authHeader(user))).send(body);
  };

  it('creates a request for units sitting in another branch', async () => {
    const res = await createTransfer(HALL, {
      fromBranchId: HAFEEZ,
      productId,
      quantity: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED');
    expect(res.body.fromBranch.id).toBe(HAFEEZ);
    expect(res.body.toBranch.id).toBe(HALL);
    expect(res.body.lines).toEqual([
      expect.objectContaining({ productId, quantity: 2 }),
    ]);
    expect(
      await prisma.stockTransferItem.count({ where: { transferId: res.body.id } }),
    ).toBe(2);
  });

  it('refuses more units than the source branch has, with the exact message', async () => {
    const res = await createTransfer(HALL, {
      fromBranchId: HAFEEZ,
      productId,
      quantity: 3,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only 2 available at Hafeez Centre');
  });

  it('refuses a request with no active branch, exactly as the B5 repro showed', async () => {
    const res = await createTransfer(null, {
      fromBranchId: HAFEEZ,
      productId,
      quantity: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Select your branch first');
  });

  it('hides another tenant’s transfers and branches', async () => {
    const created = await createTransfer(HALL, {
      fromBranchId: HAFEEZ,
      productId,
      quantity: 1,
    }).expect(201);

    const other = tenants.B.branches.mainBranch.id;
    const list = await http()
      .get('/stock-transfers')
      .set(authHeader('ownerB', other));
    expect(list.status).toBe(200);
    expect(
      (list.body.items as Array<{ id: string }>).some((t) => t.id === created.body.id),
    ).toBe(false);

    const one = await http()
      .get(`/stock-transfers/${created.body.id}`)
      .set(authHeader('ownerB', other));
    expect(one.status).toBe(404);

    const fromTenantA = await createTransfer(
      other,
      { fromBranchId: HAFEEZ, productId, quantity: 1 },
      'ownerB',
    );
    expect(fromTenantA.status).toBe(404);
  });
});
