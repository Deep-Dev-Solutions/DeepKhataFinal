import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { catalog } from '../../fixtures/catalog';
import { HALL_ROAD } from './support';

test.use({ storageState: storage('staffA') });

test('an item stocked only at the other branch is flagged and cannot be added to the Hall Road cart', async ({ page }) => {
  const kb = catalog.keyboard840;
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await page.getByTestId('pos-search').fill(kb.sku);

  const row = page.getByTestId('pos-result-row').filter({ hasText: kb.name });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('pos-remote-badge')).toContainText('Hafeez Centre');

  await row.getByTestId('pos-add-item').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'no available stock' })).toBeVisible();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(0);
  await expect(page.getByTestId('pos-checkout')).toBeDisabled();
});

test('browsing the other branch catalogue marks every row remote and blocks adding', async ({ page }) => {
  const kb = catalog.keyboard840;
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  // Fallback selector: the catalogue branch dropdown has no testid (see MISSING_TESTIDS).
  await page.getByRole('combobox').filter({ hasText: 'Hafeez Centre' }).selectOption({ label: 'Hafeez Centre' });
  await page.getByTestId('pos-search').fill(kb.sku);

  const row = page.getByTestId('pos-result-row').filter({ hasText: kb.name });
  await expect(row).toHaveCount(1);
  // Default card view labels the row "Remote Stock" (that label has no testid, see MISSING_TESTIDS); it is not clickable.
  await expect(row).toContainText('Remote Stock');
  await expect(row.getByTestId('pos-add-item')).toBeDisabled();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(0);

  // Compact list view shows the remote count in the badge.
  await page.getByRole('button', { name: 'Compact list view' }).click();
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('pos-remote-badge')).toContainText('3 left');
  await expect(row.getByTestId('pos-add-item')).toBeDisabled();
});
