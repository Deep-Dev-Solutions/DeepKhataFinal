import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, users } from '../../fixtures/users';
import { E2E } from '../../env';

test.use({ storageState: { cookies: [], origins: [] } });

async function uiLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

test.describe('A: login / logout', () => {
  test('valid login lands on the dashboard with a session token, logout revokes it', async ({ page, request }) => {
    await uiLogin(page, users.managerA.email, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await expect(page.getByTestId('sidebar-root')).toBeVisible();

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session_token'));
    expect(sessionCookie).toBeTruthy();
    const token = decodeURIComponent(sessionCookie!.value).split('.')[0];
    const me = await request.get(`${E2E.apiUrl}/customer/getallcustomers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status()).toBe(200);

    await page.getByTestId('sidebar-logout').click();
    await expect(page).toHaveURL(/\/login/);
    await expect
      .poll(async () => {
        const c = await page.context().cookies();
        return c.find((x) => x.name.includes('session_token') && x.value);
      })
      .toBeFalsy();

    // The token that was live before logout must be rejected by the API (jti revoked).
    const after = await request.get(`${E2E.apiUrl}/customer/getallcustomers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.status()).toBe(401);

    // A protected page no longer renders for the logged-out browser.
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong password shows an error, stays on /login and stores no token', async ({ page }) => {
    await uiLogin(page, users.staffA.email, 'definitely-wrong-password');
    await expect(page.getByTestId('login-error')).toContainText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login/);
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session_token') && c.value);
    expect(sessionCookie).toBeFalsy();
  });

  test('unknown email gets the same generic error (no account enumeration)', async ({ page }) => {
    await uiLogin(page, 'nobody-here@deepkhata.test', TEST_PASSWORD);
    await expect(page.getByTestId('login-error')).toContainText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visit to a dashboard page redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
});
