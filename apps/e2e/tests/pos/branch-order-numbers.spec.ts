import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { tenants } from '../../fixtures/users';
import {
  createProduct,
  createSaleViaApi,
  HAFEEZ,
  HALL_ROAD,
} from './support';

test.use({ storageState: storage('ownerA') });

test('order numbers are branch-coded in the orders list', async ({ page, request }) => {
  const hallProduct = await createProduct(request, { price: 300, qty: 1, label: 'NumHall' });
  const hafeezProduct = await createProduct(request, {
    price: 300,
    qty: 1,
    label: 'NumHafeez',
    branchId: HAFEEZ,
  });

  const hallSale = await createSaleViaApi(request, {
    items: [{ productId: hallProduct.id, quantity: 1, price: 300 }],
    amountPaid: 300,
  });
  const hafeezSale = await createSaleViaApi(request, {
    items: [{ productId: hafeezProduct.id, quantity: 1, price: 300 }],
    amountPaid: 300,
    branchId: HAFEEZ,
  });

  const hallBranch = await db.branch.findUniqueOrThrow({ where: { id: HALL_ROAD } });
  const hafeezBranch = await db.branch.findUniqueOrThrow({ where: { id: HAFEEZ } });
  expect(hallBranch.code).toMatch(/^[A-Z]{2,4}$/);
  expect(hafeezBranch.code).toMatch(/^[A-Z]{2,4}$/);

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders');
  const hallRow = page.getByTestId('order-row').filter({ hasText: String(hallSale.orderNumber) });
  await expect(hallRow).toHaveCount(1);
  await expect(hallRow).toContainText(`${hallBranch.code}-${hallSale.orderNumber}`);

  await useBranch(page.context(), HAFEEZ);
  await page.reload();
  const hafeezRow = page.getByTestId('order-row').filter({ hasText: String(hafeezSale.orderNumber) });
  await expect(hafeezRow).toHaveCount(1);
  await expect(hafeezRow).toContainText(`${hafeezBranch.code}-${hafeezSale.orderNumber}`);

  // Two branches can share the same numeric part; the code keeps them apart.
  const labelOf = (code: string, n: number) => `${code}-${n}`;
  expect(labelOf(hallBranch.code!, hallSale.orderNumber)).not.toBe(
    labelOf(hafeezBranch.code!, hafeezSale.orderNumber),
  );
});
