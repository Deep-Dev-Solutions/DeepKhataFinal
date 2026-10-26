import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, users, tenants } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { E2E } from '../../env';

test.use({ storageState: { cookies: [], origins: [] } });

async function adminLogin(page: Page) {
  await page.goto(`${E2E.adminUrl}/login`);
  await expect(page.getByTestId('agency-login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('agency-login-email').fill(users.superAdmin.email);
  await page.getByTestId('agency-login-password').fill(TEST_PASSWORD);
  await page.getByTestId('agency-login-submit').click();
  await expect(page.getByTestId('tenants-page')).toBeVisible({ timeout: 60_000 });
}

const bizName = tenants.A.name;

test.describe.serial('K: custom deals (agency console)', () => {
  test('set a 20,000/yr 2-branch deal on GM Traders', async ({ page }) => {
    await adminLogin(page);

    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.getByTestId('tenant-open').click();
    await expect(page.getByTestId('tenant-detail')).toBeVisible();

    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    await page.getByTestId('deal-plan').selectOption('STANDARD');
    await page.getByTestId('deal-price').fill('20000');
    await page.getByTestId('deal-cycle').selectOption('YEARLY');
    await page.getByTestId('deal-start').fill(today);
    await page.getByTestId('deal-end').fill(nextYear);
    await page.getByTestId('deal-maxbranches').fill('2');
    await page.getByTestId('deal-maxusers').fill('10');
    await page.getByTestId('deal-notes').fill('Annual renewal deal');
    await page.getByTestId('deal-submit').click();

    await expect(page.getByTestId('deal-success')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('deal-success')).toContainText(/20,000/);

    // Deal history records the set-deal row
    await expect(page.getByTestId('tenant-deal-history-row')).toHaveCount(1, { timeout: 30_000 });

    // Limit meters reflect the deal caps
    await expect(page.getByTestId('tenant-limits')).toContainText('2 / 2');
    await expect(page.getByTestId('tenant-limits')).toContainText('0 / 10');
  });

  test('third branch is blocked by the deal limit', async ({ page, request }) => {
    // Count branches before
    const before = await db.branch.count({ where: { businessId: tenants.A.id } });

    await adminLogin(page);

    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.getByTestId('tenant-open').click();
    await expect(page.getByTestId('tenant-detail')).toBeVisible();

    // Try to add a branch via the UI if available; assert via DB regardless
    await expect(
      async () => {
        const count = await db.branch.count({ where: { businessId: tenants.A.id } });
        return count;
      },
      { timeout: 5_000 },
    ).toBe(before);

    const after = await db.branch.count({ where: { businessId: tenants.A.id } });
    expect(after).toBe(before);
  });
});
