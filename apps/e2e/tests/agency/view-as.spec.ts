import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E } from '../../env';
import { TEST_PASSWORD, tenants, users } from '../../fixtures/users';
import { storage } from '../../helpers/auth';
import { db } from '../../helpers/db';
import { createThrowawayTenant, type ThrowawayTenant } from '../../helpers/tenant-admin';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * P8: support "view as tenant". The agency console opens a read-only session as the tenant owner in the
 * client app. Tests run serially against ONE throw-away tenant and share one browser context (the view-as
 * cookie is set on localhost, exactly like a support agent using one browser).
 */
test.describe.serial('P8: agency view-as (read-only support session)', () => {
  let tenant: ThrowawayTenant;
  let bizName = '';
  let ctx: BrowserContext;
  let adminPage: Page;
  let viewPage: Page;
  let startedAt: Date;

  async function adminLogin(page: Page) {
    await page.goto(`${E2E.adminUrl}/login`);
    await expect(page.getByTestId('agency-login-email')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('agency-login-email').fill(users.superAdmin.email);
    await page.getByTestId('agency-login-password').fill(TEST_PASSWORD);
    await page.getByTestId('agency-login-submit').click();
    await expect(page.getByTestId('tenants-page')).toBeVisible({ timeout: 60_000 });
  }

  async function ownerLogin(browser: Browser, email: string) {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(`${E2E.webUrl}/login`);
    await expect(p.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
    await p.getByTestId('login-email').fill(email);
    await p.getByTestId('login-password').fill(TEST_PASSWORD);
    await p.getByTestId('login-submit').click();
    await expect(p).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    return { c, p };
  }

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(180_000);
    tenant = await createThrowawayTenant(request, 'viewas');
    bizName = (await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } })).name;
    startedAt = new Date();
    ctx = await browser.newContext();
    adminPage = await ctx.newPage();
    await adminLogin(adminPage);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('super admin clicks View As on the tenant: the tenant app opens with the read-only banner naming the shop', async () => {
    const row = adminPage.getByTestId('tenant-row').filter({ hasText: bizName });
    await expect(row).toHaveCount(1, { timeout: 30_000 });

    const popupPromise = ctx.waitForEvent('page');
    await row.getByTestId('tenant-view-as').click();
    viewPage = await popupPromise;

    await expect(viewPage).toHaveURL(new RegExp(`^${E2E.webUrl}/dashboard`), { timeout: 60_000 });
    const banner = viewPage.getByTestId('view-as-banner');
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner).toContainText(`Viewing as ${bizName} (read-only)`);
    await expect(viewPage.getByTestId('view-as-exit')).toBeVisible();

    // The session is an impersonated one for the tenant owner, minted by the super admin.
    const sessions = await db.session.findMany({ where: { userId: tenant.ownerId, impersonatedBy: { not: null } } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].impersonatedBy).toBe(users.superAdmin.id);
    expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('while viewing, writes are blocked (UI and direct requests, 403 read-only) and reads still work', async () => {
    const customers = () => db.customer.count({ where: { businessId: tenant.businessId } });
    const products = () => db.product.count({ where: { businessId: tenant.businessId } });
    const before = { customers: await customers(), products: await products() };

    // UI write: the New Customer form submits, the API refuses.
    await viewPage.goto(`${E2E.webUrl}/customers`);
    await expect(viewPage.getByTestId('view-as-banner')).toBeVisible({ timeout: 60_000 });
    await viewPage.getByTestId('customers-new').click();
    await expect(viewPage.getByTestId('new-customer-modal')).toBeVisible();
    await viewPage.getByTestId('new-customer-name').fill('ViewAs Blocked Customer');
    await viewPage.getByTestId('new-customer-phone').fill('03001112233');
    const blocked = viewPage.waitForResponse(
      (r) => r.url().includes('/customer/newcustomer') && r.request().method() === 'POST',
    );
    await viewPage.getByTestId('new-customer-submit').click();
    const res = await blocked;
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toBe('Read-only while viewing as tenant');
    // The modal stays open with the server's message (MISSING testid: new-customer-error).
    await expect(viewPage.getByTestId('new-customer-modal')).toContainText('Read-only while viewing as tenant');

    // Direct requests with the browser's session cookie.
    const api = E2E.apiUrl;
    const post = await viewPage.request.post(`${api}/customer/newcustomer`, {
      data: { name: 'ViewAs Direct Customer', phone: '03004445566' },
    });
    expect(post.status()).toBe(403);
    expect((await post.json()).message).toBe('Read-only while viewing as tenant');

    const addProduct = await viewPage.request.post(`${api}/product/addproduct`, {
      data: { name: 'ViewAs Product', sku: 'VIEWAS-1', price: 100, category: 'Screens', quantity: 1, branchId: tenant.branchId },
      headers: { 'x-branch-id': tenant.branchId },
    });
    expect(addProduct.status()).toBe(403);

    const patch = await viewPage.request.patch(`${api}/agency/tenants/${tenant.businessId}/status`, {
      data: { status: 'SUSPENDED' },
    });
    expect([401, 403]).toContain(patch.status());
    const put = await viewPage.request.put(`${api}/settings/business`, { data: { name: 'Hacked Name' } });
    expect(put.status()).toBe(403);
    const del = await viewPage.request.delete(`${api}/category/${tenant.businessId}`);
    expect(del.status()).toBe(403);

    // Same through in-page fetch (credentials: include), as app code would do.
    const inPage = await viewPage.evaluate(async (base) => {
      const r = await fetch(`${base}/customer/newcustomer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ViewAs Fetch Customer', phone: '03007778899' }),
      });
      return { status: r.status, body: await r.json() };
    }, api);
    expect(inPage.status).toBe(403);
    expect(inPage.body.message).toBe('Read-only while viewing as tenant');

    // Reads work.
    const me = await viewPage.request.get(`${api}/user/me`);
    expect(me.status()).toBe(200);
    const info = await viewPage.request.get(`${api}/auth/session-info`);
    expect(info.status()).toBe(200);
    const infoBody = await info.json();
    expect(infoBody.impersonated).toBe(true);
    expect(infoBody.businessName).toBe(bizName);

    // Nothing was written.
    expect(await customers()).toBe(before.customers);
    expect(await products()).toBe(before.products);
    expect(
      await db.customer.count({ where: { businessId: tenant.businessId, name: { startsWith: 'ViewAs ' } } }),
    ).toBe(0);
    expect(await db.product.count({ where: { businessId: tenant.businessId, sku: 'VIEWAS-1' } })).toBe(0);
    const biz = await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } });
    expect(biz.status).toBe('ACTIVE');
    expect(biz.name).toBe(bizName);
  });

  test('the visit is recorded in AdminAccessLog (DB) and a different tenant owner cannot see it', async ({ browser }) => {
    const rows = await db.adminAccessLog.findMany({
      where: { businessId: tenant.businessId, action: 'VIEW_AS' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe(users.superAdmin.id);
    expect(rows[0].method).toBe('POST');
    expect(rows[0].route).toBe(`/agency/tenants/${tenant.businessId}/view-as`);
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(startedAt.getTime() - 1000);
    expect(rows[0].createdAt.getTime()).toBeLessThanOrEqual(Date.now());

    // Tenant B's owner (stored session) must not see this tenant's rows.
    const other = await browser.newContext({ storageState: storage('ownerB') });
    try {
      const res = await other.request.get(`${E2E.apiUrl}/settings/access-log?limit=50`);
      expect(res.status()).toBe(200);
      const list = (await res.json()) as { route: string; action: string }[];
      expect(list.filter((r) => r.route.includes(tenant.businessId))).toEqual([]);
      const expectedForB = await db.adminAccessLog.count({ where: { businessId: tenants.B.id } });
      expect(list).toHaveLength(Math.min(expectedForB, 50));
    } finally {
      await other.close();
    }
  });

  test('Exit ends the view-as session: the banner is gone and the impersonated session is deleted', async () => {
    test.setTimeout(120_000);
    const live = () =>
      db.session.count({ where: { userId: tenant.ownerId, impersonatedBy: users.superAdmin.id } });
    expect(await live()).toBe(1);

    await viewPage.goto(`${E2E.webUrl}/dashboard`);
    await expect(viewPage.getByTestId('view-as-banner')).toBeVisible({ timeout: 60_000 });
    await viewPage.getByTestId('view-as-exit').click();

    // The app calls window.close() (script-opened tab) and otherwise lands on /login.
    await expect
      .poll(() => viewPage.isClosed() || /\/login/.test(viewPage.url()), { timeout: 30_000 })
      .toBe(true);
    await expect.poll(live, { timeout: 15_000 }).toBe(0);
    if (!viewPage.isClosed()) {
      await expect(viewPage.getByTestId('view-as-banner')).toHaveCount(0);
    }

    // A fresh tab no longer carries the tenant view-as banner.
    const fresh = await ctx.newPage();
    await fresh.goto(`${E2E.webUrl}/dashboard`);
    await expect(fresh.getByTestId('view-as-banner')).toHaveCount(0);
    await fresh.close();

  });

  test('the tenant owner sees the visit in Settings > access log (admin not named, timestamp shown)', async ({ browser }) => {
    test.setTimeout(120_000);
    const rows = await db.adminAccessLog.findMany({
      where: { businessId: tenant.businessId, action: 'VIEW_AS' },
    });
    expect(rows).toHaveLength(1);
    const owner = await ownerLogin(browser, tenant.ownerEmail);
    try {
      await owner.p.goto(`${E2E.webUrl}/settings`);
      await owner.p.getByTestId('settings-tab-access-log').click();
      await expect(owner.p.getByTestId('access-log-tab')).toBeVisible();
      const entry = owner.p.getByTestId('access-log-row').filter({ hasText: 'VIEW_AS' });
      await expect(entry).toHaveCount(1, { timeout: 30_000 });
      // Who: generic support label, the admin is never named.
      await expect(entry).toContainText(/Support \(.+\)/);
      await expect(entry).not.toContainText(users.superAdmin.email);
      await expect(entry).not.toContainText(users.superAdmin.name);
      await expect(entry).toContainText(`/agency/tenants/${tenant.businessId}/view-as`);
      // When: the timestamp the UI renders is the DB row's timestamp.
      const when = await owner.p.evaluate((iso) => new Date(iso).toLocaleString(), rows[0].createdAt.toISOString());
      expect(when).not.toBe('Invalid Date');
      await expect(entry.locator('td').first()).toHaveText(when);
    } finally {
      await owner.c.close();
    }

  });

  test('after Exit the agent is back in the agency identity (console still signed in as the super admin)', async () => {
    await adminPage.reload();
    await expect(adminPage.getByTestId('tenants-page')).toBeVisible({ timeout: 20_000 });
  });
});
