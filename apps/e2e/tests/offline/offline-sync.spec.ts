import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { readSyncQueue } from '../../helpers/idb';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  BUSINESS_A,
  createProduct,
  createSaleViaApi,
  HALL_ROAD,
  instanceCounts,
  openCheckout,
  postingsByAccount,
  submitCheckout,
} from '../pos/support';

test.use({ storageState: storage('staffA') });

/** Loads the POS online, finds the product (which caches it in Dexie), goes offline and adds it to the cart. */
async function openPosOfflineWithProduct(page: Page, sku: string, name: string): Promise<void> {
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await page.getByTestId('pos-search').fill(sku);
  const row = page.getByTestId('pos-result-row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  // The product list is cached into IndexedDB after the fetch resolves.
  await expect
    .poll(() =>
      page.evaluate(
        (s) =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('DeepKhataOfflineDB');
            open.onsuccess = () => {
              const idb = open.result;
              if (!idb.objectStoreNames.contains('products')) return resolve(false);
              const req = idb.transaction('products', 'readonly').objectStore('products').getAll();
              req.onsuccess = () => {
                idb.close();
                resolve((req.result as { sku?: string }[]).some((p) => p.sku === s));
              };
            };
          }),
        sku,
      ),
    )
    .toBe(true);
  await page.context().setOffline(true);
  await row.getByTestId('pos-add-item').click();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(1);
}

async function queueOfflineWalkInSale(page: Page, amount: string): Promise<void> {
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('pos-walkin-name').fill('Offline Walk In');
  await page.getByTestId('checkout-amount').fill(amount);
  await submitCheckout(page);
}

const ordersFor = (productId: string) =>
  db.order.findMany({ where: { businessId: BUSINESS_A, items: { some: { productId } } } });

test.describe('G: offline POS queue and sync', () => {
  test('an offline sale is queued as pending in IndexedDB and creates no server order until back online', async ({ page, request }) => {
    const product = await createProduct(request, { price: 1200, qty: 3, label: 'OffQueue' });
    await openPosOfflineWithProduct(page, product.sku, product.name);
    await queueOfflineWalkInSale(page, '1200');

    const queue = await readSyncQueue(page);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('CREATE_ORDER');
    expect(queue[0].status).toBe('pending');
    expect(queue[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const items = queue[0].payload.items as { productId: string; quantity: number; price: number }[];
    expect(items).toEqual([expect.objectContaining({ productId: product.id, quantity: 1, price: 1200 })]);
    expect(Number(queue[0].payload.amountPaid)).toBe(1200);

    // Nothing reached the server while offline.
    expect(await ordersFor(product.id)).toHaveLength(0);
    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 3 });
    await page.context().setOffline(false);
  });

  test('back online the queued sale syncs exactly once: one order, stock sold, queue drained, ledger balanced', async ({ page, request }) => {
    const product = await createProduct(request, { price: 2500, qty: 2, label: 'OffSync' });
    await openPosOfflineWithProduct(page, product.sku, product.name);
    await queueOfflineWalkInSale(page, '2500');
    const [queued] = await readSyncQueue(page);
    expect(queued.status).toBe('pending');

    await page.context().setOffline(false);

    // The queue item id is used as the order id (idempotency key); the item leaves the queue once synced.
    await expect.poll(() => db.order.count({ where: { id: queued.id } }), { timeout: 45_000 }).toBe(1);
    await expect.poll(async () => (await readSyncQueue(page)).length, { timeout: 30_000 }).toBe(0);

    const orders = await ordersFor(product.id);
    expect(orders).toHaveLength(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: queued.id }, include: { items: true, payments: true } });
    expect(order.status).toBe('FINAL');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.walkInName).toBe('Offline Walk In');
    expect(order.branchId).toBe(HALL_ROAD);
    expect(Number(order.totalAmount)).toBe(2500);
    expect(order.payments).toHaveLength(1);
    expect(Number(order.payments[0].amount)).toBe(2500);
    expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
    expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -2500, CASH: 2500 });
    await expectLedgerBalanced(BUSINESS_A);

    expect(await ordersFor(product.id)).toHaveLength(1);
  });

  test('replaying the same client UUID through the API twice yields one order, one stock movement and one ledger entry', async ({ request }) => {
    const product = await createProduct(request, { price: 800, qty: 3, label: 'Replay' });
    const staff = await apiAs('staffA', request);
    const id = randomUUID();
    const item = {
      id,
      type: 'CREATE_ORDER',
      createdAt: new Date().toISOString(),
      status: 'pending',
      payload: {
        items: [{ productId: product.id, quantity: 1, price: 800 }],
        amountPaid: 800,
        discount: 0,
        paymentMethod: 'CASH',
        orderStatus: 'FINAL',
        branchId: HALL_ROAD,
      },
    };
    const first = await staff.post('/sync/batch', { items: [item] }, { branchId: HALL_ROAD });
    expect(first.ok()).toBeTruthy();
    expect((await first.json()).results).toEqual([expect.objectContaining({ id, status: 'synced', orderId: id })]);

    const second = await staff.post('/sync/batch', { items: [item] }, { branchId: HALL_ROAD });
    expect(second.ok()).toBeTruthy();
    expect((await second.json()).results).toEqual([expect.objectContaining({ id, status: 'synced', orderId: id })]);

    expect(await ordersFor(product.id)).toHaveLength(1);
    expect(await db.order.count({ where: { id } })).toBe(1);
    expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 2 });
    expect(await db.inventoryMovement.count({ where: { productId: product.id, referenceId: id } })).toBe(1);
    expect(await db.transaction.count({ where: { referenceId: id } })).toBe(1);
    expect(await postingsByAccount(id)).toEqual({ REVENUE: -800, CASH: 800 });
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('the legacy /sync and /order/sync aliases are idempotent against the same client UUID too', async ({ request }) => {
    const product = await createProduct(request, { price: 600, qty: 2, label: 'Alias' });
    const staff = await apiAs('staffA', request);
    const id = randomUUID();
    const item = {
      id,
      type: 'CREATE_ORDER',
      payload: {
        items: [{ productId: product.id, quantity: 1, price: 600 }],
        amountPaid: 600,
        paymentMethod: 'CASH',
        orderStatus: 'FINAL',
        branchId: HALL_ROAD,
      },
    };
    for (const path of ['/sync', '/order/sync', '/sync/batch']) {
      const res = await staff.post(path, { items: [item] }, { branchId: HALL_ROAD });
      expect(res.ok(), path).toBeTruthy();
      expect((await res.json()).results[0]).toMatchObject({ id, status: 'synced' });
    }
    expect(await ordersFor(product.id)).toHaveLength(1);
    expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
  });

  test('stale stock: the unit is sold elsewhere while offline, so sync reports a conflict and nothing is oversold', async ({ page, request }) => {
    const product = await createProduct(request, { price: 3000, qty: 1, label: 'Stale' });
    await openPosOfflineWithProduct(page, product.sku, product.name);
    await queueOfflineWalkInSale(page, '3000');
    const [queued] = await readSyncQueue(page);
    expect(queued.status).toBe('pending');

    // Meanwhile the only unit is sold through another terminal.
    const other = await createSaleViaApi(request, {
      items: [{ productId: product.id, quantity: 1, price: 3000 }],
      amountPaid: 3000,
    });
    expect(await instanceCounts(product.id)).toEqual({ SOLD: 1 });

    await page.context().setOffline(false);

    await expect
      .poll(async () => (await readSyncQueue(page)).find((q) => q.id === queued.id)?.status, { timeout: 45_000 })
      .toBe('conflict');
    const after = (await readSyncQueue(page)).find((q) => q.id === queued.id)!;
    expect(after.lastError).toBeTruthy();

    // No second order, no oversell, no stray ledger entry for the rejected sale.
    const orders = await ordersFor(product.id);
    expect(orders.map((o) => o.id)).toEqual([other.id]);
    expect(await db.order.count({ where: { id: queued.id } })).toBe(0);
    expect(await instanceCounts(product.id)).toEqual({ SOLD: 1 });
    expect(await db.transaction.count({ where: { referenceId: queued.id } })).toBe(0);
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('stale stock via the API: a conflicting item is reported per item and does not block the valid item in the same batch', async ({ request }) => {
    const sold = await createProduct(request, { price: 500, qty: 1, label: 'StaleApi' });
    const fresh = await createProduct(request, { price: 400, qty: 2, label: 'FreshApi' });
    await createSaleViaApi(request, { items: [{ productId: sold.id, quantity: 1, price: 500 }], amountPaid: 500 });

    const staff = await apiAs('staffA', request);
    const staleId = randomUUID();
    const freshId = randomUUID();
    const mk = (id: string, productId: string, price: number) => ({
      id,
      type: 'CREATE_ORDER',
      payload: {
        items: [{ productId, quantity: 1, price }],
        amountPaid: price,
        paymentMethod: 'CASH',
        orderStatus: 'FINAL',
        branchId: HALL_ROAD,
      },
    });
    const res = await staff.post(
      '/sync/batch',
      { items: [mk(staleId, sold.id, 500), mk(freshId, fresh.id, 400)] },
      { branchId: HALL_ROAD },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.results.find((r: { id: string }) => r.id === staleId)).toMatchObject({ status: 'conflict' });
    expect(body.results.find((r: { id: string }) => r.id === freshId)).toMatchObject({ status: 'synced' });
    expect(body.syncedIds).toEqual([freshId]);
    expect(await db.order.count({ where: { id: staleId } })).toBe(0);
    expect(await db.order.count({ where: { id: freshId } })).toBe(1);
    expect(await instanceCounts(sold.id)).toEqual({ SOLD: 1 });
    expect(await instanceCounts(fresh.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('sync never trusts another tenant: a queue id already used by an order of tenant B is rejected, not reported as synced', async ({ request }) => {
    const foreign = await db.order.findFirst({ where: { businessId: { not: BUSINESS_A } }, select: { id: true } });
    test.skip(!foreign, 'tenant B has no order to collide with');
    const product = await createProduct(request, { price: 300, qty: 1, label: 'Foreign' });
    const staff = await apiAs('staffA', request);
    const res = await staff.post(
      '/sync/batch',
      {
        items: [
          {
            id: foreign!.id,
            type: 'CREATE_ORDER',
            payload: {
              items: [{ productId: product.id, quantity: 1, price: 300 }],
              amountPaid: 300,
              paymentMethod: 'CASH',
              orderStatus: 'FINAL',
              branchId: HALL_ROAD,
            },
          },
        ],
      },
      { branchId: HALL_ROAD },
    );
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).results[0]).toMatchObject({ status: 'failed' });
    expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 1 });
  });
});
