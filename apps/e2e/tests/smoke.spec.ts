import { test, expect } from '@playwright/test';
import { storage, type StoredUser } from '../helpers/auth';

const roles: StoredUser[] = ['ownerA', 'managerA', 'staffA'];

for (const role of roles) {
  test.describe(`smoke: ${role}`, () => {
    test.use({ storageState: storage(role) });

    test('dashboard renders for stored session', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('main, h1').first()).toBeVisible();
    });
  });
}
