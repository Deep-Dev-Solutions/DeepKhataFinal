import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const BIZ = tenants.A.id;
const HALL = tenants.A.branches.hallRoad.id;

describe('Unit serial numbers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const stamp = Date.now();
  const category = `Serials Cat ${stamp}`;
  let cabinetId: string;

  const serials = async (productId: string) =>
    (
      await prisma.productInstance.findMany({
        where: { productId },
        select: { serialNumber: true },
      })
    )
      .map((row) => row.serialNumber)
      .filter((value): value is string => Boolean(value))
      .sort();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    await prisma.category.create({
      data: { name: category, businessId: BIZ },
    });
    const cabinet = await prisma.cabinet.create({
      data: { name: `Serial Cab ${stamp}`, businessId: BIZ, branchId: HALL },
    });
    cabinetId = cabinet.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it('continues the product SKU numbering on create and on every restock', async () => {
    const created = await http()
      .post('/product/addproduct')
      .set(authHeader('ownerA', HALL))
      .send({
        name: `Serials ${stamp}`,
        sku: 'SKU-0007',
        price: 500,
        category,
        branchId: HALL,
        cabinetId,
        quantity: 2,
      })
      .expect(201);
    const productId = created.body.product.id as string;
    expect(await serials(productId)).toEqual(['SKU-0007-1', 'SKU-0007-2']);

    await http()
      .post('/inventory/restock')
      .set(authHeader('ownerA', HALL))
      .send({
        items: [{ productId, branchId: HALL, cabinetId, quantity: 3 }],
      })
      .expect(201);
    expect(await serials(productId)).toEqual([
      'SKU-0007-1',
      'SKU-0007-2',
      'SKU-0007-3',
      'SKU-0007-4',
      'SKU-0007-5',
    ]);

    // A second restock must not restart at 1 either.
    await http()
      .post('/inventory/restock')
      .set(authHeader('ownerA', HALL))
      .send({
        items: [{ productId, branchId: HALL, cabinetId, quantity: 1 }],
      })
      .expect(201);
    expect(await serials(productId)).toContain('SKU-0007-6');
  });

  it('numbers the units of a product created without a sku', async () => {
    const created = await http()
      .post('/product/addproduct')
      .set(authHeader('ownerA', HALL))
      .send({
        name: `Serials no sku ${stamp}`,
        price: 400,
        category,
        branchId: HALL,
        cabinetId,
        quantity: 2,
      })
      .expect(201);
    const product = created.body.product as { id: string; sku: string };
    expect(product.sku).toMatch(/^SKU-\d{4}$/);
    expect(await serials(product.id)).toEqual([
      `${product.sku}-1`,
      `${product.sku}-2`,
    ]);
  });

  it('numbers the units created by a CSV import and by bulk restock', async () => {
    const sku = `IMP-${stamp}`;
    await http()
      .post('/product/import')
      .set(authHeader('ownerA', HALL))
      .send({ products: [{ name: `Imported ${stamp}`, sku, category, price: 900, stock: 2 }] })
      .expect(201);
    const imported = await prisma.product.findFirstOrThrow({
      where: { businessId: BIZ, sku },
    });
    expect(await serials(imported.id)).toEqual([`${sku}-1`, `${sku}-2`]);

    await http()
      .post('/product/bulk-restock')
      .set(authHeader('ownerA', HALL))
      .send({ productId: imported.id, branchId: HALL, cabinetId, quantity: 2 })
      .expect(201);
    expect(await serials(imported.id)).toEqual([
      `${sku}-1`,
      `${sku}-2`,
      `${sku}-3`,
      `${sku}-4`,
    ]);
  });
});
