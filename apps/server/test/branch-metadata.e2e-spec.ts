import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const BIZ = tenants.A.id;
const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;

describe('Branch metadata for the add-product modal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const stamp = Date.now();

  const hallCategory = `Hall Cat ${stamp}`;
  const hafeezCategory = `Hafeez Cat ${stamp}`;
  const globalCategory = `Global Cat ${stamp}`;
  const hallCabinet = `Hall Cabinet ${stamp}`;
  const hafeezCabinet = `Hafeez Cabinet ${stamp}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();

    await prisma.category.createMany({
      data: [
        { name: hallCategory, businessId: BIZ, branchId: HALL },
        { name: hafeezCategory, businessId: BIZ, branchId: HAFEEZ },
        { name: globalCategory, businessId: BIZ, branchId: null },
      ],
    });
    await prisma.cabinet.createMany({
      data: [
        { name: hallCabinet, businessId: BIZ, branchId: HALL, rack: 'R1' },
        { name: hafeezCabinet, businessId: BIZ, branchId: HAFEEZ, rack: 'R2' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const names = (body: any, key: 'categories' | 'cabinets') =>
    (body[key] as Array<{ name: string }>).map((row) => row.name);

  it('returns categories for the branch in the header plus global ones', async () => {
    const hall = await http()
      .get('/product/getcategories')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    const hallNames = names(hall.body, 'categories');
    expect(hallNames).toContain(hallCategory);
    expect(hallNames).toContain(globalCategory);
    expect(hallNames).not.toContain(hafeezCategory);

    const hafeez = await http()
      .get('/product/getcategories')
      .set(authHeader('ownerA', HAFEEZ))
      .expect(200);
    const hafeezNames = names(hafeez.body, 'categories');
    expect(hafeezNames).toContain(hafeezCategory);
    expect(hafeezNames).not.toContain(hallCategory);
  });

  it('returns only the cabinets of the branch in the header', async () => {
    const hall = await http()
      .get('/product/getcabinets')
      .set(authHeader('ownerA', HALL))
      .expect(200);
    const hallNames = names(hall.body, 'cabinets');
    expect(hallNames).toContain(hallCabinet);
    expect(hallNames).not.toContain(hafeezCabinet);

    const hafeez = await http()
      .get('/product/getcabinets')
      .set(authHeader('ownerA', HAFEEZ))
      .expect(200);
    const hafeezNames = names(hafeez.body, 'cabinets');
    expect(hafeezNames).toContain(hafeezCabinet);
    expect(hafeezNames).not.toContain(hallCabinet);
  });

  it('requires the x-branch-id header', async () => {
    const res = await http()
      .get('/product/getcabinets')
      .set(authHeader('ownerA'))
      .expect(400);
    expect(res.body.message).toBe('x-branch-id header is required');
  });
});
