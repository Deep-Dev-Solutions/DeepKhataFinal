import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { catalog } from '../../e2e/fixtures/catalog';

const BIZ = tenants.A.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;
const HALL_ROAD = tenants.A.branches.hallRoad.id;
const letters = () =>
  Array.from({ length: 12 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

/** Every key name appearing anywhere in a JSON value. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe('Product list: pagination, search, freshness, cost hiding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const list = (user: 'ownerA' | 'staffA', query: Record<string, string | number> = {}, branch = HAFEEZ) =>
    http().get('/product/getproducts').query(query).set(authHeader(user, branch));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  describe('pagination', () => {
    let fullIds: string[];

    beforeAll(async () => {
      const res = await list('ownerA', { limit: 500 }).expect(200);
      fullIds = res.body.products.map((p: any) => p.id);
    });

    it('the unpaged list holds every visible product exactly once and no cursor', async () => {
      const res = await list('ownerA').expect(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.products.map((p: any) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(fullIds);
      expect(res.headers['x-next-cursor']).toBeUndefined();

      const visible = await prisma.product.count({
        where: { businessId: BIZ, deletedAt: null, OR: [{ branchId: null }, { branchId: HAFEEZ }] },
      });
      expect(ids.length).toBe(visible);
      expect(ids.length).toBeGreaterThan(20);
    });

    it.each([5, 40])('walking pages of %i returns each product exactly once, in the unpaged order', async (limit) => {
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await list('ownerA', cursor ? { limit, cursor } : { limit }).expect(200);
        const products = res.body.products as any[];
        expect(products.length).toBeGreaterThan(0);
        expect(products.length).toBeLessThanOrEqual(limit);
        seen.push(...products.map((p) => p.id));
        const next = res.headers['x-next-cursor'] as string | undefined;
        // A cursor is only offered when the page is full.
        if (next) expect(products).toHaveLength(limit);
        cursor = next;
        pages += 1;
        expect(pages).toBeLessThan(fullIds.length + 2);
      } while (cursor);

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(fullIds);
      expect(pages).toBe(Math.ceil(fullIds.length / limit));
    });

    it('limit=5 returns at most 5 products and a cursor', async () => {
      const res = await list('ownerA', { limit: 5 }).expect(200);
      expect(res.body.products).toHaveLength(5);
      expect(typeof res.headers['x-next-cursor']).toBe('string');
      expect(res.headers['x-next-cursor'].length).toBeGreaterThan(0);
    });

    it('the last page carries no cursor when the limit equals the total', async () => {
      const exact = await list('ownerA', { limit: fullIds.length }).expect(200);
      expect(exact.body.products).toHaveLength(fullIds.length);
      expect(exact.headers['x-next-cursor']).toBeUndefined();

      const short = await list('ownerA', { limit: fullIds.length - 1 }).expect(200);
      expect(short.body.products).toHaveLength(fullIds.length - 1);
      const next = short.headers['x-next-cursor'];
      expect(next).toBeTruthy();
      const tail = await list('ownerA', { limit: fullIds.length - 1, cursor: next }).expect(200);
      expect(tail.body.products.map((p: any) => p.id)).toEqual([fullIds[fullIds.length - 1]]);
      expect(tail.headers['x-next-cursor']).toBeUndefined();
    });

    it('clamps nonsense limits instead of failing', async () => {
      const zero = await list('ownerA', { limit: 0 }).expect(200);
      expect(zero.body.products).toHaveLength(1);
      const huge = await list('ownerA', { limit: 99999 }).expect(200);
      expect(huge.body.products.map((p: any) => p.id)).toEqual(fullIds);
      const junk = await list('ownerA', { limit: 'abc' }).expect(200);
      expect(junk.body.products.map((p: any) => p.id)).toEqual(fullIds);
    });

    it('requires the x-branch-id header', async () => {
      const res = await http().get('/product/getproducts').set(authHeader('ownerA'));
      expect(res.status).toBe(400);
    });

    it('a search is paged too, without duplicates across pages', async () => {
      const full = await list('ownerA', { search: 'keyboard', limit: 500 }).expect(200);
      const fullSearch = full.body.products.map((p: any) => p.id);
      expect(fullSearch.length).toBeGreaterThan(3);
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await list('ownerA', cursor ? { search: 'keyboard', limit: 2, cursor } : { search: 'keyboard', limit: 2 }).expect(200);
        seen.push(...res.body.products.map((p: any) => p.id));
        cursor = res.headers['x-next-cursor'];
      } while (cursor);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(fullSearch);
    });
  });

  describe('search', () => {
    it('finds the 840 G3 keyboard by a correct word', async () => {
      const res = await list('ownerA', { search: 'keyboard' }).expect(200);
      const hit = res.body.products.find((p: any) => p.id === catalog.keyboard840.productId);
      expect(hit).toBeDefined();
      expect(hit.sku).toBe(catalog.keyboard840.sku);
      expect(hit.stock).toBe(3);
    });

    // Regression: plain similarity() over the whole searchText dropped one-word typos;
    // search now also matches on word_similarity().
    it('finds the 840 G3 keyboard despite the typo "keybord"', async () => {
      const res = await list('ownerA', { search: 'keybord' }).expect(200);
      expect(res.body.products.map((p: any) => p.id)).toContain(catalog.keyboard840.productId);
    });

    it('returns the keyboard first when searching by its part number', async () => {
      const res = await list('ownerA', { search: catalog.keyboard840.partNumber }).expect(200);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.products[0].id).toBe(catalog.keyboard840.productId);
      expect(res.body.products[0].partNumber).toBe(catalog.keyboard840.partNumber);
    });

    it('returns the keyboard first for its exact SKU', async () => {
      const res = await list('ownerA', { search: catalog.keyboard840.sku }).expect(200);
      expect(res.body.products[0].id).toBe(catalog.keyboard840.productId);
    });

    it('matches an alias', async () => {
      const res = await list('ownerA', { search: '840 g3 keyboard' }).expect(200);
      expect(res.body.products.map((p: any) => p.id)).toContain(catalog.keyboard840.productId);
    });

    it('returns an empty list for a term that matches nothing', async () => {
      const res = await list('ownerA', { search: 'zzqxjvkwpq' }).expect(200);
      expect(res.body.products).toEqual([]);
      expect(res.headers['x-next-cursor']).toBeUndefined();
    });

    it('does not leak another tenant\'s products', async () => {
      const res = await http()
        .get('/product/getproducts')
        .query({ limit: 500 })
        .set(authHeader('ownerB', tenants.B.branches.mainBranch.id))
        .expect(200);
      const bProducts = await prisma.product.findMany({ where: { businessId: BIZ }, select: { id: true } });
      const aIds = new Set(bProducts.map((p) => p.id));
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.products.every((p: any) => !aIds.has(p.id))).toBe(true);
    });
  });

  describe('restock signal (lowStockThreshold + branch stock)', () => {
    // The Products page computes "Needs restock" on the client from these two
    // fields, so the contract is: stock is the active branch's AVAILABLE count
    // and lowStockThreshold is the product's own threshold (null = default 5).
    it('returns both fields so the low-stock count matches the product rule', async () => {
      const dbProduct = await prisma.product.findUnique({
        where: { id: catalog.minPriceScreen.productId },
        select: { lowStockThreshold: true },
      });
      expect(dbProduct?.lowStockThreshold).toBe(3);

      const hafeez = (await list('ownerA', { search: 'SCR-T480-FHD' }).expect(200)).body.products.find(
        (p: any) => p.id === catalog.minPriceScreen.productId,
      );
      expect(hafeez.lowStockThreshold).toBe(3);
      expect(hafeez.stock).toBe(2);
      // 2 units at a threshold of 3 is low stock, not healthy.
      expect(hafeez.stock).toBeLessThanOrEqual(hafeez.lowStockThreshold);

      const hallRoad = (await list('ownerA', { search: 'SCR-T480-FHD' }, HALL_ROAD).expect(200)).body.products.find(
        (p: any) => p.id === catalog.minPriceScreen.productId,
      );
      expect(hallRoad.lowStockThreshold).toBe(3);
      // Branch stock is counted per branch (2 here too, never the business total of 4).
      expect(hallRoad.stock).toBe(2);
      expect(hafeez.totalBusinessStock).toBe(4);
      expect(hallRoad.stock).not.toBe(hafeez.totalBusinessStock);
    });
  });

  describe('freshness (no stale stock after a sale)', () => {
    async function makeProduct(units: number, branchId = HAFEEZ) {
      const id = randomUUID();
      const name = `T3 Fresh ${letters()}`;
      await prisma.product.create({
        data: { id, name, sku: `T3-${letters()}`, basePrice: 25, businessId: BIZ },
      });
      await prisma.productInstance.createMany({
        data: Array.from({ length: units }, () => ({
          id: randomUUID(),
          productId: id,
          branchId,
          status: 'AVAILABLE' as const,
        })),
      });
      return { id, name };
    }

    async function sell(productId: string, quantity: number) {
      const res = await http()
        .post('/order/neworder')
        .set(authHeader('ownerA', HAFEEZ))
        .send({
          walkInName: 'T3 Fresh Sale',
          items: [{ productId, quantity, price: 25 }],
          amountPaid: 25 * quantity,
          orderStatus: 'FINAL',
          paymentMethod: 'CASH',
        });
      expect(res.status).toBeLessThan(300);
    }

    async function stockOf(product: { id: string; name: string }, branch = HAFEEZ) {
      const res = await list('ownerA', { search: product.name }, branch).expect(200);
      const hit = res.body.products.find((p: any) => p.id === product.id);
      expect(hit, 'product present in the list').toBeDefined();
      return hit as { stock: number; totalBusinessStock: number; instances: unknown[] };
    }

    it('shows the new stock immediately after each sale, down to 0 for the last unit', async () => {
      const product = await makeProduct(2);
      const before = await stockOf(product);
      expect(before.stock).toBe(2);
      expect(before.totalBusinessStock).toBe(2);

      await sell(product.id, 1);
      const mid = await stockOf(product);
      expect(mid.stock).toBe(1);
      expect(mid.totalBusinessStock).toBe(1);

      await sell(product.id, 1);
      const after = await stockOf(product);
      expect(after.stock).toBe(0);
      expect(after.totalBusinessStock).toBe(0);
      expect(after.instances).toHaveLength(0);
      expect(await prisma.productInstance.count({ where: { productId: product.id, status: 'SOLD' } })).toBe(2);
    });

    it('stock is per branch: the other branch keeps seeing 0 while Hafeez Centre sells', async () => {
      const product = await makeProduct(1);
      expect((await stockOf(product, HALL_ROAD)).stock).toBe(0);
      expect((await stockOf(product, HAFEEZ)).stock).toBe(1);
      await sell(product.id, 1);
      expect((await stockOf(product, HAFEEZ)).stock).toBe(0);
      expect((await stockOf(product, HALL_ROAD)).stock).toBe(0);
    });

    it('a new product appears in the very next listing', async () => {
      const product = await makeProduct(1);
      const res = await list('ownerA', { search: product.name }).expect(200);
      expect(res.body.products.map((p: any) => p.id)).toContain(product.id);
    });
  });

  describe('cost hiding for staff', () => {
    it('owner responses carry cost fields (so the staff check is not vacuous)', async () => {
      const res = await list('ownerA', { limit: 500 }).expect(200);
      const keys = allKeys(res.body);
      expect(keys.has('defaultCostPrice')).toBe(true);
      expect(keys.has('unitCost')).toBe(true);
    });

    it('staffA never sees defaultCostPrice or unitCost anywhere in the payload', async () => {
      const res = await list('staffA', { limit: 500 }).expect(200);
      expect(res.body.products.length).toBeGreaterThan(20);
      const keys = allKeys(res.body);
      expect(keys.has('defaultCostPrice')).toBe(false);
      expect(keys.has('unitCost')).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/defaultCostPrice|unitCost/);
      // Still gets what staff need to sell.
      const kb = res.body.products.find((p: any) => p.id === catalog.keyboard840.productId);
      expect(kb.basePrice).toBe(catalog.keyboard840.basePrice);
    });

    it('staffA search results are stripped too', async () => {
      const res = await list('staffA', { search: 'keyboard' }).expect(200);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toMatch(/defaultCostPrice|unitCost/);
    });
  });
});
