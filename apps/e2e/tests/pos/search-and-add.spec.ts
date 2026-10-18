import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { createProduct, HALL_ROAD } from './support';

test.use({ storageState: storage('staffA') });

test('POS finds a product by name and by SKU and adds it to the cart at its price', async ({ page, request }) => {
  const product = await createProduct(request, { price: 1200, qty: 3, label: 'Search' });
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');

  // By (partial) name
  await page.getByTestId('pos-search').fill(product.name.slice(0, 18));
  const byName = page.getByTestId('pos-result-row').filter({ hasText: product.name });
  await expect(byName).toHaveCount(1);

  // By exact SKU: search is fuzzy (trigram), so look-alike SKUs may follow, but the exact match must rank first.
  await page.getByTestId('pos-search').fill(product.sku);
  const bySku = page.getByTestId('pos-result-row').filter({ hasText: product.name });
  await expect(bySku).toHaveCount(1);
  await expect(page.getByTestId('pos-result-row').first()).toContainText(product.name);

  await bySku.getByTestId('pos-add-item').click();
  const cartRow = page.getByTestId('pos-cart-row');
  await expect(cartRow).toHaveCount(1);
  await expect(cartRow).toContainText(product.name);
  await expect(cartRow.getByTestId('pos-cart-price')).toHaveValue('1200');
  await expect(page.getByTestId('pos-total')).toContainText('1,200');

  // Adding the same item again raises the quantity instead of adding a second line
  await bySku.getByTestId('pos-add-item').click();
  await expect(cartRow).toHaveCount(1);
  await expect(page.getByTestId('pos-total')).toContainText('2,400');

  // A term that resembles nothing gives no results (search is fuzzy, so a look-alike SKU would still list near matches).
  await page.getByTestId('pos-search').fill('QXZJWV9987');
  await expect(page.getByTestId('pos-result-row')).toHaveCount(0);
});
