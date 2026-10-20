import { test, expect, type Response } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { createProduct, HAFEEZ } from '../pos/support';
import { tenants } from '../../fixtures/users';

const hall = tenants.A.branches.hallRoad;
const hafeez = tenants.A.branches.hafeezCentre;
const FORBIDDEN_KEYS = ['costPrice', 'unitCost', 'defaultCostPrice'];

function findForbiddenKeys(node: unknown, path = '$'): string[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => findForbiddenKeys(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => [
      ...(FORBIDDEN_KEYS.includes(k) ? [`${path}.${k}`] : []),
      ...findForbiddenKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}

const isFindFor = (q: string) => (r: Response) => {
  if (!r.url().includes('/stock/find')) return false;
  return decodeURIComponent(r.url().replace(/\+/g, ' ')).includes(`q=${q}`);
};

test.use({ storageState: storage('staffA') });

test('staff finds the keyboard at Hafeez, requests a transfer, manager dispatches, Hall Road receives, staff sells it', async ({
  page,
  browser,
  request,
}) => {
  // Seven page loads against the Next dev server (each one a cold on-demand compile of 4-6 s, plus the POS
  // checkout) add up to about 30 s, which is the default test timeout. Proven from the failed run's trace: every
  // assertion up to the checkout passed with correct data, the clock simply ran out.
  test.setTimeout(120_000);

  // Own product (3 units at Hafeez, 2 ORIGINAL_PULL + 1 MINOR_SCRATCHES) so no other suite can sell, reserve
  // or transfer the stock this test counts.
  const kb = await createProduct(request, { price: 4500, minSalePrice: 3800, qty: 3, branchId: HAFEEZ, label: 'Keyboard' });
  const productId = kb.id;
  const seeded = await db.productInstance.findMany({ where: { productId }, orderBy: { id: 'asc' } });
  expect(seeded).toHaveLength(3);
  const owner = await apiAs('ownerA', request);
  const patched = await owner.patch(`/product/instances/${seeded[2].id}`, { condition: 'MINOR_SCRATCHES' });
  expect(patched.ok(), await patched.text()).toBeTruthy();
  const query = kb.name;
  const transfersBefore = await db.stockTransferRequest.findMany({
    where: { businessId: tenants.A.id },
    select: { id: true },
  });

  // 1. Staff at Hall Road searches the stock finder.
  await useBranch(page.context(), hall.id);
  await page.goto('/stock-finder');
  await expect(page.getByTestId('stock-finder-page')).toBeVisible();

  const findResponse = page.waitForResponse(isFindFor(query));
  await page.getByTestId('stock-finder-search').fill(query);
  const body = await (await findResponse).json();
  expect(findForbiddenKeys(body)).toEqual([]);

  const card = page.locator(`[data-testid="stock-result"][data-product-id="${productId}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('stock-result-name')).toContainText(kb.name);

  const ownRow = card.locator('[data-testid="stock-branch-row"][data-own="true"]');
  await expect(ownRow).toHaveCount(1);
  await expect(ownRow).toContainText('Yahan: 0');

  const hafeezRow = card.locator(`[data-testid="stock-branch-row"][data-branch-id="${hafeez.id}"]`);
  await expect(hafeezRow).toHaveAttribute('data-own', 'false');
  await expect(hafeezRow.getByTestId('stock-branch-available')).toHaveText('3');
  await expect(hafeezRow).toContainText('Original Pull');
  await expect(hafeezRow).toContainText('Minor Scratches');
  await expect(hafeezRow.getByTestId('stock-location')).toHaveCount(0);
  await expect(card.getByTestId('stock-location')).toHaveCount(0);

  await expect(card.getByTestId('stock-price-sale')).toContainText('4,500');
  await expect(card.getByTestId('stock-price-min')).toContainText('3,800');
  await expect(card.getByTestId('stock-price-cost')).toHaveCount(0);

  // 2. Request 1 unit from Hafeez Centre.
  await card.getByTestId('stock-action-request').click();
  await expect(page.getByTestId('transfer-modal')).toBeVisible();
  await page.getByTestId('transfer-from-branch').selectOption(hafeez.id);
  await page.getByTestId('transfer-qty').fill('1');
  await page.getByTestId('transfer-submit').click();
  await expect(page.getByTestId('transfer-modal')).toBeHidden();

  const transfer = await expect
    .poll(async () => {
      const rows = await db.stockTransferRequest.findMany({
        where: { businessId: tenants.A.id, id: { notIn: transfersBefore.map((t) => t.id) } },
        include: { items: { include: { instance: true } } },
      });
      return rows.length;
    })
    .toBe(1)
    .then(() =>
      db.stockTransferRequest.findFirstOrThrow({
        where: { businessId: tenants.A.id, id: { notIn: transfersBefore.map((t) => t.id) } },
        include: { items: { include: { instance: true } } },
      }),
    );
  expect(transfer.status).toBe('REQUESTED');
  expect(transfer.fromBranchId).toBe(hafeez.id);
  expect(transfer.toBranchId).toBe(hall.id);
  expect(transfer.items).toHaveLength(1);
  expect(transfer.items[0].instance.productId).toBe(productId);
  const transferRow = (p: import('@playwright/test').Page) =>
    p.locator(`[data-testid="transfer-row"][data-transfer-id="${transfer.id}"]`);

  // 3. Manager at Hafeez Centre sees the notification and dispatches.
  const mgrHafeez = await browser.newContext({ storageState: storage('managerA') });
  try {
    await useBranch(mgrHafeez, hafeez.id);
    const mp = await mgrHafeez.newPage();
    await mp.goto('/dashboard');
    await expect(mp.getByTestId('notif-count')).toBeVisible();
    // The badge caps at "9+" once more than 9 notifications are unread (other suites also notify this manager).
    const badge = (await mp.getByTestId('notif-count').innerText()).trim();
    expect(badge).toMatch(/^(\d+|9\+)$/);
    expect(Number.parseInt(badge, 10)).toBeGreaterThanOrEqual(1);
    await mp.getByTestId('notif-bell').click();
    await expect(mp.getByTestId('notif-item').filter({ hasText: /transfer/i }).first()).toBeVisible();

    await expect(mp.getByTestId('transfers-widget')).toBeVisible();
    const row = transferRow(mp);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-status', 'REQUESTED');
    await row.getByTestId('transfer-dispatch').click();
    // The sender's inbox only lists REQUESTED rows, so the row leaves the Hafeez widget once dispatched.
    await expect(row).toHaveCount(0);
  } finally {
    await mgrHafeez.close();
  }
  await expect
    .poll(async () => (await db.stockTransferRequest.findUniqueOrThrow({ where: { id: transfer.id } })).status)
    .toBe('DISPATCHED');

  // 4. Manager at Hall Road receives.
  const mgrHall = await browser.newContext({ storageState: storage('managerA') });
  try {
    await useBranch(mgrHall, hall.id);
    const mp = await mgrHall.newPage();
    await mp.goto('/dashboard');
    const row = transferRow(mp);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-status', 'DISPATCHED');
    await row.getByTestId('transfer-receive').click();
    // Received transfers drop out of the open-transfers inbox; RECEIVED is asserted in the DB below.
    await expect(row).toHaveCount(0);
  } finally {
    await mgrHall.close();
  }
  const received = await db.stockTransferRequest.findUniqueOrThrow({
    where: { id: transfer.id },
    include: { items: { include: { instance: true } } },
  });
  expect(received.status).toBe('RECEIVED');
  const instanceId = received.items[0].instanceId;
  expect(received.items[0].instance.branchId).toBe(hall.id);

  // 5. Staff at Hall Road now sees 1 available and sells it.
  await page.goto('/stock-finder');
  const findAgain = page.waitForResponse(isFindFor(query));
  await page.getByTestId('stock-finder-search').fill(query);
  await findAgain;
  await expect(card).toBeVisible();
  await expect(ownRow).toHaveCount(1);
  await expect(ownRow.getByTestId('stock-branch-available')).toHaveText('1');
  await expect(card.locator(`[data-testid="stock-branch-row"][data-branch-id="${hafeez.id}"]`).getByTestId('stock-branch-available')).toHaveText('2');

  const ordersBefore = await db.order.findMany({ where: { businessId: tenants.A.id }, select: { id: true } });
  await card.getByTestId('stock-action-sell').click();
  await expect(page).toHaveURL(/\/orders\/new/);
  const cartRow = page.getByTestId('pos-cart-row');
  await expect(cartRow).toHaveCount(1);
  await expect(cartRow).toContainText(kb.name);
  const price = Number(await cartRow.getByTestId('pos-cart-price').inputValue());
  expect(price).toBe(kb.price);

  await page.getByTestId('pos-checkout').click();
  await expect(page.getByTestId('checkout-drawer')).toBeVisible();
  await page.getByTestId('checkout-amount').fill(String(price));
  await page.getByTestId('checkout-submit').click();
  await expect(page.getByTestId('checkout-drawer')).toHaveAttribute('aria-hidden', 'true');

  await expect
    .poll(() =>
      db.order.count({
        where: { businessId: tenants.A.id, id: { notIn: ordersBefore.map((o) => o.id) } },
      }),
    )
    .toBe(1);
  const order = await db.order.findFirstOrThrow({
    where: { businessId: tenants.A.id, id: { notIn: ordersBefore.map((o) => o.id) } },
    include: { items: true },
  });
  expect(order.paymentStatus).toBe('PAID');
  expect(Number(order.totalAmount)).toBe(price);
  expect(order.items.map((i) => i.productId)).toEqual([productId]);

  // 6. DB: exactly one keyboard instance SOLD at Hall Road; movements recorded.
  const sold = await db.productInstance.findMany({ where: { productId, status: 'SOLD' } });
  expect(sold).toHaveLength(1);
  expect(sold[0].branchId).toBe(hall.id);
  expect(sold[0].id).toBe(instanceId);

  const movements = await db.inventoryMovement.findMany({
    where: { productId, referenceType: 'TRANSFER' },
  });
  expect(movements.some((m) => m.direction === 'OUT' && m.branchId === hafeez.id)).toBe(true);
  expect(movements.some((m) => m.direction === 'IN' && m.branchId === hall.id)).toBe(true);

  await expectLedgerBalanced(tenants.A.id);
});
