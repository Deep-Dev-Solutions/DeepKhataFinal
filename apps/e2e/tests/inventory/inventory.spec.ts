import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { BUSINESS_A, createProduct, HALL_ROAD, HAFEEZ, instanceCounts, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

const fmt = (n: number) => n.toLocaleString('en-US');

async function createVendor(request: APIRequestContext, label: string) {
  const owner = await apiAs('ownerA', request);
  const businessName = `E2E Vendor ${label} ${uniq()}`;
  const res = await owner.post('/vendors', { businessName, contactName: 'Tester', phone: '03001112233' });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  return { id: body.vendor.id as string, name: businessName };
}

/** Net posting per account type of the ledger transaction(s) that reference `referenceId`. */
async function postings(referenceId: string) {
  const rows = await db.posting.findMany({ where: { transaction: { referenceId } }, include: { transaction: true } });
  const net: Record<string, number> = {};
  for (const r of rows) net[r.accountType] = (net[r.accountType] ?? 0) + Number(r.amount);
  return { net, rows };
}

async function restockApi(
  request: APIRequestContext,
  body: unknown,
) {
  const owner = await apiAs('ownerA', request);
  return owner.post('/inventory/restock', body, { branchId: HALL_ROAD });
}

test.describe('inventory: products and conditions', () => {
  test('new product shows in the product list with its stock; instances default to ORIGINAL_PULL', async ({ page, request }) => {
    const product = await createProduct(request, { price: 900, qty: 3, label: 'List' });
    await useBranch(page.context(), HALL_ROAD);
    await page.goto('/products');
    await page.getByTestId('products-search').fill(product.sku);
    const row = page.getByTestId('product-row').filter({ hasText: product.sku });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('product-row-stock')).toContainText('3 units available');

    const instances = await db.productInstance.findMany({ where: { productId: product.id } });
    expect(instances).toHaveLength(3);
    expect(instances.every((i) => i.status === 'AVAILABLE' && i.condition === 'ORIGINAL_PULL')).toBe(true);
    expect(instances.every((i) => i.branchId === HALL_ROAD)).toBe(true);
    const movements = await db.inventoryMovement.findMany({ where: { productId: product.id } });
    expect(movements.reduce((s, m) => s + (m.direction === 'IN' ? m.quantity : -m.quantity), 0)).toBe(3);
  });

  test('setting an instance condition persists in the DB and in product details; bad value is refused', async ({ request }) => {
    const product = await createProduct(request, { price: 1200, qty: 3, label: 'Cond' });
    const owner = await apiAs('ownerA', request);
    const [a, b, c] = await db.productInstance.findMany({ where: { productId: product.id }, orderBy: { id: 'asc' } });

    const ok1 = await owner.patch(`/product/instances/${a.id}`, { condition: 'WORKING', notes: 'tested on bench' });
    expect(ok1.ok(), await ok1.text()).toBeTruthy();
    expect((await owner.patch(`/product/instances/${b.id}`, { condition: 'DEAD_DONOR' })).ok()).toBeTruthy();

    const bad = await owner.patch(`/product/instances/${c.id}`, { condition: 'MINT' });
    expect(bad.status()).toBe(400);

    const after = Object.fromEntries(
      (await db.productInstance.findMany({ where: { productId: product.id } })).map((i) => [i.id, i]),
    );
    expect(after[a.id].condition).toBe('WORKING');
    expect(after[a.id].notes).toBe('tested on bench');
    expect(after[b.id].condition).toBe('DEAD_DONOR');
    expect(after[c.id].condition).toBe('ORIGINAL_PULL');

    const details = await owner.get(`/product/${product.id}/details`);
    expect(details.ok(), await details.text()).toBeTruthy();
    const text = await details.text();
    expect(text).toContain('WORKING');
    expect(text).toContain('DEAD_DONOR');
  });
});

test.describe('inventory: restock', () => {
  // Regression: inventory.service.ts selected Vendor.name (field is businessName), so every vendor restock with a cost returned 500.
  test('restock from a vendor on credit through the UI: stock, movement, VENDOR_PAYABLE and INVENTORY postings', async ({ page, request }) => {
    const product = await createProduct(request, { price: 800, qty: 1, label: 'Restock' });
    const vendor = await createVendor(request, 'Credit');

    await useBranch(page.context(), HALL_ROAD);
    await page.goto('/inventory/restock');
    await page.getByTestId('restock-product-search').fill(product.sku);
    // MISSING testid: restock catalog product button, restock-add-to-batch
    await page.getByRole('button', { name: new RegExp(product.name) }).click();
    await page.getByTestId('restock-vendor').selectOption(vendor.id);
    await page.getByTestId('restock-qty').fill('4');
    await page.getByTestId('restock-unit-cost').fill('250');
    await page.getByRole('button', { name: 'Add to Batch' }).click();
    const line = page.getByTestId('restock-item-row');
    await expect(line).toHaveCount(1);
    await expect(line).toContainText(product.name);
    await page.getByTestId('restock-submit').click();
    await expect(page.getByTestId('restock-success')).toBeVisible();

    // Stock: 1 original + 4 restocked, all at Hall Road, 4 carrying the vendor and unit cost.
    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 5 });
    const fresh = await db.productInstance.findMany({ where: { productId: product.id, vendorId: vendor.id } });
    expect(fresh).toHaveLength(4);
    expect(fresh.every((i) => Number(i.unitCost) === 250 && i.branchId === HALL_ROAD)).toBe(true);
    const movement = await db.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id, referenceType: 'RESTOCK' },
    });
    expect(movement.direction).toBe('IN');
    expect(movement.quantity).toBe(4);
    expect(movement.vendorId).toBe(vendor.id);

    // Ledger: stock value up Rs 1,000, owed to the vendor (no cash moved).
    const { net, rows } = await postings(movement.id);
    expect(net).toEqual({ INVENTORY: 1000, VENDOR_PAYABLE: -1000 });
    expect(rows.find((r) => r.accountType === 'VENDOR_PAYABLE')!.accountId).toBe(vendor.id);
    expect(rows.every((r) => r.transaction.type === 'VENDOR_PURCHASE' && r.transaction.businessId === BUSINESS_A)).toBe(true);
    expect(rows.find((r) => r.transaction.dueDate)).toBeTruthy(); // credit purchase carries a due date
    await expectLedgerBalanced(BUSINESS_A);

    // The vendor page shows what we owe, and the product list the new stock.
    await page.goto(`/vendors/${vendor.id}`);
    await expect(page.getByTestId('vendor-balance')).toContainText(fmt(1000));
    await page.goto('/products');
    await page.getByTestId('products-search').fill(product.sku);
    await expect(page.getByTestId('product-row').filter({ hasText: product.sku }).getByTestId('product-row-stock')).toContainText(
      '5 units available',
    );
  });

  // Regression: see vendor field fix above (paid-now path).
  test('restock paid now posts against CASH, not VENDOR_PAYABLE', async ({ request }) => {
    const product = await createProduct(request, { price: 500, qty: 1, label: 'Cash' });
    const vendor = await createVendor(request, 'Cash');
    const res = await restockApi(request, {
      paidNow: true,
      items: [{ productId: product.id, branchId: HALL_ROAD, quantity: 3, vendorId: vendor.id, unitCost: 120.5 }],
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 4 });
    const movement = await db.inventoryMovement.findFirstOrThrow({ where: { productId: product.id, referenceType: 'RESTOCK' } });
    const { net, rows } = await postings(movement.id);
    expect(net).toEqual({ INVENTORY: 361.5, ASSET: -361.5 });
    expect(rows.some((r) => r.accountType === 'VENDOR_PAYABLE')).toBe(false);
    expect(rows.find((r) => r.accountType === 'ASSET')!.accountId).toBe('CASH');
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('restock without a vendor adds stock and a movement but writes no ledger transaction', async ({ request }) => {
    const product = await createProduct(request, { price: 500, qty: 1, label: 'NoVendor' });
    const res = await restockApi(request, { items: [{ productId: product.id, branchId: HALL_ROAD, quantity: 2 }] });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 3 });
    const movement = await db.inventoryMovement.findFirstOrThrow({ where: { productId: product.id, referenceType: 'RESTOCK' } });
    expect(movement.quantity).toBe(2);
    expect(movement.vendorId).toBeNull();
    expect(await db.transaction.count({ where: { referenceId: movement.id } })).toBe(0);
  });

  test('a batch with one bad line writes nothing: no instances, movements or postings for any line', async ({ request }) => {
    const p1 = await createProduct(request, { price: 500, qty: 1, label: 'Batch1' });
    const p2 = await createProduct(request, { price: 500, qty: 1, label: 'Batch2' });
    const vendor = await createVendor(request, 'Batch');
    const txBefore = await db.transaction.count({ where: { businessId: BUSINESS_A } });

    const res = await restockApi(request, {
      items: [
        { productId: p1.id, branchId: HALL_ROAD, quantity: 5, vendorId: vendor.id, unitCost: 100 },
        { productId: p2.id, branchId: HALL_ROAD, quantity: 5, cabinetId: '00000000-0000-4000-8000-0000000000ff' },
      ],
    });
    expect(res.status()).toBe(400);
    expect(await instanceCounts(p1.id)).toEqual({ AVAILABLE: 1 });
    expect(await instanceCounts(p2.id)).toEqual({ AVAILABLE: 1 });
    expect(await db.inventoryMovement.count({ where: { productId: { in: [p1.id, p2.id] }, referenceType: 'RESTOCK' } })).toBe(0);
    expect(await db.transaction.count({ where: { businessId: BUSINESS_A } })).toBe(txBefore);

    // A line without a branch is refused too.
    const noBranch = await restockApi(request, { items: [{ productId: p1.id, quantity: 1 }] });
    expect(noBranch.status()).toBe(400);
    expect(await instanceCounts(p1.id)).toEqual({ AVAILABLE: 1 });
    // And an empty batch.
    expect((await restockApi(request, { items: [] })).status()).toBe(400);
  });
});

test.describe('inventory: cabinets', () => {
  test('cabinet created in the UI receives restocked units and shows on the product page', async ({ page, request }) => {
    const token = uniq();
    const cabinetName = `E2E Cab ${token}`;
    await useBranch(page.context(), HALL_ROAD);
    await page.goto('/settings/cabinets');
    await page.getByTestId('cabinet-name').fill(cabinetName);
    await page.getByTestId('cabinet-rack').fill('R9');
    await page.getByTestId('cabinet-shelf').fill('S2');
    await page.getByTestId('cabinet-bin').fill('B4');
    await page.getByTestId('cabinet-submit').click();
    await expect(page.getByTestId('cabinet-row').filter({ hasText: cabinetName })).toBeVisible();

    const cabinet = await db.cabinet.findFirstOrThrow({ where: { businessId: BUSINESS_A, name: cabinetName } });
    expect(cabinet.branchId).toBe(HALL_ROAD);
    expect([cabinet.rack, cabinet.shelf, cabinet.bin]).toEqual(['R9', 'S2', 'B4']);

    // Restock into that cabinet through the restock UI.
    const product = await createProduct(request, { price: 650, qty: 1, label: 'Cabinet' });
    await page.goto('/inventory/restock');
    await page.getByTestId('restock-product-search').fill(product.sku);
    await page.getByRole('button', { name: new RegExp(product.name) }).click();
    await page.getByTestId('restock-cabinet').selectOption(cabinet.id);
    await page.getByTestId('restock-qty').fill('2');
    await page.getByRole('button', { name: 'Add to Batch' }).click(); // MISSING testid: restock-add-to-batch
    await page.getByTestId('restock-submit').click();
    await expect(page.getByTestId('restock-success')).toBeVisible();

    const inCabinet = await db.productInstance.findMany({ where: { productId: product.id, cabinetId: cabinet.id } });
    expect(inCabinet).toHaveLength(2);
    expect((await db.inventoryMovement.findFirstOrThrow({ where: { productId: product.id, referenceType: 'RESTOCK' } })).cabinetId).toBe(
      cabinet.id,
    );

    await page.goto(`/products/${product.id}`);
    // MISSING testid: product detail location breakdown (cabinet card)
    const card = page.getByText(cabinetName, { exact: true }).locator('xpath=..');
    await expect(card).toContainText('2 units');
    await expect(page.getByText('General', { exact: true }).locator('xpath=..')).toContainText('1 units');
  });

  test('restock refuses a cabinet from another branch', async ({ request }) => {
    const owner = await apiAs('ownerA', request);
    const cab = await owner.post('/cabinet', { name: `E2E Hafeez Cab ${uniq()}`, branchId: HAFEEZ });
    expect(cab.ok(), await cab.text()).toBeTruthy();
    const cabinetId = (await cab.json()).cabinet.id as string;
    const product = await createProduct(request, { price: 500, qty: 1, label: 'WrongCab' });

    const res = await restockApi(request, {
      items: [{ productId: product.id, branchId: HALL_ROAD, cabinetId, quantity: 2 }],
    });
    expect(res.status()).toBe(400);
    expect(await db.productInstance.count({ where: { productId: product.id, cabinetId } })).toBe(0);
    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 1 });
  });
});

test.describe('inventory: product import', () => {
  test('import creates products, categories, instances and an initial-stock movement', async ({ request }) => {
    const owner = await apiAs('ownerA', request);
    const t = uniq();
    const rows = [
      { name: `E2E Imp A ${t}`, sku: `IMP-A-${t}`, category: `E2E Imported ${t}`, price: 450, stock: 3, defaultCostPrice: 300 },
      { Name: `E2E Imp B ${t}`, SKU: `IMP-B-${t}`, Category: `E2E Imported ${t}`, basePrice: 1500, quantity: 2, minSalePrice: 1400 },
    ];
    const res = await owner.post('/product/import', { products: rows });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect((await res.json()).importedCount).toBe(2);

    const a = await db.product.findFirstOrThrow({ where: { businessId: BUSINESS_A, sku: `IMP-A-${t}` } });
    const b = await db.product.findFirstOrThrow({ where: { businessId: BUSINESS_A, sku: `IMP-B-${t}` } });
    expect(Number(a.basePrice)).toBe(450);
    expect(Number(a.defaultCostPrice)).toBe(300);
    expect(Number(b.basePrice)).toBe(1500);
    expect(Number(b.minSalePrice)).toBe(1400);
    expect(a.categoryId).not.toBeNull();
    expect(a.categoryId).toBe(b.categoryId); // one shared category, not two
    expect(await db.category.count({ where: { businessId: BUSINESS_A, name: `E2E Imported ${t}` } })).toBe(1);
    expect(await instanceCounts(a.id)).toEqual({ AVAILABLE: 3 });
    expect(await instanceCounts(b.id)).toEqual({ AVAILABLE: 2 });
    const mv = await db.inventoryMovement.findMany({ where: { productId: a.id } });
    expect(mv).toHaveLength(1);
    expect(mv[0].referenceType).toBe('INITIAL_STOCK');
    expect(mv[0].quantity).toBe(3);
  });

  test('a row without a name is not imported and creates no product or stock', async ({ request }) => {
    const owner = await apiAs('ownerA', request);
    const t = uniq();
    const before = await db.product.count({ where: { businessId: BUSINESS_A } });
    const res = await owner.post('/product/import', {
      products: [
        { name: `E2E Imp Good ${t}`, sku: `IMP-G-${t}`, price: 100, stock: 1 },
        { name: '   ', sku: `IMP-BAD-${t}`, price: 100, stock: 5 },
      ],
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect((await res.json()).importedCount).toBe(1);
    expect(await db.product.count({ where: { businessId: BUSINESS_A } })).toBe(before + 1);
    expect(await db.product.count({ where: { businessId: BUSINESS_A, sku: `IMP-BAD-${t}` } })).toBe(0);
    expect(await db.productInstance.count({ where: { serialNumber: { startsWith: `IMP-BAD-${t}` } } })).toBe(0);
  });

  // Regression: rows with no name used to be skipped silently with no per-row error.
  test('a rejected row is reported back with a row error', async ({ request }) => {
    const owner = await apiAs('ownerA', request);
    const t = uniq();
    const res = await owner.post('/product/import', {
      products: [
        { name: `E2E Imp Good2 ${t}`, sku: `IMP-G2-${t}`, price: 100, stock: 1 },
        { name: '', sku: `IMP-BAD2-${t}`, price: 100, stock: 1 },
      ],
    });
    const body = await res.json();
    expect(Array.isArray(body.errors) ? body.errors.length : 0).toBe(1);
  });

  test('a row with a non-numeric price fails the whole import atomically', async ({ request }) => {
    const owner = await apiAs('ownerA', request);
    const t = uniq();
    const before = await db.product.count({ where: { businessId: BUSINESS_A } });
    const res = await owner.post('/product/import', {
      products: [
        { name: `E2E Imp Ok ${t}`, sku: `IMP-OK-${t}`, category: `E2E Atomic ${t}`, price: 100, stock: 2 },
        { name: `E2E Imp NaN ${t}`, sku: `IMP-NAN-${t}`, price: 'abc', stock: 2 },
      ],
    });
    expect(res.ok()).toBe(false);
    expect(await db.product.count({ where: { businessId: BUSINESS_A } })).toBe(before);
    expect(await db.product.count({ where: { sku: { in: [`IMP-OK-${t}`, `IMP-NAN-${t}`] } } })).toBe(0);
    expect(await db.category.count({ where: { name: `E2E Atomic ${t}` } })).toBe(0);
  });
});

test.describe('inventory: tenant isolation', () => {
  test('tenant B gets 404 on a tenant A product and its instances, and cannot restock it', async ({ request }) => {
    const product = await createProduct(request, { price: 700, qty: 2, label: 'Iso' });
    const instance = await db.productInstance.findFirstOrThrow({ where: { productId: product.id } });
    const b = await apiAs('ownerB', request);

    expect((await b.get(`/product/${product.id}/details`)).status()).toBe(404);
    expect((await b.patch(`/product/${product.id}`, { name: 'hijacked' })).status()).toBe(404);
    expect((await b.patch(`/product/instances/${instance.id}`, { condition: 'DEFECTIVE' })).status()).toBe(404);
    expect((await b.delete(`/product/${product.id}`)).status()).toBe(404);

    const mainB = '22222222-2222-4000-8000-000000000100';
    const restock = await b.post(
      '/inventory/restock',
      { items: [{ productId: product.id, branchId: mainB, quantity: 3 }] },
      { branchId: mainB },
    );
    expect(restock.ok()).toBe(false);
    expect([400, 404]).toContain(restock.status());

    const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.name).toBe(product.name);
    expect(after.deletedAt).toBeNull();
    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 2 });
    expect((await db.productInstance.findUniqueOrThrow({ where: { id: instance.id } })).condition).toBe('ORIGINAL_PULL');
    expect(await db.inventoryMovement.count({ where: { productId: product.id, referenceType: 'RESTOCK' } })).toBe(0);
  });
});
