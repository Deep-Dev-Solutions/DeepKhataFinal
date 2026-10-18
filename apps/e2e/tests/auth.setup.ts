import { test as setup, expect } from '@playwright/test';
import { TEST_PASSWORD, users } from '../fixtures/users';
import { storage, type StoredUser } from '../helpers/auth';

const keys: StoredUser[] = ['ownerA', 'managerA', 'staffA', 'ownerB'];

for (const key of keys) {
  setup(`authenticate ${key}`, async ({ page }) => {
    // The first request after a cold `next dev` start compiles /login and
    // /dashboard; wait for the form and allow the redirect time to compile.
    await page.goto('/login');
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('login-email').fill(users[key].email);
    await page.getByTestId('login-password').fill(TEST_PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('accessToken')))
      .not.toBeNull();
    await page.context().storageState({ path: storage(key) });
  });
}
