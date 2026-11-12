import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { createProduct, HALL_ROAD, instanceCounts, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

async function createCabinet(request: APIRequestContext, label: string) {
  const owner = await apiAs('ownerA', request);
  const res = await owner.post('/cabinet', { name: `E2E ${label} ${uniq()}`, branchId: HALL_ROAD });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  return { id: body.cabinet.id as string, name: body.cabinet.name as string };
}

test('switching the product clears the cabinet and suggests the product’s own cabinet', async ({ page, request }) => {
  const first = await createProduct(request, { price: 700, qty: 1, label: 'CabA' });
  const second = await createProduct(request, { price: 800, qty: 1, label: 'CabB' });
  const cabinet = await createCabinet(request, 'Switch');

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/inventory/restock');
  await page.getByTestId('restock-product-search').fill(first.sku);
  await page.getByRole('button', { name: new RegExp(first.name) }).click();
  await page.getByTestId('restock-cabinet').selectOption(cabinet.id);
  await expect(page.getByTestId('restock-cabinet')).toHaveValue(cabinet.id);

  // Switching product must not carry cabinet X over to product B.
  await page.getByTestId('restock-product-search').fill(second.sku);
  await page.getByRole('button', { name: new RegExp(second.name) }).click();
  await expect(page.getByTestId('restock-cabinet')).toHaveValue('');

  // B's own cabinet (from its existing units) is offered, never auto-applied.
  const general = await db.cabinet.findFirstOrThrow({ where: { branchId: HALL_ROAD, name: 'General' } });
  await expect(page.getByTestId('restock-cabinet-suggest')).toContainText('General');
  await page.getByTestId('restock-cabinet-suggest').click();
  await expect(page.getByTestId('restock-cabinet')).toHaveValue(general.id);

  await page.getByTestId('restock-qty').fill('1');
  await page.getByRole('button', { name: 'Add to Batch' }).click();
  await page.getByTestId('restock-submit').click();
  await expect(page.getByTestId('restock-success')).toBeVisible();

  expect(await db.productInstance.count({ where: { productId: second.id, cabinetId: general.id } })).toBe(2);
  const movement = await db.inventoryMovement.findFirstOrThrow({
    where: { productId: second.id, referenceType: 'RESTOCK' },
  });
  expect(movement.cabinetId).toBe(general.id);
});

test('restock refuses a line without a cabinet instead of filing it under General', async ({ request }) => {
  const product = await createProduct(request, { price: 500, qty: 1, label: 'NoCab' });
  const owner = await apiAs('ownerA', request);
  const res = await owner.post(
    '/inventory/restock',
    { items: [{ productId: product.id, branchId: HALL_ROAD, quantity: 2 }] },
    { branchId: HALL_ROAD },
  );
  expect(res.status()).toBe(400);
  expect((await res.json()).message).toContain('Select a cabinet');
  expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 1 });
});
