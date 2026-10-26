import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, users, tenants } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { apiWithToken, loginApi } from '../../helpers/tenant-admin';
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

    // Limit meters reflect the deal caps: used counts come from the same rule
    // the server's PlanLimitsService.getUsage applies (active members + live invites).
    const now = new Date();
    const [branches, members, invites] = await Promise.all([
      db.branch.count({ where: { businessId: tenants.A.id, deletedAt: null } }),
      db.user.count({ where: { businessId: tenants.A.id, deactivatedAt: null } }),
      db.invitation.count({
        where: {
          businessId: tenants.A.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);
    await expect(page.getByTestId('tenant-limits')).toContainText(`${branches} / 2`);
    await expect(page.getByTestId('tenant-limits')).toContainText(`${members + invites} / 10`);
  });

  test('third branch is blocked by the deal limit', async ({ request }) => {
    // Test 1 capped this tenant at 2 branches; the seed gives it exactly 2.
    const before = await db.branch.count({ where: { businessId: tenants.A.id } });
    expect(before).toBe(2);

    const login = await loginApi(request, users.ownerA.email);
    expect(login.ok(), `owner login failed: ${login.status()}`).toBeTruthy();
    const ownerToken = (await login.json()).accessToken as string;
    const ownerApi = await apiWithToken(request, ownerToken);

    // The real attempt: a third branch must be refused by the deal cap.
    const res = await ownerApi.post('/settings/branch', {
      name: 'Third Branch (deal cap)',
    });
    const bodyText = await res.text();
    expect(res.status(), bodyText).toBe(403);
    expect(JSON.parse(bodyText).code).toBe('PLAN_LIMIT_REACHED');

    const after = await db.branch.count({ where: { businessId: tenants.A.id } });
    expect(after).toBe(before);
  });
});
