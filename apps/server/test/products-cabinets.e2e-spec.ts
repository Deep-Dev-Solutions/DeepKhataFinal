import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const BIZ = tenants.A.id;
const HALL = tenants.A.branches.hallRoad.id;
const token = () => randomUUID().slice(0, 8);

describe('Product list cabinets (e2e)', () => {
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

  it('returns every cabinet with its unit count plus totalUnits', async () => {
    const stamp = token();
    const category = await prisma.category.findFirstOrThrow({
      where: { businessId: BIZ },
    });
    const product = await prisma.product.create({
      data: {
        name: `Multi cabinet ${stamp}`,
        sku: `MC-${stamp}`,
        basePrice: 900,
        businessId: BIZ,
        categoryId: category.id,
      },
    });
    const cabinetA = await prisma.cabinet.create({
      data: {
        name: `MC A ${stamp}`,
        businessId: BIZ,
        branchId: HALL,
        location: 'Rack R1 -> Shelf S1 -> Bin B1',
      },
    });
    const cabinetB = await prisma.cabinet.create({
      data: {
        name: `MC B ${stamp}`,
        businessId: BIZ,
        branchId: HALL,
      },
    });
    await prisma.productInstance.createMany({
      data: [
        { productId: product.id, cabinetId: cabinetA.id, branchId: HALL, status: 'AVAILABLE' },
        { productId: product.id, cabinetId: cabinetA.id, branchId: HALL, status: 'AVAILABLE' },
        { productId: product.id, cabinetId: cabinetB.id, branchId: HALL, status: 'AVAILABLE' },
      ],
    });

    const res = await http()
      .get('/product/getproducts')
      .query({ search: `MC-${stamp}` })
      .set(authHeader('ownerA', HALL))
      .expect(200);

    const row = (res.body.products as Array<any>).find((p) => p.id === product.id);
    expect(row).toBeTruthy();
    expect(row.totalUnits).toBe(3);
    expect(row.stock).toBe(3);
    expect(row.cabinets).toHaveLength(2);

    const first = row.cabinets.find((c: any) => c.id === cabinetA.id);
    expect(first).toMatchObject({
      id: cabinetA.id,
      name: cabinetA.name,
      location: 'Rack R1 -> Shelf S1 -> Bin B1',
      units: 2,
    });
    const second = row.cabinets.find((c: any) => c.id === cabinetB.id);
    expect(second.units).toBe(1);
    // Biggest stock first, so the list can render "A +1".
    expect(row.cabinets[0].id).toBe(cabinetA.id);
  });
});
