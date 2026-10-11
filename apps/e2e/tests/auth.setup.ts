import { test as setup, expect } from '@playwright/test';
import { TEST_PASSWORD, users } from '../fixtures/users';
import { storage, type StoredUser } from '../helpers/auth';

const keys: StoredUser[] = ['ownerA', 'managerA', 'staffA', 'ownerB'];

for (const key of keys) {
  setup(`authenticate ${key}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(users[key].email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('accessToken')))
      .not.toBeNull();
    await page.context().storageState({ path: storage(key) });
  });
}
