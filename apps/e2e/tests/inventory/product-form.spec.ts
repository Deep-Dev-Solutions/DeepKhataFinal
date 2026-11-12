import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { BUSINESS_A, HALL_ROAD, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

test('the add-product form groups its fields and blocks a min price above the selling price', async ({ page }) => {
  const token = uniq();
  const cabinetName = `Form Cab ${token}`;
  const productName = `Form Product ${token}`;

  await db.cabinet.create({
    data: { name: cabinetName, businessId: BUSINESS_A, branchId: HALL_ROAD, rack: 'F1' },
  });
  const category = await db.category.findFirstOrThrow({
    where: { businessId: BUSINESS_A, branchId: null },
  });

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/products');
  await page.getByTestId('products-add').click();
  await expect(page.getByTestId('add-product-modal')).toBeVisible();

  await page.getByTestId('product-name').fill(productName);
  await page.getByTestId('product-category').selectOption(category.name);
  await page.getByTestId('product-cost-price').fill('500');
  await page.getByTestId('product-selling-price').fill('1000');
  await page.getByTestId('product-min-price').fill('900');

  await expect(page.getByText('1 · Product')).toBeVisible();
  await expect(page.getByText('2 · Price')).toBeVisible();
  await expect(page.getByText('3 · Stock & location')).toBeVisible();
  await expect(page.getByTestId('product-margin-hint')).toContainText('Rs 500 (50.0%)');

  // Minimum above the selling price: refused with a message, nothing saved.
  await page.getByTestId('product-min-price').fill('1200');
  await page.getByTestId('product-branch').selectOption(HALL_ROAD);
  await page.getByTestId('product-cabinet').selectOption({ label: `${cabinetName} - Rack F1` });
  await page.getByTestId('add-product-modal').getByRole('button', { name: 'Create Product' }).click();
  await expect(page.getByTestId('product-form-error')).toContainText(
    'Minimum price cannot be above the sale price',
  );
  await expect(page.getByTestId('add-product-modal')).toBeVisible();
  expect(await db.product.count({ where: { businessId: BUSINESS_A, name: productName } })).toBe(0);

  // Fixing the floor price saves normally.
  await page.getByTestId('product-min-price').fill('900');
  await page.getByTestId('add-product-modal').getByRole('button', { name: 'Create Product' }).click();
  await expect(page.getByTestId('add-product-modal')).toHaveCount(0);
  const saved = await db.product.findFirstOrThrow({
    where: { businessId: BUSINESS_A, name: productName },
  });
  expect(Number(saved.basePrice)).toBe(1000);
  expect(Number(saved.minSalePrice)).toBe(900);
});
