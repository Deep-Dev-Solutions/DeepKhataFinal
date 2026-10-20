import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { catalog } from '../../fixtures/catalog';
import { tenants } from '../../fixtures/users';

test.use({ storageState: storage('staffA') });

test('customer view shows name and sale price but never the minimum price', async ({ page }) => {
  await useBranch(page.context(), tenants.A.branches.hafeezCentre.id);
  await page.goto('/stock-finder');
  const found = page.waitForResponse(
    (r) => r.url().includes('/stock/find') && decodeURIComponent(r.url()).includes('q=821177-001'),
  );
  await page.getByTestId('stock-finder-search').fill(catalog.keyboard840.partNumber);
  await found;

  const first = page.getByTestId('stock-result').first();
  await expect(first).toHaveAttribute('data-product-id', catalog.keyboard840.productId);
  await first.getByTestId('stock-action-customer-view').click();

  const view = page.getByTestId('customer-view');
  await expect(view).toBeVisible();
  await expect(view).toContainText(catalog.keyboard840.name);
  await expect(view).toContainText('Rs 4,500');
  await expect(view).not.toContainText('3,800');
  await expect(view).not.toContainText('2,500');

  await page.getByTestId('customer-view-close').click();
  await expect(view).toBeHidden();
});
