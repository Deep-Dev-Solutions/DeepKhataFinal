import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { createProduct, HALL_ROAD, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

async function createCabinet(request: APIRequestContext, label: string) {
  const owner = await apiAs('ownerA', request);
  const res = await owner.post('/cabinet', { name: `E2E ${label} ${uniq()}`, branchId: HALL_ROAD });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).cabinet.id as string;
}

test('restocked units continue the product’s unit codes', async ({ page, request }) => {
  const product = await createProduct(request, { price: 750, qty: 2, label: 'Serials' });
  const cabinetId = await createCabinet(request, 'Serials');

  const initial = await db.productInstance.findMany({
    where: { productId: product.id },
    select: { serialNumber: true },
    orderBy: { serialNumber: 'asc' },
  });
  expect(initial.map((i) => i.serialNumber)).toEqual([
    `${product.sku}-1`,
    `${product.sku}-2`,
  ]);

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/inventory/restock');
  await page.getByTestId('restock-product-search').fill(product.sku);
  await page.getByRole('button', { name: new RegExp(product.name) }).click();
  await page.getByTestId('restock-cabinet').selectOption(cabinetId);
  await page.getByTestId('restock-qty').fill('3');
  await page.getByRole('button', { name: 'Add to Batch' }).click();
  await page.getByTestId('restock-submit').click();
  await expect(page.getByTestId('restock-success')).toBeVisible();

  const after = await db.productInstance.findMany({
    where: { productId: product.id },
    select: { serialNumber: true },
    orderBy: { serialNumber: 'asc' },
  });
  expect(after.map((i) => i.serialNumber)).toEqual([
    `${product.sku}-1`,
    `${product.sku}-2`,
    `${product.sku}-3`,
    `${product.sku}-4`,
    `${product.sku}-5`,
  ]);
});
