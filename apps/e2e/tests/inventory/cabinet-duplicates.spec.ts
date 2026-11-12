import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { HALL_ROAD, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

test('the cabinets page refuses a duplicate inline and allows a different bin', async ({ page }) => {
  const name = `E2E Dup ${uniq()}`;

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/settings/cabinets');

  const fill = async (bin: string) => {
    await page.getByTestId('cabinet-name').fill(name);
    await page.getByTestId('cabinet-rack').fill('R1');
    await page.getByTestId('cabinet-shelf').fill('S1');
    await page.getByTestId('cabinet-bin').fill(bin);
    await page.getByTestId('cabinet-submit').click();
  };

  await fill('B1');
  await expect(page.getByTestId('cabinet-row').filter({ hasText: name })).toHaveCount(1);

  // Exact same name + rack + shelf + bin: blocked with the shopkeeper message.
  await fill('b1');
  await expect(page.getByTestId('cabinet-error')).toContainText('Yeh cabinet pehle se mojood hai');
  await expect(page.getByTestId('cabinet-error')).toContainText(name);
  await expect(page.getByTestId('cabinet-row').filter({ hasText: name })).toHaveCount(1);
  expect(
    await db.cabinet.count({
      where: { branchId: HALL_ROAD, name: { equals: name, mode: 'insensitive' } },
    }),
  ).toBe(1);

  // Same name in another bin is a genuinely different place.
  await fill('B2');
  await expect(page.getByTestId('cabinet-row').filter({ hasText: name })).toHaveCount(2);
  await expect(page.getByTestId('cabinet-error')).toHaveCount(0);
});
