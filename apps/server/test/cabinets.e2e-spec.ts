import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';

const BIZ = tenants.A.id;
const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;

describe('Duplicate cabinets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const stamp = Date.now();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  const create = (body: Record<string, unknown>) => {
    const owner = http()
      .post('/cabinet')
      .set(authHeader('ownerA', HALL))
      .send({ branchId: HALL, ...body });
    return owner;
  };

  it('rejects the same name and location again, ignoring case and spaces', async () => {
    const name = `Cabinet ${stamp}`;
    const first = await create({ name, rack: 'R1', shelf: 'S1', bin: 'B1' }).expect(201);
    const duplicate = await create({ name: `  ${name.toLowerCase()}  `, rack: ' r1 ', shelf: 's1', bin: 'b1' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toContain('Yeh cabinet pehle se mojood hai');
    expect(duplicate.body.message).toContain(name);
    expect(duplicate.body.message).toContain('Rack R1');
    expect(
      await prisma.cabinet.count({ where: { businessId: BIZ, name: { equals: name, mode: 'insensitive' }, deletedAt: null } }),
    ).toBe(1);
    expect(first.body.cabinet.id).toBeTruthy();
  });

  it('allows the same name in a different bin or a different branch', async () => {
    const name = `Cabinet Bins ${stamp}`;
    await create({ name, rack: 'R2', shelf: 'S2', bin: 'B2' }).expect(201);
    await create({ name, rack: 'R2', shelf: 'S2', bin: 'B9' }).expect(201);
    await http()
      .post('/cabinet')
      .set(authHeader('ownerA', HAFEEZ))
      .send({ branchId: HAFEEZ, name, rack: 'R2', shelf: 'S2', bin: 'B2' })
      .expect(201);
  });

  it('rejects an update that would duplicate another cabinet, but allows saving itself', async () => {
    const a = await create({ name: `Edit A ${stamp}`, rack: 'RA', shelf: 'SA', bin: 'BA' }).expect(201);
    const b = await create({ name: `Edit B ${stamp}`, rack: 'RB', shelf: 'SB', bin: 'BB' }).expect(201);

    // Moving B onto A's name+location is refused.
    const clash = await http()
      .patch(`/cabinet/${b.body.cabinet.id}`)
      .set(authHeader('ownerA', HALL))
      .send({ name: `edit a ${stamp}`, rack: 'ra', shelf: 'sa', bin: 'ba' });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain(`Edit A ${stamp}`);

    // Re-saving B unchanged must not count B as its own duplicate.
    const same = await http()
      .patch(`/cabinet/${b.body.cabinet.id}`)
      .set(authHeader('ownerA', HALL))
      .send({ name: `Edit B ${stamp}`, rack: 'RB', shelf: 'SB', bin: 'BB' })
      .expect(200);
    expect(same.body.cabinet.name).toBe(`Edit B ${stamp}`);
    expect(a.body.cabinet.id).toBeTruthy();
  });

  it('ignores soft-deleted cabinets when looking for a duplicate', async () => {
    const name = `Deleted Cab ${stamp}`;
    const created = await create({ name, rack: 'RD', shelf: 'SD', bin: 'BD' }).expect(201);
    await prisma.cabinet.update({
      where: { id: created.body.cabinet.id },
      data: { deletedAt: new Date() },
    });

    await create({ name, rack: 'RD', shelf: 'SD', bin: 'BD' }).expect(201);
    const visible = await http().get('/cabinet').set(authHeader('ownerA', HALL)).expect(200);
    const rows = (visible.body.cabinets as Array<{ name: string }>).filter((c) => c.name === name);
    expect(rows).toHaveLength(1);
  });

  it('validates the cabinet body', async () => {
    const tooLong = await create({ name: 'x'.repeat(61) });
    expect(tooLong.status).toBe(400);

    const wrongBranchType = await http()
      .post('/cabinet')
      .set(authHeader('ownerA', HALL))
      .send({ name: 'Bad Branch', branchId: 'not-a-uuid' });
    expect(wrongBranchType.status).toBe(400);

    const tenantBBranch = await http()
      .post('/cabinet')
      .set(authHeader('ownerB', tenants.B.branches.mainBranch.id))
      .send({ name: `Cross ${stamp}`, branchId: HALL });
    expect(tenantBBranch.status).toBe(400);
  });

  it('invalidates the cached cabinet lists after create and delete', async () => {
    const before = await http().get('/cabinet').set(authHeader('ownerA', HALL)).expect(200);
    const countBefore = (before.body.cabinets as unknown[]).length;

    const name = `Cache Cab ${stamp}`;
    const created = await create({ name, rack: 'RC', shelf: 'SC', bin: 'BC' }).expect(201);

    const afterCreate = await http().get('/cabinet').set(authHeader('ownerA', HALL)).expect(200);
    expect((afterCreate.body.cabinets as unknown[]).length).toBe(countBefore + 1);
    expect((afterCreate.body.cabinets as Array<{ name: string }>).some((c) => c.name === name)).toBe(true);

    const allBranches = await http().get('/cabinet').set(authHeader('ownerA', HALL)).expect(200);
    expect((allBranches.body.cabinets as unknown[]).length).toBe(countBefore + 1);

    await http()
      .post(`/cabinet/${created.body.cabinet.id}/delete`)
      .set(authHeader('ownerA', HALL))
      .expect(201);
    const afterDelete = await http().get('/cabinet').set(authHeader('ownerA', HALL)).expect(200);
    expect((afterDelete.body.cabinets as Array<{ name: string }>).some((c) => c.name === name)).toBe(false);
  });
});
