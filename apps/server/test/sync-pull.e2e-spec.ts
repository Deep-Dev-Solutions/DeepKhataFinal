import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants, users } from './setup/auth';

const BIZ = tenants.A.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;
const HALL = tenants.A.branches.hallRoad.id;
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

interface PullBody {
  entity: string;
  rows: Record<string, any>[];
  deleted: string[];
  cursor: string;
  hasMore: boolean;
  serverTime: string;
}

describe('Sync pull (e2e)', () => {
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

  const pull = (
    who: 'ownerA' | 'managerA' | 'staffA' | 'ownerB',
    branchId: string | undefined,
    query: Record<string, string | number>,
  ) =>
    request(app.getHttpServer())
      .get('/sync/pull')
      .query(query)
      .set(authHeader(who, branchId));

  async function ok(
    who: 'ownerA' | 'managerA' | 'staffA' | 'ownerB',
    branchId: string | undefined,
    query: Record<string, string | number>,
  ): Promise<PullBody> {
    const res = await pull(who, branchId, query);
    expect(res.status).toBe(200);
    return res.body as PullBody;
  }

  it('rejects an unknown entity, a bad cursor, an oversize limit and missing auth', async () => {
    expect((await pull('ownerA', HALL, { entity: 'orders' })).status).toBe(400);
    expect((await pull('ownerA', HALL, { entity: 'customers', cursor: '%%%' })).status).toBe(400);
    expect((await pull('ownerA', HALL, { entity: 'customers', limit: 5000 })).status).toBe(400);
    expect(
      (await request(app.getHttpServer()).get('/sync/pull').query({ entity: 'customers' })).status,
    ).toBe(401);
  });

  it('full load returns the shape, excludes soft-deleted rows and hides nothing from the tenant', async () => {
    const goneId = randomUUID();
    await prisma.customer.create({
      data: {
        id: goneId,
        name: 'Pull Gone',
        phone: `0321${uniq().slice(-7)}`,
        businessId: BIZ,
        deletedAt: new Date(),
      },
    });
    const body = await ok('ownerA', HALL, { entity: 'customers' });
    expect(body.entity).toBe('customers');
    expect(body.hasMore).toBe(false);
    expect(typeof body.cursor).toBe('string');
    expect(new Date(body.serverTime).getTime()).not.toBeNaN();
    expect(body.deleted).toEqual([]);
    expect(body.rows.map((r) => r.id)).not.toContain(goneId);
    const live = await prisma.customer.count({ where: { businessId: BIZ, deletedAt: null } });
    expect(body.rows).toHaveLength(live);
    expect(Object.keys(body.rows[0])).not.toContain('cnicNumber');
    expect(Object.keys(body.rows[0])).not.toContain('deletedAt');

    for (const entity of ['products', 'instances', 'vendors', 'categories', 'cabinets', 'branches']) {
      const b = await ok('ownerA', HALL, { entity });
      expect(b.entity).toBe(entity);
      expect(b.rows.length).toBeGreaterThan(0);
    }
  });

  it('cursor delta returns only rows changed after it, then tombstones after a soft delete', async () => {
    const id = randomUUID();
    await prisma.customer.create({
      data: { id, name: 'Delta One', phone: `0322${uniq().slice(-7)}`, businessId: BIZ },
    });
    const full = await ok('ownerA', HALL, { entity: 'customers' });
    expect(full.rows.map((r) => r.id)).toContain(id);

    const idle = await ok('ownerA', HALL, { entity: 'customers', cursor: full.cursor });
    expect(idle.rows).toEqual([]);
    expect(idle.deleted).toEqual([]);
    expect(idle.hasMore).toBe(false);

    await prisma.customer.update({ where: { id }, data: { name: 'Delta Two' } });
    const delta = await ok('ownerA', HALL, { entity: 'customers', cursor: full.cursor });
    expect(delta.rows.map((r) => r.id)).toEqual([id]);
    expect(delta.rows[0].name).toBe('Delta Two');
    expect(delta.deleted).toEqual([]);

    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    const tomb = await ok('ownerA', HALL, { entity: 'customers', cursor: delta.cursor });
    expect(tomb.rows).toEqual([]);
    expect(tomb.deleted).toEqual([id]);

    const after = await ok('ownerA', HALL, { entity: 'customers' });
    expect(after.rows.map((r) => r.id)).not.toContain(id);
  });

  it('pages with limit=2 without gaps or repeats', async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.customer.create({
        data: { name: `Page ${i}`, phone: `0323${uniq().slice(-7)}`, businessId: BIZ },
      });
    }
    const expected = await prisma.customer.findMany({
      where: { businessId: BIZ, deletedAt: null },
      select: { id: true },
    });
    expect(expected.length).toBeGreaterThan(2);

    const seen: string[] = [];
    const tombstones: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const body = await ok('ownerA', HALL, {
        entity: 'customers',
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      // Tombstones (soft-deleted rows) count towards the page size.
      expect(body.rows.length + body.deleted.length).toBeLessThanOrEqual(2);
      seen.push(...body.rows.map((r) => r.id));
      tombstones.push(...body.deleted);
      cursor = body.cursor;
      pages++;
      if (!body.hasMore) break;
      expect(body.rows.length + body.deleted.length).toBe(2);
      expect(pages).toBeLessThan(500);
    }
    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(expected.map((e) => e.id).sort());
    expect(tombstones.filter((id) => seen.includes(id))).toEqual([]);
  });

  it('STAFF never receives cost fields; owners do', async () => {
    const staffProducts = await ok('staffA', HALL, { entity: 'products' });
    expect(staffProducts.rows.length).toBeGreaterThan(0);
    for (const r of staffProducts.rows) expect(r).not.toHaveProperty('defaultCostPrice');
    const staffInstances = await ok('staffA', HALL, { entity: 'instances' });
    expect(staffInstances.rows.length).toBeGreaterThan(0);
    for (const r of staffInstances.rows) expect(r).not.toHaveProperty('unitCost');
    expect(JSON.stringify(staffProducts)).not.toMatch(/defaultCostPrice|unitCost/);

    const ownerProducts = await ok('ownerA', HALL, { entity: 'products' });
    expect(ownerProducts.rows[0]).toHaveProperty('defaultCostPrice');
    const ownerInstances = await ok('ownerA', HALL, { entity: 'instances' });
    expect(ownerInstances.rows[0]).toHaveProperty('unitCost');
  });

  it('instances cover only the active branch; other branches appear only in stockSummary', async () => {
    const inst = await ok('ownerA', HALL, { entity: 'instances' });
    expect(inst.rows.every((r) => r.branchId === HALL)).toBe(true);

    const summary = await ok('ownerA', HALL, { entity: 'stockSummary', cursor: 'ignored' });
    expect(summary.hasMore).toBe(false);
    expect(summary.deleted).toEqual([]);
    expect(summary.rows.length).toBeGreaterThan(0);
    expect(summary.rows.every((r) => r.branchId !== HALL)).toBe(true);
    expect(summary.rows.every((r) => r.branchId === HAFEEZ)).toBe(true);
    const sample = summary.rows[0];
    expect(Object.keys(sample).sort()).toEqual(['available', 'branchId', 'condition', 'productId']);
    const count = await prisma.productInstance.count({
      where: {
        productId: sample.productId,
        branchId: sample.branchId,
        condition: sample.condition,
        status: 'AVAILABLE',
      },
    });
    expect(sample.available).toBe(count);

    // Switching the active branch flips which side the rows are on.
    const flipped = await ok('ownerA', HAFEEZ, { entity: 'stockSummary' });
    expect(flipped.rows.every((r) => r.branchId === HALL)).toBe(true);
    const hafeezInstances = await ok('ownerA', HAFEEZ, { entity: 'instances' });
    expect(hafeezInstances.rows.every((r) => r.branchId === HAFEEZ)).toBe(true);
  });

  it('tenant B sees none of tenant A and cannot use a tenant A branch', async () => {
    const aCustomer = await prisma.customer.findFirstOrThrow({ where: { businessId: BIZ } });
    const bBranch = tenants.B.branches.mainBranch.id;
    for (const entity of [
      'products',
      'instances',
      'stockSummary',
      'customers',
      'vendors',
      'categories',
      'cabinets',
      'branches',
    ]) {
      const body = await ok('ownerB', bBranch, { entity });
      const text = JSON.stringify(body.rows);
      expect(text).not.toContain(BIZ);
      expect(text).not.toContain(aCustomer.id);
      expect(text).not.toContain(HALL);
      expect(text).not.toContain(HAFEEZ);
    }
    const branches = await ok('ownerB', bBranch, { entity: 'branches' });
    expect(branches.rows.map((r) => r.id)).toEqual([bBranch]);

    expect((await pull('ownerB', HALL, { entity: 'customers' })).status).toBe(403);
  });

  it('a UserBranch restriction limits branches, cabinets and the active branch', async () => {
    await prisma.user.update({ where: { id: users.managerA.id }, data: { allBranches: false } });
    await prisma.userBranch.create({ data: { userId: users.managerA.id, branchId: HALL } });
    try {
      const branches = await ok('managerA', HALL, { entity: 'branches' });
      expect(branches.rows.map((r) => r.id)).toEqual([HALL]);

      const cabinets = await ok('managerA', HALL, { entity: 'cabinets' });
      expect(cabinets.rows.every((r) => r.branchId === HALL)).toBe(true);

      const products = await ok('managerA', HALL, { entity: 'products' });
      expect(products.rows.every((r) => r.branchId === null || r.branchId === HALL)).toBe(true);

      const summary = await ok('managerA', HALL, { entity: 'stockSummary' });
      expect(summary.rows).toEqual([]);

      expect((await pull('managerA', HAFEEZ, { entity: 'instances' })).status).toBe(403);
    } finally {
      await prisma.userBranch.deleteMany({ where: { userId: users.managerA.id } });
      await prisma.user.update({ where: { id: users.managerA.id }, data: { allBranches: true } });
    }
  });

  it('instances need an active branch header', async () => {
    expect((await pull('ownerA', undefined, { entity: 'instances' })).status).toBe(400);
  });
});
