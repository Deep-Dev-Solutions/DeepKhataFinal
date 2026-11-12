import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { BUSINESS_A, HAFEEZ, HALL_ROAD, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

test.describe('products: add-product modal branch data', () => {
  test('cabinets and categories follow the branch chosen inside the modal', async ({ page }) => {
    const token = uniq();
    const hallCabinet = `Hall Cab ${token}`;
    const hafeezCabinet = `Hafeez Cab ${token}`;
    const hallCategory = `Hall Cat ${token}`;
    const hafeezCategory = `Hafeez Cat ${token}`;

    await db.cabinet.createMany({
      data: [
        { name: hallCabinet, businessId: BUSINESS_A, branchId: HALL_ROAD, rack: 'H1' },
        { name: hafeezCabinet, businessId: BUSINESS_A, branchId: HAFEEZ, rack: 'H2' },
      ],
    });
    await db.category.createMany({
      data: [
        { name: hallCategory, businessId: BUSINESS_A, branchId: HALL_ROAD },
        { name: hafeezCategory, businessId: BUSINESS_A, branchId: HAFEEZ },
      ],
    });

    await useBranch(page.context(), HALL_ROAD);
    await page.goto('/products');
    await page.getByTestId('products-add').click();
    await expect(page.getByTestId('add-product-modal')).toBeVisible();

    const cabinetSelect = page.getByTestId('product-cabinet');
    const categorySelect = page
      .getByTestId('add-product-modal')
      .locator('select')
      .first();

    await expect(cabinetSelect.locator('option', { hasText: hallCabinet })).toHaveCount(1);
    await expect(cabinetSelect.locator('option', { hasText: hafeezCabinet })).toHaveCount(0);

    const hallCabinetValue = await cabinetSelect
      .locator('option', { hasText: hallCabinet })
      .getAttribute('value');
    await cabinetSelect.selectOption(hallCabinetValue!);
    await expect(cabinetSelect).not.toHaveValue('');

    await page.getByTestId('product-branch').selectOption(HAFEEZ);

    // The previous branch's cabinet is cleared, not silently submitted.
    await expect(cabinetSelect).toHaveValue('');
    await expect(cabinetSelect.locator('option', { hasText: hafeezCabinet })).toHaveCount(1);
    await expect(cabinetSelect.locator('option', { hasText: hallCabinet })).toHaveCount(0);
    await expect(categorySelect.locator('option', { hasText: hafeezCategory })).toHaveCount(1);
    await expect(categorySelect.locator('option', { hasText: hallCategory })).toHaveCount(0);
  });
});
