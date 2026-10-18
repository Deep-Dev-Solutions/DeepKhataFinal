import { test, expect } from '@playwright/test';
import { tenants, users } from '../../fixtures/users';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';

/**
 * Cross-tenant isolation at API level. ownerB (tenant B) asks for tenant A ids:
 * every :id route must answer 404 (or 403), never 200. List endpoints must never
 * contain any tenant A id anywhere in the payload.
 */

function collectStrings(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

const A = tenants.A.id;
const ids: Record<string, string[]> = {};

test.beforeAll(async () => {
  const pick = async (rows: Promise<{ id: string }[]>) => (await rows).map((r) => r.id);
  ids.customer = await pick(db.customer.findMany({ where: { businessId: A }, select: { id: true }, take: 3 }));
  ids.product = await pick(db.product.findMany({ where: { businessId: A }, select: { id: true }, take: 3 }));
  ids.order = await pick(db.order.findMany({ where: { businessId: A }, select: { id: true }, take: 3 }));
  ids.vendor = await pick(db.vendor.findMany({ where: { businessId: A }, select: { id: true }, take: 3 }));
  ids.khata = await pick(db.khataEntry.findMany({ where: { businessId: A }, select: { id: true }, take: 3 }));
  ids.transfer = await pick(db.stockTransferRequest.findMany({ where: { businessId: A }, select: { id: true }, take: 3 }));
  ids.branch = await pick(db.branch.findMany({ where: { businessId: A }, select: { id: true } }));
});

const idRoutes: { name: string; key: string; path: (id: string) => string }[] = [
  { name: 'customer', key: 'customer', path: (id) => `/customer/${id}` },
  { name: 'customer ledger', key: 'customer', path: (id) => `/customer/${id}/ledger` },
  { name: 'product details', key: 'product', path: (id) => `/product/${id}/details` },
  { name: 'order', key: 'order', path: (id) => `/order/${id}` },
  { name: 'vendor', key: 'vendor', path: (id) => `/vendors/${id}` },
  { name: 'khata entry', key: 'khata', path: (id) => `/khata-entries/${id}` },
];

test.describe('A: tenant isolation (ownerB vs tenant A ids)', () => {
  test('tenant A has data to attack (guards against a vacuous run)', () => {
    for (const key of ['customer', 'product', 'order', 'vendor', 'khata']) {
      expect(ids[key].length, `seeded ${key} rows for tenant A`).toBeGreaterThan(0);
    }
  });

  for (const r of idRoutes) {
    test(`GET ${r.name}: ownerB cannot read tenant A id`, async ({ request }) => {
      const a = await apiAs('ownerA', request);
      const b = await apiAs('ownerB', request);
      expect(ids[r.key].length, `tenant A ${r.key} ids`).toBeGreaterThan(0);
      for (const id of ids[r.key]) {
        // Control: the owner of tenant A does see the record, so a 404 for B is isolation, not a bad route.
        const own = await a.get(r.path(id));
        expect(own.status(), `ownerA ${r.path(id)}`).toBe(200);
        const res = await b.get(r.path(id));
        expect([403, 404], `S1 cross-tenant read: ownerB got ${res.status()} for ${r.path(id)}`).toContain(res.status());
      }
    });
  }

  test('GET stock-transfers/:id: ownerB cannot read a tenant A transfer', async ({ request }) => {
    const a = await apiAs('ownerA', request);
    const b = await apiAs('ownerB', request);
    // Setup row inserted directly (no transfer is seeded); removed again afterwards.
    const created = await db.stockTransferRequest.create({
      data: {
        businessId: A,
        fromBranchId: tenants.A.branches.hafeezCentre.id,
        toBranchId: tenants.A.branches.hallRoad.id,
        requestedById: users.ownerA.id,
        note: 'tenant isolation probe',
      },
    });
    try {
      const own = await a.get(`/stock-transfers/${created.id}`);
      expect(own.status(), 'ownerA control read').toBe(200);
      const res = await b.get(`/stock-transfers/${created.id}`);
      expect([403, 404], `S1 cross-tenant read, got ${res.status()}`).toContain(res.status());
      const list = collectStrings(await (await b.get('/stock-transfers', undefined, { branchId: tenants.B.branches.mainBranch.id })).json());
      expect(list.has(created.id), 'transfer leaked into ownerB list').toBe(false);
    } finally {
      await db.stockTransferRequest.delete({ where: { id: created.id } });
    }
  });

  test('ownerB cannot mutate tenant A records by id', async ({ request }) => {
    const b = await apiAs('ownerB', request);
    const customerId = ids.customer[0];
    const before = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    const patch = await b.patch(`/customer/${customerId}`, { name: 'HACKED BY TENANT B' });
    expect([403, 404, 405], `ownerB PATCH customer got ${patch.status()}`).toContain(patch.status());
    const del = await b.delete(`/customer/${customerId}`);
    expect([403, 404, 405], `ownerB DELETE customer got ${del.status()}`).toContain(del.status());
    const after = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(after.name).toBe(before.name);
  });

  test('ownerB cannot act inside a tenant A branch via x-branch-id', async ({ request }) => {
    const b = await apiAs('ownerB', request);
    for (const branchId of ids.branch) {
      const res = await b.get('/product/getproducts', undefined, { branchId });
      if (res.ok()) {
        const strings = collectStrings(await res.json());
        for (const id of ids.product) expect(strings.has(id), `tenant A product ${id} leaked via branch header`).toBe(false);
      } else {
        expect([400, 403, 404]).toContain(res.status());
      }
    }
  });

  const lists: { name: string; path: string }[] = [
    { name: 'customers', path: '/customer/getallcustomers' },
    { name: 'products', path: '/product/getproducts' },
    { name: 'orders', path: '/order/getallorders' },
    { name: 'vendors', path: '/vendors' },
    { name: 'khata entries', path: '/khata-entries' },
    { name: 'stock transfers', path: '/stock-transfers' },
    { name: 'reservations', path: '/reservations' },
    { name: 'dues', path: '/dues' },
    { name: 'categories', path: '/category' },
    { name: 'cabinets', path: '/cabinet' },
    { name: 'branches', path: '/product/getbranches' },
    { name: 'business info', path: '/businessinfo' },
  ];

  for (const l of lists) {
    test(`list ${l.name}: ownerB payload never contains a tenant A id`, async ({ request }) => {
      const a = await apiAs('ownerA', request);
      const b = await apiAs('ownerB', request);
      const aRes = await a.get(l.path, undefined, { branchId: tenants.A.branches.hafeezCentre.id });
      expect(aRes.status(), `ownerA ${l.path}`).toBe(200);
      const aStrings = collectStrings(await aRes.json());
      const bRes = await b.get(l.path, undefined, { branchId: tenants.B.branches.mainBranch.id });
      expect(bRes.status(), `ownerB ${l.path}`).toBe(200);
      const bStrings = collectStrings(await bRes.json());
      // Any tenant A id (rows or the business/branches themselves) appearing for B is a leak.
      const aIds = await tenantAIds(aStrings);
      const leaked = [...aIds].filter((id) => bStrings.has(id));
      expect(leaked, `S1 leak on ${l.path}: ${leaked.join(', ')}`).toEqual([]);
    });
  }
});

/** Of the strings ownerA's response contained, those that are real tenant A ids (uuids). */
async function tenantAIds(strings: Set<string>): Promise<Set<string>> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const candidates = [...strings].filter((s) => uuid.test(s));
  const out = new Set<string>([A, ...ids.branch]);
  // Ids returned to ownerA from tenant A endpoints are tenant A's by construction (ownerA's own scope),
  // except user-independent global ids; the tenant IDs of B are excluded explicitly.
  const bIds = new Set<string>([tenants.B.id, ...Object.values(tenants.B.branches).map((b) => b.id)]);
  for (const c of candidates) if (!bIds.has(c)) out.add(c);
  return out;
}
