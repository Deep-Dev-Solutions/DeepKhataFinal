import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { useBranch } from '../../helpers/branch';
import { catalog } from '../../fixtures/catalog';
import { tenants } from '../../fixtures/users';

test.use({ storageState: storage('staffA') });

test('staff cannot sell below the minimum price; a price at or above it succeeds', async ({ page }) => {
  const screen = catalog.minPriceScreen;
  await useBranch(page.context(), tenants.A.branches.hallRoad.id);
  const ordersBefore = await db.order.findMany({ where: { businessId: tenants.A.id }, select: { id: true } });
  const excluded = ordersBefore.map((o) => o.id);
  const newOrdersWithProduct = () =>
    db.order.findMany({
      where: { businessId: tenants.A.id, id: { notIn: excluded }, items: { some: { productId: screen.productId } } },
      include: { items: true },
    });

  await page.goto('/orders/new');
  await page.getByTestId('pos-search').fill(screen.sku);
  const result = page.getByTestId('pos-result-row').filter({ hasText: screen.name });
  await expect(result).toHaveCount(1);
  await result.getByTestId('pos-add-item').click();
  const cartRow = page.getByTestId('pos-cart-row');
  await expect(cartRow).toHaveCount(1);

  // Below minimum (8,000): warning, then server rejects.
  await cartRow.getByTestId('pos-cart-price').fill('7500');
  await expect(page.getByTestId('pos-below-min')).toBeVisible();
  await page.getByTestId('pos-checkout').click();
  await expect(page.getByTestId('checkout-drawer')).toBeVisible();
  await page.getByTestId('checkout-amount').fill('7500');
  await page.getByTestId('checkout-submit').click();
  await expect(page.getByTestId('checkout-error')).toContainText('Minimum price');
  expect(await newOrdersWithProduct()).toHaveLength(0);
  expect(await db.productInstance.count({ where: { productId: screen.productId, status: 'SOLD' } })).toBe(0);

  // Close the drawer and fix the price.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('checkout-drawer')).toHaveAttribute('aria-hidden', 'true');
  await cartRow.getByTestId('pos-cart-price').fill('8500');
  await expect(page.getByTestId('pos-below-min')).toBeHidden();
  await page.getByTestId('pos-checkout').click();
  await expect(page.getByTestId('checkout-drawer')).toBeVisible();
  await page.getByTestId('checkout-amount').fill('8500');
  await page.getByTestId('checkout-submit').click();
  await expect(page.getByTestId('checkout-drawer')).toHaveAttribute('aria-hidden', 'true');

  await expect.poll(async () => (await newOrdersWithProduct()).length).toBe(1);
  const [order] = await newOrdersWithProduct();
  expect(Number(order.totalAmount)).toBe(8500);
  expect(order.paymentStatus).toBe('PAID');
  expect(Number(order.items[0].price)).toBe(8500);
  const sold = await db.productInstance.findMany({ where: { productId: screen.productId, status: 'SOLD' } });
  expect(sold).toHaveLength(1);
  expect(sold[0].branchId).toBe(tenants.A.branches.hallRoad.id);
  await expectLedgerBalanced(tenants.A.id);
});
