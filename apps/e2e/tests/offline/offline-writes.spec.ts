import { test, expect, type Page } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { readStore, readSyncQueue } from '../../helpers/idb';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { E2E } from '../../env';
import {
  addToCart,
  BUSINESS_A,
  createCustomer,
  createProduct,
  createSaleViaApi,
  HALL_ROAD,
  instanceCounts,
  openCheckout,
  submitCheckout,
  uniq,
} from '../pos/support';

test.use({ storageState: storage('ownerA') });

/** Waits until the product (by SKU) is cached in Dexie. */
async function expectProductCached(page: Page, sku: string): Promise<void> {
  await expect
    .poll(async () => (await readStore<{ sku?: string }>(page, 'products')).some((p) => p.sku === sku), {
      timeout: 30_000,
    })
    .toBe(true);
}

test.describe('P9: offline writes (sale + payment + khata) queue and sync', () => {
  test('offline sale, customer payment and khata entry queue in Dexie, then sync exactly once (idempotent on replay)', async ({ page, request }) => {
    test.setTimeout(180_000);
    const context = page.context();
    await useBranch(context, HALL_ROAD);

    // Online setup through the API: a product to sell, and a credit order with 3000 outstanding.
    const sellProduct = await createProduct(request, { price: 1500, qty: 3, label: 'OffWSale' });
    const creditProduct = await createProduct(request, { price: 4000, qty: 2, label: 'OffWCredit' });
    const customer = await createCustomer(request, 'OffW');
    const creditOrder = await createSaleViaApi(request, {
      items: [{ productId: creditProduct.id, quantity: 1, price: 4000 }],
      customerId: customer.id,
      amountPaid: 1000,
    });
    expect(creditOrder.paymentStatus).toBe('PARTIAL');
    const khataParty = `E2E OffKhata ${uniq()}`;

    // Three tabs of the same browser (same IndexedDB), each loaded online first.
    const payPage = await context.newPage();
    const khataPage = await context.newPage();
    await page.goto('/orders/new');
    await page.getByTestId('pos-search').fill(sellProduct.sku);
    await expect(page.getByTestId('pos-result-row').filter({ hasText: sellProduct.name })).toHaveCount(1);
    await expectProductCached(page, sellProduct.sku);
    await payPage.goto(`/orders/${creditOrder.id}`);
    // MISSING testid: "Record Payment" button on the order detail page (accessible role used instead).
    const openPayment = payPage.getByRole('button', { name: 'Record Payment', exact: true });
    await expect(openPayment).toBeVisible({ timeout: 60_000 });
    await khataPage.goto('/dashboard');
    await expect(khataPage.getByTestId('header-quick-khata')).toBeVisible({ timeout: 60_000 });

    const ordersBefore = await db.order.count({ where: { businessId: BUSINESS_A } });
    const paymentsBefore = await db.payment.count({ where: { orderId: creditOrder.id } });
    expect(paymentsBefore).toBe(1);

    // ---- everything below happens with the network cut ----
    await context.setOffline(true);

    // 1. Offline sale (walk-in, paid in full).
    await addToCart(page, sellProduct.sku, sellProduct.name);
    await openCheckout(page);
    await page.getByTestId('pos-customer-mode-walkin').click();
    await page.getByTestId('pos-walkin-name').fill('Offline Writes Walk In');
    await page.getByTestId('checkout-amount').fill('1500');
    await submitCheckout(page);

    // 2. Offline customer payment of 1500 against the credit order.
    await openPayment.click();
    await expect(payPage.getByTestId('record-payment-modal')).toBeVisible();
    await payPage.getByTestId('record-payment-amount').fill('1500');
    await payPage.getByTestId('record-payment-submit').click();
    await expect(payPage.getByTestId('record-payment-modal')).toHaveCount(0);

    // 3. Offline khata entry (lena).
    await khataPage.getByTestId('header-quick-khata').click();
    await expect(khataPage.getByTestId('quick-khata-modal')).toBeVisible();
    await khataPage.getByTestId('quick-khata-dir-lena').click();
    await khataPage.getByTestId('quick-khata-party').fill(khataParty);
    await khataPage.getByTestId('quick-khata-amount').fill('2750');
    await khataPage.getByTestId('quick-khata-due-chip').and(khataPage.locator('[data-days="7"]')).click();
    await khataPage.getByTestId('quick-khata-submit').click();
    await expect(khataPage.getByTestId('quick-khata-modal')).toBeHidden();

    // All three are pending in the shared Dexie queue; the server has seen none of them.
    await expect.poll(async () => (await readSyncQueue(page)).length).toBe(3);
    const queue = await readSyncQueue(page);
    const byType = Object.fromEntries(queue.map((q) => [q.type, q]));
    expect(Object.keys(byType).sort()).toEqual(['CREATE_KHATA_ENTRY', 'CREATE_ORDER', 'RECORD_PAYMENT']);
    expect(queue.every((q) => q.status === 'pending')).toBe(true);
    expect(new Set(queue.map((q) => q.id)).size).toBe(3);
    for (const q of queue) expect(q.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number(byType.RECORD_PAYMENT.payload.amount)).toBe(1500);
    expect(byType.RECORD_PAYMENT.payload.orderId).toBe(creditOrder.id);
    expect(Number(byType.CREATE_KHATA_ENTRY.payload.amount)).toBe(2750);
    expect(byType.CREATE_KHATA_ENTRY.payload.partyName).toBe(khataParty);
    expect(byType.CREATE_KHATA_ENTRY.payload.id).toBe(byType.CREATE_KHATA_ENTRY.id);
    expect(await db.order.count({ where: { businessId: BUSINESS_A } })).toBe(ordersBefore);
    expect(await db.payment.count({ where: { orderId: creditOrder.id } })).toBe(paymentsBefore);
    expect(await db.khataEntry.count({ where: { businessId: BUSINESS_A, partyName: khataParty } })).toBe(0);

    // ---- back online: the queue drains ----
    await context.setOffline(false);
    await expect
      .poll(() => db.khataEntry.count({ where: { businessId: BUSINESS_A, partyName: khataParty } }), { timeout: 60_000 })
      .toBe(1);
    await expect.poll(async () => (await readSyncQueue(page)).length, { timeout: 60_000 }).toBe(0);

    const orderId = byType.CREATE_ORDER.id;
    const paymentId = byType.RECORD_PAYMENT.id;
    const khataId = byType.CREATE_KHATA_ENTRY.id;

    async function assertExactlyOnce(): Promise<void> {
      // Exactly one Order for the sale (client id is the order id).
      expect(await db.order.count({ where: { businessId: BUSINESS_A, items: { some: { productId: sellProduct.id } } } })).toBe(1);
      const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } });
      expect(order.status).toBe('FINAL');
      expect(order.paymentStatus).toBe('PAID');
      expect(Number(order.totalAmount)).toBe(1500);
      expect(order.payments).toHaveLength(1);
      expect(Number(order.payments[0].amount)).toBe(1500);
      expect(await instanceCounts(sellProduct.id)).toEqual({ SOLD: 1, AVAILABLE: 2 });

      // Exactly one extra Payment on the credit order, with the right amount, under the client id.
      const payments = await db.payment.findMany({ where: { orderId: creditOrder.id }, orderBy: { createdAt: 'asc' } });
      expect(payments).toHaveLength(2);
      expect(payments.map((p) => Number(p.amount)).sort((a, b) => a - b)).toEqual([1000, 1500]);
      expect(await db.payment.count({ where: { id: paymentId } })).toBe(1);
      expect(Number((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).amount)).toBe(1500);
      const credit = await db.order.findUniqueOrThrow({ where: { id: creditOrder.id } });
      expect(credit.paymentStatus).toBe('PARTIAL');

      // Exactly one KhataEntry.
      expect(await db.khataEntry.count({ where: { businessId: BUSINESS_A, partyName: khataParty } })).toBe(1);
      const entry = await db.khataEntry.findUniqueOrThrow({ where: { id: khataId } });
      expect(entry.direction).toBe('RECEIVABLE');
      expect(Number(entry.amount)).toBe(2750);
      expect(entry.partyName).toBe(khataParty);

      await expectLedgerBalanced(BUSINESS_A);
    }
    await assertExactlyOnce();
    const txCount = () => db.transaction.count({ where: { referenceId: { in: [orderId, paymentId, khataId, creditOrder.id] } } });
    const txAfterFirstSync = await txCount();
    expect(txAfterFirstSync).toBeGreaterThanOrEqual(3);

    // ---- second flush: replay the very same queue items through the sync API, then reload the app ----
    const owner = await apiAs('ownerA', request);
    const replay = await owner.post('/sync/batch', { items: queue }, { branchId: HALL_ROAD });
    expect(replay.ok()).toBeTruthy();
    const results = (await replay.json()).results as { id: string; status: string }[];
    expect(results.map((r) => r.status)).toEqual(['synced', 'synced', 'synced']);

    await page.reload();
    await expect(page.getByTestId('pos-search')).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await readSyncQueue(page)).length).toBe(0);

    await assertExactlyOnce();
    expect(await txCount()).toBe(txAfterFirstSync);
  });
});

test.describe('P9: product and customer search use the local index (zero API calls once cached)', () => {
  test('typing different queries in the POS search and the customer picker makes no product/search/stock/customer API calls', async ({ page, request }) => {
    test.setTimeout(180_000);
    await useBranch(page.context(), HALL_ROAD);
    const token = uniq();
    const alpha = await createProduct(request, { price: 900, qty: 2, label: `Zephyrscreen${token}` });
    const beta = await createProduct(request, { price: 1100, qty: 2, label: `Quartzbattery${token}` });
    const customer = await createCustomer(request, `Lahori${token}`);

    // Warm-up online: fetching products caches them in Dexie and warms MiniSearch.
    await page.goto('/orders/new');
    await page.getByTestId('pos-search').fill(alpha.sku);
    await expect(page.getByTestId('pos-result-row').filter({ hasText: alpha.name })).toHaveCount(1);
    await expectProductCached(page, alpha.sku);
    await expectProductCached(page, beta.sku);

    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().startsWith(E2E.apiUrl)) apiCalls.push(`${req.method()} ${req.url().replace(E2E.apiUrl, '')}`);
    });
    // The sync engine's own periodic pull (GET /sync/pull?entity=...) is background polling, not a search request.
    const isBackgroundPull = (u: string) => u.startsWith('GET /sync/pull?');
    const catalogCalls = () => apiCalls.filter((u) => !isBackgroundPull(u) && /product|search|stock/i.test(u));

    // MiniSearch warms asynchronously after the cache write: retry a probe search until it is served locally.
    const probes = [alpha.sku, beta.sku];
    let probe = 0;
    await expect
      .poll(
        async () => {
          apiCalls.length = 0;
          const term = probes[probe++ % probes.length];
          const name = term === alpha.sku ? alpha.name : beta.name;
          await page.getByTestId('pos-search').fill(term);
          await expect(page.getByTestId('pos-result-row').filter({ hasText: name })).toHaveCount(1);
          return catalogCalls().length;
        },
        { timeout: 30_000 },
      )
      .toBe(0);

    // Strict phase: several different queries (full SKU, partial name, mid-word fragment, other product).
    apiCalls.length = 0;
    const cases: { query: string; expectName: string; absentName?: string }[] = [
      // SKU queries share the "E2E" token with every test product, so only the hit is asserted.
      { query: alpha.sku, expectName: alpha.name },
      { query: `Zephyr`, expectName: alpha.name, absentName: beta.name },
      { query: `Quartzbat`, expectName: beta.name, absentName: alpha.name },
      { query: beta.sku, expectName: beta.name },
      { query: `Zephyrscreen${token}`.slice(0, 12), expectName: alpha.name, absentName: beta.name },
    ];
    for (const c of cases) {
      await page.getByTestId('pos-search').fill(c.query);
      await expect(page.getByTestId('pos-result-row').filter({ hasText: c.expectName })).toHaveCount(1);
      if (c.absentName) {
        await expect(page.getByTestId('pos-result-row').filter({ hasText: c.absentName })).toHaveCount(0);
      }
    }
    expect(catalogCalls(), `catalogue requests during cached searches: ${catalogCalls().join(' | ')}`).toEqual([]);

    // Customer picker: the customer must be in the local index (cached in Dexie), and typing makes no customer API call.
    await addToCart(page, alpha.sku, alpha.name);
    await expect
      .poll(async () => (await readStore<{ id: string }>(page, 'customers')).some((c) => c.id === customer.id), {
        timeout: 30_000,
        message: 'customer created via API should be pulled into the Dexie customers store',
      })
      .toBe(true);
    await openCheckout(page);
    await page.getByTestId('pos-customer-mode-existing').click();
    apiCalls.length = 0;
    await page.getByTestId('pos-customer-select').fill(customer.name.slice(0, 14));
    await expect(page.getByTestId('pos-customer-option').filter({ hasText: customer.name })).toHaveCount(1);
    await page.getByTestId('pos-customer-select').fill(customer.name);
    await expect(page.getByTestId('pos-customer-option').filter({ hasText: customer.name })).toHaveCount(1);
    expect(apiCalls.filter((u) => !isBackgroundPull(u) && /customer|search/i.test(u)), `customer requests: ${apiCalls.join(' | ')}`).toEqual([]);
  });
});
