import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, closeTestApp } from './setup/app';
import { authHeader, tenants } from './setup/auth';
import { catalog } from '../../e2e/fixtures/catalog';

const kb = catalog.keyboard840;
const HALL = tenants.A.branches.hallRoad.id;
const HAFEEZ = tenants.A.branches.hafeezCentre.id;

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

describe('Stock finder (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  const find = (user: 'staffA' | 'ownerA' | 'managerA' | 'ownerB', branch: string, q: string) =>
    http().get('/stock/find').query({ q }).set(authHeader(user, branch));

  const findKeyboard = (body: any) =>
    (body.results as any[]).find((r) => r.productId === kb.productId);

  describe('ranking', () => {
    it('finds the keyboard by alias "840 keyboard" for staff at Hall Road', async () => {
      const res = await find('staffA', HALL, '840 keyboard').expect(200);
      const hit = findKeyboard(res.body);
      expect(hit).toBeDefined();
      expect(hit.name).toBe(kb.name);
      expect(hit.sku).toBe(kb.sku);
      expect(hit.partNumber).toBe(kb.partNumber);
      expect(hit.aliases).toEqual(expect.arrayContaining([...kb.aliases]));
      expect(hit.compatibleWith).toEqual(expect.arrayContaining([...kb.compatibleWith]));
      expect(Number(hit.salePrice)).toBe(kb.basePrice);
      expect(Number(hit.minSalePrice)).toBe(kb.minSalePrice);
      expect(typeof res.body.tookMs).toBe('number');
    });

    it('ranks the exact alias match first, ahead of the G5 keyboard', async () => {
      const res = await find('staffA', HALL, '840 keyboard').expect(200);
      expect(res.body.results[0].productId).toBe(kb.productId);
    });

    it('ranks an exact part number first', async () => {
      const res = await find('staffA', HALL, kb.partNumber).expect(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].productId).toBe(kb.productId);
    });

    it('ranks an exact SKU first', async () => {
      const res = await find('staffA', HALL, kb.sku).expect(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].productId).toBe(kb.productId);
    });

    it('is case-insensitive for SKU', async () => {
      const res = await find('staffA', HALL, kb.sku.toLowerCase()).expect(200);
      expect(res.body.results[0].productId).toBe(kb.productId);
    });

    it('tolerates a typo ("840 g3 keybord")', async () => {
      const res = await find('staffA', HALL, '840 g3 keybord').expect(200);
      expect(findKeyboard(res.body)).toBeDefined();
    });

    it('returns an empty list for an empty query', async () => {
      const res = await find('staffA', HALL, '').expect(200);
      expect(res.body.results).toEqual([]);
    });

    it('returns an empty list for a whitespace-only query', async () => {
      const res = await find('staffA', HALL, '   ').expect(200);
      expect(res.body.results).toEqual([]);
    });

    it('respects the limit', async () => {
      const res = await http()
        .get('/stock/find')
        .query({ q: 'hp', limit: 1 })
        .set(authHeader('staffA', HALL))
        .expect(200);
      expect(res.body.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('branch availability', () => {
    it('shows 3 available at Hafeez Centre with the condition split, and none at Hall Road', async () => {
      const res = await find('staffA', HALL, '840 keyboard').expect(200);
      const hit = findKeyboard(res.body);
      expect(hit.totalAvailable).toBe(3);

      const hafeez = hit.branches.find((b: any) => b.branchId === HAFEEZ);
      expect(hafeez).toBeDefined();
      expect(hafeez.branchName).toBe(tenants.A.branches.hafeezCentre.name);
      expect(hafeez.isOwnBranch).toBe(false);
      expect(hafeez.available).toBe(3);
      expect(hafeez.byCondition).toEqual({ ORIGINAL_PULL: 2, MINOR_SCRATCHES: 1 });

      const hall = hit.branches.find((b: any) => b.branchId === HALL);
      if (hall) expect(hall.available).toBe(0);
    });

    it('does not expose item locations for another branch', async () => {
      const res = await find('staffA', HALL, '840 keyboard').expect(200);
      const hafeez = findKeyboard(res.body).branches.find((b: any) => b.branchId === HAFEEZ);
      expect(hafeez.locations).toBeUndefined();
      expect(Object.keys(hafeez)).not.toContain('locations');
    });

    it('shows item locations on the own branch (staff at Hafeez Centre)', async () => {
      const res = await find('staffA', HAFEEZ, '840 keyboard').expect(200);
      const hafeez = findKeyboard(res.body).branches.find((b: any) => b.branchId === HAFEEZ);
      expect(hafeez.isOwnBranch).toBe(true);
      expect(hafeez.available).toBe(3);
      expect(Array.isArray(hafeez.locations)).toBe(true);
      expect(hafeez.locations).toHaveLength(3);
      const ids = hafeez.locations.map((l: any) => l.instanceId).sort();
      expect(ids).toEqual([...kb.hafeezCentreInstanceIds].sort());
      for (const loc of hafeez.locations) {
        expect(loc.cabinetName).toBeTruthy();
      }
    });
  });

  describe('cost hiding', () => {
    const FORBIDDEN = ['costPrice', 'unitCost', 'defaultCostPrice'];

    it('contains no cost key anywhere in the JSON for staff', async () => {
      const res = await find('staffA', HAFEEZ, '840 keyboard').expect(200);
      expect(findKeyboard(res.body)).toBeDefined();
      const keys = collectKeys(res.body);
      for (const k of FORBIDDEN) expect(keys.has(k)).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain(String(kb.unitCost) + '.00');
    });

    it('also hides cost for staff searching by part number', async () => {
      const res = await find('staffA', HALL, kb.partNumber).expect(200);
      const keys = collectKeys(res.body);
      for (const k of FORBIDDEN) expect(keys.has(k)).toBe(false);
    });

    it('returns the cost price to the owner', async () => {
      const res = await find('ownerA', HALL, '840 keyboard').expect(200);
      const hit = findKeyboard(res.body);
      expect(hit).toBeDefined();
      expect(Object.keys(hit)).toContain('costPrice');
      expect(Number(hit.costPrice)).toBe(kb.unitCost);
    });

    it('returns the cost price to a manager', async () => {
      const res = await find('managerA', HALL, '840 keyboard').expect(200);
      const hit = findKeyboard(res.body);
      expect(Object.keys(hit)).toContain('costPrice');
      expect(Number(hit.costPrice)).toBe(kb.unitCost);
    });
  });

  describe('tenant isolation', () => {
    it('never returns tenant A products to tenant B', async () => {
      const res = await find('ownerB', tenants.B.branches.mainBranch.id, '840').expect(200);
      expect(findKeyboard(res.body)).toBeUndefined();
      for (const r of res.body.results) {
        expect(r.productId).not.toBe(kb.productId);
        expect(r.sku).not.toBe(kb.sku);
        expect(r.partNumber).not.toBe(kb.partNumber);
      }
    });

    it('does not find tenant A part number from tenant B', async () => {
      const res = await find('ownerB', tenants.B.branches.mainBranch.id, kb.partNumber).expect(200);
      expect(findKeyboard(res.body)).toBeUndefined();
    });

    it('rejects an unauthenticated request', async () => {
      await http().get('/stock/find').query({ q: '840' }).expect(401);
    });
  });
});
