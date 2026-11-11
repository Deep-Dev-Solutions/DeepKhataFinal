import { test, expect, type Page } from '@playwright/test';
import { E2E } from '../../env';
import { TEST_PASSWORD, users } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { createThrowawayTenant, type ThrowawayTenant } from '../../helpers/tenant-admin';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Plan presets: the agency console owns the named plans, a tenant's plan can be edited instead of
 * re-typed from scratch, and a logged payment moves the shop onto the plan that was bought.
 */
test.describe.serial('agency plan presets and plan-changing payments', () => {
  let tenant: ThrowawayTenant;
  let bizName = '';
  let page: Page;

  async function adminLogin(p: Page) {
    await p.goto(`${E2E.adminUrl}/login`);
    await expect(p.getByTestId('agency-login-email')).toBeVisible({ timeout: 60_000 });
    await p.getByTestId('agency-login-email').fill(users.superAdmin.email);
    await p.getByTestId('agency-login-password').fill(TEST_PASSWORD);
    await p.getByTestId('agency-login-submit').click();
    await expect(p.getByTestId('tenants-page')).toBeVisible({ timeout: 60_000 });
  }

  /** Selects the option whose visible label contains `label` and returns its value. */
  async function selectByLabel(p: Page, testId: string, label: string) {
    const select = p.getByTestId(testId);
    const value = await select
      .locator('option', { hasText: label })
      .first()
      .getAttribute('value');
    expect(value, `option "${label}" in ${testId}`).toBeTruthy();
    await select.selectOption(value as string);
    return value as string;
  }

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(180_000);
    tenant = await createThrowawayTenant(request, 'plans');
    bizName = (await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } })).name;
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await adminLogin(page);
  });

  test('the console lists the seeded plan presets with their prices', async () => {
    await page.getByTestId('nav-plans').click();
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 30_000 });

    const basic = page.locator('[data-plan-code="BASIC"]');
    await expect(basic).toHaveCount(1, { timeout: 30_000 });
    await expect(basic).toContainText('Basic');
    await expect(basic).toContainText('Rs 3000');

    const standard = page.locator('[data-plan-code="STANDARD"]');
    await expect(standard).toHaveCount(1);
    await expect(standard).toContainText('Rs 7000');
  });

  test('a preset can be renamed and re-priced from the console', async () => {
    const standard = page.locator('[data-plan-code="STANDARD"]');
    await standard.getByTestId('plan-edit').click();

    await expect(page.getByTestId('plan-name')).toHaveValue('Standard');
    await page.getByTestId('plan-name').fill('Standard Plus');
    await page.getByTestId('plan-price-monthly').fill('7500');
    await page.getByTestId('plan-save').click();

    await expect(page.locator('[data-plan-code="STANDARD"]')).toContainText('Standard Plus', {
      timeout: 30_000,
    });
    await expect(page.locator('[data-plan-code="STANDARD"]')).toContainText('Rs 7500');

    const row = await db.plan.findUniqueOrThrow({ where: { code: 'STANDARD' } });
    expect(row.name).toBe('Standard Plus');
    expect(row.priceMonthly?.toString()).toBe('7500');
  });

  test('the tenant plan editor is prefilled with the plan the shop is on', async () => {
    await page.getByTestId('nav-tenants').click();
    const row = page.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await row.getByTestId('tenant-open').click();

    await expect(page.getByTestId('tenant-plan-current')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tenant-plan-current')).toContainText('Free Trial');
    await expect(page.getByTestId('deal-plan')).toHaveValue('TRIAL');
    await expect(page.getByTestId('deal-start')).not.toHaveValue('');
    await expect(page.getByTestId('deal-end')).not.toHaveValue('');
  });

  test('setting the deal is what changes the plan and the amount due', async () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    await page.getByTestId('deal-start').fill(today.toISOString().slice(0, 10));
    await page.getByTestId('deal-end').fill(nextYear.toISOString().slice(0, 10));

    await selectByLabel(page, 'deal-plan', 'Basic');
    await selectByLabel(page, 'deal-cycle', 'Yearly');
    await expect(page.getByTestId('deal-price')).toHaveValue('30000');

    await page.getByTestId('deal-submit').click();
    await expect(page.getByTestId('deal-success')).toBeVisible({ timeout: 30_000 });

    // The deal owns plan, price and period (D2).
    await expect(page.getByTestId('tenant-plan-current')).toContainText('Basic', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('billing-due')).toContainText('30,000', { timeout: 30_000 });

    const sub = await db.subscription.findUniqueOrThrow({
      where: { businessId: tenant.businessId },
      include: { plan: true },
    });
    expect(sub.plan.code).toBe('BASIC');
    expect(sub.billingCycle).toBe('YEARLY');
    expect(sub.trialEndsAt).toBeNull();
  });

  test('recording payments fills paid and balance without touching the plan', async () => {
    const before = await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } });
    const timelineRows = page.getByTestId('billing-timeline-row');
    const beforeRows = await timelineRows.count();

    const receivedDay = new Date().toISOString().slice(0, 10);
    const payments = [
      { amount: '10000', method: 'CASH' },
      { amount: '5000', method: 'BANK' },
    ];

    for (const [index, payment] of payments.entries()) {
      await page.getByTestId('tenant-payment-amount').fill(payment.amount);
      await page.getByTestId('tenant-payment-date').fill(receivedDay);
      await page.getByTestId('tenant-payment-method').selectOption(payment.method);
      await page.getByTestId('tenant-payment-submit').click();
      await expect(timelineRows).toHaveCount(beforeRows + index + 1, { timeout: 30_000 });
    }

    await expect(page.getByTestId('billing-paid')).toContainText('15,000');
    await expect(page.getByTestId('billing-balance')).toContainText('15,000');

    // One merged timeline holding both payments and the deal they were paid against.
    // (Order is asserted in the API spec: a deal's changedAt is now, while a payment
    // typed into a date input lands at midnight, so card order alone is not a contract.)
    await expect(page.locator('[data-testid="billing-timeline-row"][data-type="payment"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="billing-timeline-row"][data-type="deal"]')).toHaveCount(1);

    // Cash received never rewrites the contract.
    const after = await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } });
    expect(after.subscriptionExpiresAt?.toISOString()).toBe(
      before.subscriptionExpiresAt?.toISOString(),
    );
    const sub = await db.subscription.findUniqueOrThrow({
      where: { businessId: tenant.businessId },
      include: { plan: true },
    });
    expect(sub.plan.code).toBe('BASIC');
    expect(sub.billingCycle).toBe('YEARLY');
  });

  test('the shop itself reports the plan set by the deal', async ({ browser }) => {
    const ctx = await browser.newContext();
    const shop = await ctx.newPage();
    await shop.goto(`${E2E.webUrl}/login`);
    await expect(shop.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
    await shop.getByTestId('login-email').fill(tenant.ownerEmail);
    await shop.getByTestId('login-password').fill(TEST_PASSWORD);
    await shop.getByTestId('login-submit').click();
    await expect(shop).toHaveURL(/\/dashboard$/, { timeout: 60_000 });

    const res = await shop.request.get(`${E2E.apiUrl}/plans/usage`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan.code).toBe('BASIC');
    expect(body.plan.name).toBe('Basic');
    await ctx.close();
  });
});
