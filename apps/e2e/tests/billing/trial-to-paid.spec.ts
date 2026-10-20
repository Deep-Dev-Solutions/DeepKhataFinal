import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { TEST_PASSWORD, users } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { apiWithToken, createThrowawayTenant, loginApi, type ThrowawayTenant } from '../../helpers/tenant-admin';
import { E2E } from '../../env';

test.use({ storageState: { cookies: [], origins: [] } });

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const DAY_MS = 86_400_000;
const INVOICE_AMOUNT = '3000';

async function uiLogin(page: Page, email: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(TEST_PASSWORD);
  await page.getByTestId('login-submit').click();
}

async function adminLogin(page: Page) {
  await page.goto(`${E2E.adminUrl}/login`);
  await expect(page.getByTestId('agency-login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('agency-login-email').fill(users.superAdmin.email);
  await page.getByTestId('agency-login-password').fill(TEST_PASSWORD);
  await page.getByTestId('agency-login-submit').click();
  // Wait for the session to be established before navigating anywhere else.
  await expect(page.getByTestId('tenants-page')).toBeVisible({ timeout: 60_000 });
}

/** Polls Mailpit until a mail to `to` has a subject matching `subject`. */
async function waitForSubject(request: APIRequestContext, to: string, subject: RegExp) {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${to}` } });
        if (!res.ok()) return false;
        const body = (await res.json()) as { messages: { Subject: string }[] };
        return (body.messages ?? []).some((m) => subject.test(m.Subject));
      },
      { message: `no mail to ${to} with subject ${subject}`, timeout: 20_000 },
    )
    .toBe(true);
}

test.describe.serial('P7: trial expiry -> read-only -> invoice -> payment -> active again', () => {
  // Cold Next dev compiles of the agency console and public invoice pages can exceed the 30 s default.
  test.describe.configure({ timeout: 120_000 });
  let tenant: ThrowawayTenant;
  let ownerToken = '';
  let invoiceId = '';
  let invoiceNumber = '';
  let publicToken = '';
  let trialEndsAtBefore: Date;

  async function owner(request: APIRequestContext) {
    if (!ownerToken) {
      const res = await loginApi(request, tenant.ownerEmail);
      expect(res.ok(), `owner login failed: ${res.status()}`).toBeTruthy();
      ownerToken = (await res.json()).accessToken as string;
    }
    return apiWithToken(request, ownerToken);
  }

  test('setup: a fresh tenant is on a running trial, then the clock is moved past the trial end', async ({ request }) => {
    tenant = await createThrowawayTenant(request, 'trial2paid');

    // Precondition: a live 30 day trial. No authenticated tenant request has happened yet, so the
    // server's 60 s tenant cache holds nothing for this business and will read the moved dates.
    const sub = await db.subscription.findUniqueOrThrow({ where: { businessId: tenant.businessId }, include: { plan: true } });
    expect(sub.plan.code).toBe('TRIAL');
    expect(sub.status).toBe('TRIALING');
    expect(sub.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 20 * DAY_MS);

    // Time travel the data (server time cannot be mocked): trial started 31 days ago, ended yesterday.
    // Business.subscriptionExpiresAt is the mirror the client banner reads.
    const ended = new Date(Date.now() - DAY_MS);
    trialEndsAtBefore = ended;
    await db.subscription.update({
      where: { businessId: tenant.businessId },
      data: { currentPeriodStart: new Date(Date.now() - 31 * DAY_MS), trialEndsAt: ended, currentPeriodEnd: ended },
    });
    await db.business.update({ where: { id: tenant.businessId }, data: { subscriptionExpiresAt: ended } });
  });

  test('expired trial: reads still work, writes are refused with the read-only error and change nothing', async ({ request }) => {
    const api = await owner(request);

    expect((await api.get('/customer/getallcustomers')).status()).toBe(200);
    expect((await api.get('/product/getproducts', undefined, tenant.branchId)).status()).toBe(200);
    const me = await api.get('/user/me');
    expect(me.status()).toBe(200);

    const customer = await api.post('/customer/newcustomer', { name: 'Blocked Cust', phone: '03001110000' });
    expect(customer.status()).toBe(403);
    expect(await customer.text()).toContain('read-only');
    const category = await api.post('/category', { name: 'Blocked Cat' }, tenant.branchId);
    expect(category.status()).toBe(403);
    const product = await api.post(
      '/product/addproduct',
      { name: 'Blocked', sku: `BLK-${Date.now()}`, price: 10, category: 'Blocked Cat', quantity: 1, branchId: tenant.branchId },
      tenant.branchId,
    );
    expect(product.status()).toBe(403);

    expect(await db.customer.count({ where: { businessId: tenant.businessId } })).toBe(0);
    expect(await db.product.count({ where: { businessId: tenant.businessId } })).toBe(0);
  });

  test('UI: the owner sees the expired banner and cannot invite', async ({ page }) => {
    await uiLogin(page, tenant.ownerEmail);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await expect(page.getByTestId('subscription-banner')).toBeVisible();
    await expect(page.getByTestId('subscription-banner-message')).toContainText('read-only mode');
    await page.goto('/settings?tab=team');
    await expect(page.getByTestId('team-invite-open')).toBeDisabled();
  });

  test('agency generates an invoice from the console; a draft is not public, sending emails it and makes the public page render', async ({ page, request }) => {
    await adminLogin(page);
    await page.goto(`${E2E.adminUrl}/billing`);
    await expect(page.getByTestId('billing-page')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('invoice-create-open').click();
    await expect(page.getByTestId('invoice-form')).toBeVisible();
    await page.getByTestId('invoice-business').selectOption(tenant.businessId);
    await page.getByTestId('invoice-cycle').selectOption('MONTHLY');
    await page.getByTestId('invoice-periods').fill('1');
    await page.getByTestId('invoice-line-description').fill('E2E trial conversion - first month');
    await page.getByTestId('invoice-line-quantity').fill('1');
    await page.getByTestId('invoice-line-price').fill(INVOICE_AMOUNT);
    await page.getByTestId('invoice-submit').click();
    await expect(page.getByTestId('invoice-detail')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('invoice-status')).toHaveText('DRAFT');

    const inv = await db.agencyInvoice.findFirstOrThrow({ where: { businessId: tenant.businessId } });
    invoiceId = inv.id;
    invoiceNumber = inv.number;
    publicToken = inv.publicToken;
    expect(inv.status).toBe('DRAFT');
    expect(Number(inv.total)).toBe(Number(INVOICE_AMOUNT));
    expect(inv.number).toMatch(/^DK-\d{4}-\d{4}$/);

    // Draft is not issued: its token resolves to nothing.
    expect((await request.get(`${E2E.apiUrl}/public/invoices/${publicToken}`)).status()).toBe(404);

    await page.getByTestId('invoice-send').click();
    await expect(page.getByTestId('invoice-status')).toHaveText('SENT', { timeout: 30_000 });
    const sent = await db.agencyInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(sent.status).toBe('SENT');
    expect(sent.sentAt).not.toBeNull();
    await waitForSubject(request, tenant.ownerEmail, new RegExp(`Invoice ${invoiceNumber}\\b`));
  });

  test('the public invoice page renders without login and shows number, amount and unpaid status', async ({ browser }) => {
    const ctx = await browser.newContext(); // no cookies, no storage
    const page = await ctx.newPage();
    await page.goto(`/i/${publicToken}`);
    await expect(page.getByTestId('invoice-public')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('invoice-public-number')).toHaveText(invoiceNumber);
    await expect(page.getByTestId('invoice-public-total')).toContainText('3,000');
    await expect(page.getByTestId('invoice-public-status')).toHaveText(/sent/i);
    await expect(page.getByTestId('invoice-public-pay')).toBeVisible();

    await page.goto('/i/' + 'x'.repeat(43));
    await expect(page.getByTestId('invoice-public-missing')).toBeVisible();
    await ctx.close();
  });

  test('super admin records the payment: invoice PAID, subscription extended and ACTIVE, the tenant can write again', async ({ page, request }) => {
    // Owner session open on the tenant side before the payment, still read-only.
    const ownerCtx = await page.context().browser()!.newContext();
    const ownerPage = await ownerCtx.newPage();
    await uiLogin(ownerPage, tenant.ownerEmail);
    await expect(ownerPage).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await expect(ownerPage.getByTestId('subscription-banner')).toBeVisible();

    const before = Date.now();
    await adminLogin(page);
    await page.goto(`${E2E.adminUrl}/billing/${invoiceId}`);
    await expect(page.getByTestId('invoice-detail')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('invoice-status')).toHaveText('SENT');
    await page.getByTestId('payment-amount').fill(INVOICE_AMOUNT);
    await page.getByTestId('payment-method').selectOption('BANK_TRANSFER');
    await page.getByTestId('payment-reference').fill(`E2E-TXN-${Date.now()}`);
    await page.getByTestId('payment-submit').click();
    await expect(page.getByTestId('invoice-status')).toHaveText('PAID', { timeout: 30_000 });
    await expect(page.getByTestId('payment-row')).toHaveCount(1);

    // Invoice and payment rows.
    const inv = await db.agencyInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.status).toBe('PAID');
    expect(inv.paidAt).not.toBeNull();
    const payments = await db.agencyPayment.findMany({ where: { invoiceId } });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(Number(inv.total));
    expect(payments[0].businessId).toBe(tenant.businessId);
    expect(payments[0].method).toBe('BANK_TRANSFER');
    const paidSum = payments.reduce((s, p) => s + Number(p.amount), 0);
    expect(paidSum).toBe(Number(INVOICE_AMOUNT));

    // Subscription extended by one month from now, ACTIVE, grace cleared; mirrors on Business agree.
    const sub = await db.subscription.findUniqueOrThrow({ where: { businessId: tenant.businessId } });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.graceEndsAt).toBeNull();
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(before + 27 * DAY_MS);
    expect(sub.currentPeriodEnd!.getTime()).toBeLessThan(before + 32 * DAY_MS);
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(trialEndsAtBefore.getTime());
    const biz = await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } });
    expect(biz.status).toBe('ACTIVE');
    expect(biz.subscriptionExpiresAt!.getTime()).toBe(sub.currentPeriodEnd!.getTime());

    // Agency billing rows touch no tenant ledger: there are no tenant transactions for this business.
    expect(await db.transaction.count({ where: { businessId: tenant.businessId } })).toBe(0);
    expect(await db.agencyInvoice.count({ where: { businessId: tenant.businessId, status: { not: 'PAID' } } })).toBe(0);
    await waitForSubject(request, tenant.ownerEmail, new RegExp(`Payment received for invoice ${invoiceNumber}`));

    // Tenant can write again with the SAME token (cache was invalidated by the payment).
    const api = await owner(request);
    const created = await api.post('/customer/newcustomer', { name: 'Back In Business', phone: '03005550000' });
    expect(created.ok(), `${created.status()} ${await created.text()}`).toBeTruthy();
    expect(await db.customer.count({ where: { businessId: tenant.businessId, name: 'Back In Business' } })).toBe(1);

    // UI: banner is gone after a reload and the invite button is enabled.
    await ownerPage.reload();
    await expect(ownerPage.getByTestId('nav-orders')).toBeVisible({ timeout: 60_000 });
    await expect(ownerPage.getByTestId('subscription-banner')).toHaveCount(0);
    await ownerPage.goto('/settings?tab=team');
    await expect(ownerPage.getByTestId('team-invite-open')).toBeEnabled();
    await ownerCtx.close();

    // Public page now shows PAID and no pay prompt.
    await page.goto(`/i/${publicToken}`);
    await expect(page.getByTestId('invoice-public-status')).toHaveText(/paid/i);
    await expect(page.getByTestId('invoice-public-pay')).toHaveCount(0);

    // A paid invoice takes no second payment.
    const again = await request.post(`${E2E.apiUrl}/agency/billing/invoices/${invoiceId}/payments`, {
      headers: { Authorization: `Bearer ${await superToken(request)}` },
      data: { amount: INVOICE_AMOUNT, method: 'BANK_TRANSFER' },
    });
    expect(again.status()).toBe(400);
    expect(await db.agencyPayment.count({ where: { invoiceId } })).toBe(1);
  });
});

async function superToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${E2E.apiUrl}/auth/login`, {
    data: { email: users.superAdmin.email, password: TEST_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken as string;
}
