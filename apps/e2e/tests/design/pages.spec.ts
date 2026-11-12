import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { HALL_ROAD } from '../pos/support';

/**
 * Layout guardrails: the four reworked pages share one shell. A 20% pixel
 * budget keeps data changes from failing the check while still catching a
 * different heading size, width or spacing.
 */
test.use({ storageState: storage('ownerA'), viewport: { width: 1280, height: 900 } });

const shot = { animations: 'disabled' as const, maxDiffPixelRatio: 0.2 };

test.beforeEach(async ({ page }) => {
  await useBranch(page.context(), HALL_ROAD);
});

test('stock finder shell', async ({ page }) => {
  await page.goto('/stock-finder');
  await expect(page.getByTestId('stock-finder-page')).toBeVisible();
  await expect(page.getByTestId('stock-finder-hints')).toBeVisible();
  await expect(page).toHaveScreenshot('stock-finder.png', shot);
});

test('lena / dena shell', async ({ page }) => {
  await page.goto('/dues');
  await expect(page.getByTestId('dues-page')).toBeVisible();
  await expect(page.getByTestId('dues-tab-lena')).toBeVisible();
  await expect(page).toHaveScreenshot('dues.png', shot);
});

test('reports shell', async ({ page }) => {
  await page.goto('/reports');
  await expect(page.getByTestId('reports-range')).toBeVisible();
  await expect(page).toHaveScreenshot('reports.png', shot);
});

test('orders shell', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByTestId('orders-create')).toBeVisible();
  await expect(page).toHaveScreenshot('orders.png', shot);
});
