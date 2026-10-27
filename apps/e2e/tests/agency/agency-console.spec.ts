import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, users } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { E2E } from '../../env';

test.use({ storageState: { cookies: [], origins: [] } });

async function adminLogin(page: Page, email: string, password: string) {
  await page.goto(`${E2E.adminUrl}/login`);
  await expect(page.getByTestId('agency-login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('agency-login-email').fill(email);
  await page.getByTestId('agency-login-password').fill(password);
  await page.getByTestId('agency-login-submit').click();
}

test.describe('J: agency admin login', () => {
  test('non-super-admin (ownerA) is rejected', async ({ page }) => {
    await adminLogin(page, users.ownerA.email, TEST_PASSWORD);
    await expect(page.getByTestId('agency-login-error')).toContainText(/super admin|access denied/i);
    await expect(page.getByTestId('tenants-page')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong password is rejected', async ({ page }) => {
    await adminLogin(page, users.superAdmin.email, 'not-the-password');
    await expect(page.getByTestId('agency-login-error')).toContainText(/invalid email or password/i);
    await expect(page.getByTestId('tenants-page')).toHaveCount(0);
  });

  test('anonymous visit to the console redirects to the admin login', async ({ page }) => {
    await page.goto(`${E2E.adminUrl}/`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('super admin logs in and sees the tenants list with the seeded tenants', async ({ page }) => {
    await adminLogin(page, users.superAdmin.email, TEST_PASSWORD);
    await expect(page.getByTestId('tenants-page')).toBeVisible({ timeout: 60_000 });
    const seeded = await db.business.count();
    await expect(page.getByTestId('tenant-row')).toHaveCount(seeded);
    await expect(page.getByTestId('tenant-row').filter({ hasText: 'GM Traders' })).toHaveCount(1);
  });
});

test.describe.serial('J: tenant lifecycle from the console', () => {
  const stamp = Date.now();
  const bizName = `E2E Onboard ${stamp}`;
  const ownerEmail = `onboard-${stamp}@deepkhata.test`;
  const ownerPassword = 'Onboard#Pass1';
  let businessId = '';

  test('onboard a tenant manually: it appears in the list and in the DB; the new owner can log in', async ({ page, request }) => {
    await adminLogin(page, users.superAdmin.email, TEST_PASSWORD);
    await expect(page.getByTestId('tenants-page')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('tenant-onboard').click();
    await page.getByTestId('tenant-onboard-name').fill(bizName);
    await page.getByTestId('tenant-onboard-email').fill(ownerEmail);
    await page.getByTestId('tenant-onboard-password').fill(ownerPassword);
    // MISSING testid: owner name field in the onboard modal (fallback: placeholder).
    await page.getByPlaceholder('John Doe').fill('Onboard Owner');
    await page.getByTestId('tenant-onboard-submit').click();

    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 30_000 });

    const biz = await db.business.findFirstOrThrow({ where: { name: bizName }, include: { branches: true, users: true } });
    businessId = biz.id;
    expect(biz.status).toBe('ACTIVE');
    expect(biz.subscriptionExpiresAt).not.toBeNull();
    expect(biz.branches).toHaveLength(1);
    expect(biz.users.map((u) => u.email)).toEqual([ownerEmail]);
    expect(biz.users[0].role).toBe('OWNER');

    const login = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email: ownerEmail, password: ownerPassword } });
    expect(login.ok()).toBe(true);
  });

  test('add a branch to the tenant: branch row exists in the DB', async ({ page }) => {
    expect(businessId).toBeTruthy();
    await adminLogin(page, users.superAdmin.email, TEST_PASSWORD);
    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.getByTestId('tenant-add-branch').click();
    const branchName = `Branch ${Date.now()}`;
    await page.getByTestId('tenant-branch-name').fill(branchName);
    await page.getByTestId('tenant-branch-submit').click();
    await expect
      .poll(() => db.branch.count({ where: { businessId, name: branchName } }), { timeout: 30_000 })
      .toBe(1);
    expect(await db.branch.count({ where: { businessId } })).toBe(2);
  });

  test('change status to READ_ONLY then back to ACTIVE: DB reflects it', async ({ page }) => {
    expect(businessId).toBeTruthy();
    await adminLogin(page, users.superAdmin.email, TEST_PASSWORD);
    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.getByTestId('tenant-open').click();
    await expect(page.getByTestId('tenant-detail')).toBeVisible();
    await page.getByTestId('tenant-status-select').selectOption('READ_ONLY');
    await expect.poll(async () => (await db.business.findUniqueOrThrow({ where: { id: businessId } })).status).toBe('READ_ONLY');
    await expect(page.getByTestId('tenant-status')).toContainText(/read.?only/i);
    await page.getByTestId('tenant-status-select').selectOption('ACTIVE');
    await expect.poll(async () => (await db.business.findUniqueOrThrow({ where: { id: businessId } })).status).toBe('ACTIVE');
  });

  test('log a payment: subscriptionExpiresAt is extended in the DB and a billing row shows', async ({ page }) => {
    expect(businessId).toBeTruthy();
    const before = await db.business.findUniqueOrThrow({ where: { id: businessId } });
    await adminLogin(page, users.superAdmin.email, TEST_PASSWORD);
    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.getByTestId('tenant-open').click();
    await expect(page.getByTestId('tenant-detail')).toBeVisible();
    await expect(page.getByTestId('tenant-billing-row')).toHaveCount(0);

    const newExpiry = new Date(before.subscriptionExpiresAt!.getTime() + 120 * 24 * 3600 * 1000);
    const isoDay = newExpiry.toISOString().slice(0, 10);
    await page.getByTestId('tenant-payment-amount').fill('15000');
    await page.getByTestId('tenant-payment-date').fill(isoDay);
    await page.getByTestId('tenant-payment-submit').click();

    await expect(page.getByTestId('tenant-billing-row')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('tenant-billing-row')).toContainText('15,000');

    const after = await db.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(after.subscriptionExpiresAt!.toISOString().slice(0, 10)).toBe(isoDay);
    expect(after.subscriptionExpiresAt!.getTime()).toBeGreaterThan(before.subscriptionExpiresAt!.getTime());
    const logs = await db.agencyBillingLog.findMany({ where: { businessId } });
    expect(logs).toHaveLength(1);
    expect(Number(logs[0].amount)).toBe(15000);
    await expect(page.getByTestId('tenant-expiry')).toBeVisible();
  });

  test('a suspended tenant cannot sign in (kill switch)', async ({ page, request }) => {
    expect(businessId).toBeTruthy();
    await adminLogin(page, users.superAdmin.email, TEST_PASSWORD);
    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.getByTestId('tenant-open').click();
    await page.getByTestId('tenant-status-select').selectOption('SUSPENDED');
    await expect.poll(async () => (await db.business.findUniqueOrThrow({ where: { id: businessId } })).status).toBe('SUSPENDED');
    const login = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email: ownerEmail, password: ownerPassword } });
    expect(login.status()).toBe(401);
  });
});
