import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { createProduct, HALL_ROAD, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

async function restockIntoNewCabinet(
  request: APIRequestContext,
  productId: string,
  label: string,
  quantity: number,
) {
  const owner = await apiAs('ownerA', request);
  const cabinetName = `E2E Multi ${label} ${uniq()}`;
  const cabinet = await owner.post('/cabinet', { name: cabinetName, branchId: HALL_ROAD });
  expect(cabinet.ok(), await cabinet.text()).toBeTruthy();
  const cabinetId = (await cabinet.json()).cabinet.id as string;
  const res = await owner.post(
    '/inventory/restock',
    { items: [{ productId, branchId: HALL_ROAD, cabinetId, quantity }] },
    { branchId: HALL_ROAD },
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return { cabinetId, cabinetName };
}

test('the products list shows every cabinet with a +N badge', async ({ page, request }) => {
  const product = await createProduct(request, { price: 950, qty: 1, label: 'MultiCab' });
  const second = await restockIntoNewCabinet(request, product.id, 'Second', 2);

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/products');
  await page.getByTestId('products-search').fill(product.sku);
  const row = page.getByTestId('product-row').filter({ hasText: product.sku });
  await expect(row).toHaveCount(1);

  const location = row.getByTestId('product-location');
  // The cabinet holding the most units is shown first; the rest collapse to +N.
  await expect(location).toContainText(second.cabinetName);
  await expect(location.getByTestId('product-extra-cabinets')).toContainText('+1');

  const title = await location.getAttribute('title');
  expect(title).toContain(second.cabinetName);
  expect(title).toContain('2 units');
  expect(title).toContain('1 unit');
});
