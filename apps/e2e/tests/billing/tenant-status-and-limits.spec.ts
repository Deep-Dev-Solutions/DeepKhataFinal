import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { TEST_PASSWORD } from '../../fixtures/users';
import { db } from '../../helpers/db';
import {
  apiWithToken,
  createThrowawayTenant,
  loginApi,
  setBusinessStatus,
  type ThrowawayTenant,
} from '../../helpers/tenant-admin';

test.use({ storageState: { cookies: [], origins: [] } });

async function uiLogin(page: Page, email: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(TEST_PASSWORD);
  await page.getByTestId('login-submit').click();
}

async function ownerApi(request: APIRequestContext, t: ThrowawayTenant) {
  const res = await loginApi(request, t.ownerEmail);
  expect(res.ok(), `owner login failed: ${res.status()}`).toBeTruthy();
  const { accessToken } = await res.json();
  return { accessToken: accessToken as string, api: await apiWithToken(request, accessToken) };
}

/** Product with one unit in the throw-away tenant's default branch (created while ACTIVE). */
async function seedProduct(request: APIRequestContext, t: ThrowawayTenant, label: string, qty = 2) {
  const { api } = await ownerApi(request, t);
  const sku = `E2E-${label}-${Date.now().toString(36)}`;
  // A fresh tenant has no categories; create the one the product refers to.
  const cat = await api.post('/category', { name: 'Screens' }, t.branchId);
  expect(cat.ok() || cat.status() === 409, `category: ${cat.status()}`).toBeTruthy();
  const res = await api.post(
    '/product/addproduct',
    { name: `Part ${sku}`, sku, price: 1000, category: 'Screens', quantity: qty, branchId: t.branchId, defaultCostPrice: 500 },
    t.branchId,
  );
  expect(res.ok(), `addproduct failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return { id: body.product.id as string, sku, name: `Part ${sku}` };
}

test.describe('H: READ_ONLY tenant', () => {
  let tenant: ThrowawayTenant;
  test.beforeAll(async ({ request }) => {
    tenant = await createThrowawayTenant(request, 'ro');
  });

  test('reads still work, every write is rejected with 403 and changes nothing', async ({ request }) => {
    const product = await seedProduct(request, tenant, 'ro');
    const { api } = await ownerApi(request, tenant);
    await setBusinessStatus(request, tenant.businessId, 'READ_ONLY');
    try {
      // Reads are allowed.
      const products = await api.get('/product/getproducts', undefined, tenant.branchId);
      expect(products.status()).toBe(200);
      expect(JSON.stringify(await products.json())).toContain(product.sku);
      expect((await api.get('/customer/getallcustomers')).status()).toBe(200);

      // Writes: sale, product, customer, branch, invite.
      const ordersBefore = await db.order.count({ where: { businessId: tenant.businessId } });
      const sale = await api.post(
        '/order/neworder',
        { items: [{ productId: product.id, quantity: 1, price: 1000 }], amountPaid: 1000, orderStatus: 'FINAL', paymentMethod: 'CASH', branchId: tenant.branchId },
        tenant.branchId,
      );
      expect(sale.status()).toBe(403);
      expect(await sale.text()).toContain('read-only');
      expect(await db.order.count({ where: { businessId: tenant.businessId } })).toBe(ordersBefore);
      expect(await db.productInstance.count({ where: { productId: product.id, status: 'SOLD' } })).toBe(0);

      const addProduct = await api.post(
        '/product/addproduct',
        { name: 'Blocked', sku: `BLK-${Date.now()}`, price: 10, category: 'Screens', quantity: 1, branchId: tenant.branchId },
        tenant.branchId,
      );
      expect(addProduct.status()).toBe(403);
      expect(await db.product.count({ where: { businessId: tenant.businessId, name: 'Blocked' } })).toBe(0);

      const customer = await api.post('/customer/newcustomer', { name: 'Blocked Cust', phone: '03001112222' });
      expect(customer.status()).toBe(403);
      expect(await db.customer.count({ where: { businessId: tenant.businessId } })).toBe(0);

      const branch = await api.post('/settings/branch', { name: 'Blocked Branch' });
      expect(branch.status()).toBe(403);
      const invite = await api.post('/team/invite', { email: `blocked-${Date.now()}@deepkhata.test`, role: 'STAFF' });
      expect(invite.status()).toBe(403);
      expect(await db.invitation.count({ where: { businessId: tenant.businessId } })).toBe(0);

      // The offline sync endpoint is a write too and must not bypass the lock.
      const sync = await api.post('/sync/batch', {
        items: [
          {
            id: '00000000-0000-4000-8000-0000000000aa',
            type: 'CREATE_ORDER',
            payload: { items: [{ productId: product.id, quantity: 1, price: 1000 }], amountPaid: 1000, paymentMethod: 'CASH', orderStatus: 'FINAL', branchId: tenant.branchId },
          },
        ],
      }, tenant.branchId);
      expect(sync.status()).toBe(403);
      expect(await db.order.count({ where: { businessId: tenant.businessId } })).toBe(ordersBefore);
    } finally {
      await setBusinessStatus(request, tenant.businessId, 'ACTIVE');
    }
  });

  test('UI: banner is shown, the POS lets the owner build a cart but checkout is locked', async ({ page, request }) => {
    const product = await seedProduct(request, tenant, 'roui');
    await setBusinessStatus(request, tenant.businessId, 'READ_ONLY');
    try {
      await page.context().addInitScript(
        ([k, v]) => window.localStorage.setItem(k, v),
        [`activeBranch_${tenant.businessId}`, tenant.branchId],
      );
      await uiLogin(page, tenant.ownerEmail);
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByTestId('subscription-banner')).toBeVisible();
      await expect(page.getByTestId('subscription-banner-message')).toContainText('read-only mode');

      await page.goto('/orders/new');
      await expect(page.getByTestId('subscription-banner')).toBeVisible();
      await page.getByTestId('pos-search').fill(product.sku);
      const row = page.getByTestId('pos-result-row').filter({ hasText: product.name });
      await expect(row).toHaveCount(1);
      await row.getByTestId('pos-add-item').click();
      await expect(page.getByTestId('pos-cart-row')).toHaveCount(1);
      const checkout = page.getByTestId('pos-checkout');
      if (await checkout.isEnabled()) {
        await checkout.click();
        await expect(page.getByTestId('checkout-submit')).toBeDisabled();
      }
      expect(await db.order.count({ where: { businessId: tenant.businessId } })).toBe(0);
    } finally {
      await setBusinessStatus(request, tenant.businessId, 'ACTIVE');
    }
  });

  test('UI: a sale forced through the API-backed checkout is refused with an error toast (server lock, not only a disabled button)', async ({ page, request }) => {
    const product = await seedProduct(request, tenant, 'rotoast');
    await page.context().addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [`activeBranch_${tenant.businessId}`, tenant.branchId],
    );
    // Log in and fill the cart while ACTIVE, then lock the tenant under the open page.
    await uiLogin(page, tenant.ownerEmail);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await page.goto('/orders/new');
    await page.getByTestId('pos-search').fill(product.sku);
    const row = page.getByTestId('pos-result-row').filter({ hasText: product.name });
    await expect(row).toHaveCount(1);
    await row.getByTestId('pos-add-item').click();
    await expect(page.getByTestId('pos-cart-row')).toHaveCount(1);
    await page.getByTestId('pos-checkout').click();
    await expect(page.getByTestId('checkout-drawer')).toBeVisible();
    await page.getByTestId('pos-customer-mode-walkin').click();
    await page.getByTestId('checkout-amount').fill('1000');

    await setBusinessStatus(request, tenant.businessId, 'READ_ONLY');
    try {
      // The client still thinks the tenant is active (no refresh yet), so the submit goes out and the API refuses it.
      await page.getByTestId('checkout-submit').click();
      await expect(page.getByText(/read-only/i).first()).toBeVisible();
      await expect(page.getByTestId('checkout-drawer')).not.toHaveAttribute('aria-hidden', 'true');
      expect(await db.order.count({ where: { businessId: tenant.businessId } })).toBe(0);
      expect(await db.productInstance.count({ where: { productId: product.id, status: 'SOLD' } })).toBe(0);
    } finally {
      await setBusinessStatus(request, tenant.businessId, 'ACTIVE');
    }
  });

  test('switching back to ACTIVE restores writes', async ({ request }) => {
    const { api } = await ownerApi(request, tenant);
    await setBusinessStatus(request, tenant.businessId, 'READ_ONLY');
    const blocked = await api.post('/customer/newcustomer', { name: 'Back Online', phone: '03002223333' });
    expect(blocked.status()).toBe(403);
    await setBusinessStatus(request, tenant.businessId, 'ACTIVE');
    const ok = await api.post('/customer/newcustomer', { name: 'Back Online', phone: '03002223333' });
    expect(ok.ok(), `${ok.status()} ${await ok.text()}`).toBeTruthy();
    expect(await db.customer.count({ where: { businessId: tenant.businessId, name: 'Back Online' } })).toBe(1);
  });
});

test.describe('H: SUSPENDED tenant', () => {
  let tenant: ThrowawayTenant;
  test.beforeAll(async ({ request }) => {
    tenant = await createThrowawayTenant(request, 'susp');
  });

  test('login is refused and an already-issued token stops working; reactivating restores both', async ({ request }) => {
    const { accessToken, api } = await ownerApi(request, tenant);
    expect((await api.get('/customer/getallcustomers')).status()).toBe(200);

    await setBusinessStatus(request, tenant.businessId, 'SUSPENDED');
    try {
      const login = await loginApi(request, tenant.ownerEmail);
      expect(login.status()).toBe(401);
      expect(await login.text()).toContain('suspended');

      // Existing token: even reads are rejected.
      const read = await api.get('/customer/getallcustomers');
      expect(read.status()).toBe(403);
      expect(await read.text()).toContain('suspended');
      const write = await api.post('/customer/newcustomer', { name: 'Ghost', phone: '03003334444' });
      expect(write.status()).toBe(403);
      expect(await db.customer.count({ where: { businessId: tenant.businessId } })).toBe(0);
      expect(accessToken).toBeTruthy();
    } finally {
      await setBusinessStatus(request, tenant.businessId, 'ACTIVE');
    }
    const again = await loginApi(request, tenant.ownerEmail);
    expect(again.ok()).toBeTruthy();
    expect((await api.get('/customer/getallcustomers')).status()).toBe(200);
  });

  test('UI: a suspended owner cannot sign in and sees the login error', async ({ page, request }) => {
    await setBusinessStatus(request, tenant.businessId, 'SUSPENDED');
    try {
      await uiLogin(page, tenant.ownerEmail);
      await expect(page.getByTestId('login-error')).toContainText(/suspended/i);
      await expect(page).toHaveURL(/\/login/);
      expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
    } finally {
      await setBusinessStatus(request, tenant.businessId, 'ACTIVE');
    }
  });
});

test.describe('H: base plan limits', () => {
  test('the 6th account (owner + 4 invited, pending invites count) is refused by the API and nothing is created', async ({ request }) => {
    const tenant = await createThrowawayTenant(request, 'users');
    const { api } = await ownerApi(request, tenant);
    for (let i = 1; i <= 4; i++) {
      const res = await api.post('/team/invite', { email: `lim${i}-${Date.now()}-${tenant.businessId.slice(0, 4)}@deepkhata.test`, role: 'STAFF' });
      expect(res.ok(), `invite ${i}: ${res.status()} ${await res.text()}`).toBeTruthy();
    }
    expect(await db.invitation.count({ where: { businessId: tenant.businessId } })).toBe(4);

    const sixth = await api.post('/team/invite', { email: `lim5-${Date.now()}@deepkhata.test`, role: 'STAFF' });
    expect(sixth.status()).toBe(403);
    expect(await sixth.text()).toContain('Plan limit reached: 5 users on');
    expect(await db.invitation.count({ where: { businessId: tenant.businessId } })).toBe(4);

    // The settings alias enforces the same cap (counts members only: owner = 1 here, so check via a full roster below).
    // Cancelling one pending invite frees a slot.
    const inv = await db.invitation.findFirstOrThrow({ where: { businessId: tenant.businessId } });
    await db.invitation.delete({ where: { id: inv.id } });
    const retry = await api.post('/team/invite', { email: `lim6-${Date.now()}@deepkhata.test`, role: 'STAFF' });
    expect(retry.ok(), `${retry.status()} ${await retry.text()}`).toBeTruthy();
    expect(await db.invitation.count({ where: { businessId: tenant.businessId } })).toBe(4);
  });

  test('UI: inviting past the limit shows the plan-limit error in the invite modal', async ({ page, request }) => {
    const tenant = await createThrowawayTenant(request, 'usersui');
    const { api } = await ownerApi(request, tenant);
    for (let i = 1; i <= 4; i++) {
      const res = await api.post('/team/invite', { email: `ui${i}-${Date.now()}-${tenant.businessId.slice(0, 4)}@deepkhata.test`, role: 'STAFF' });
      expect(res.ok()).toBeTruthy();
    }
    await uiLogin(page, tenant.ownerEmail);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await page.goto('/settings?tab=team');
    await page.getByTestId('team-invite-open').click();
    await expect(page.getByTestId('invite-modal')).toBeVisible();
    await page.getByTestId('invite-email').fill(`over-${Date.now()}@deepkhata.test`);
    await page.getByTestId('invite-role').selectOption('STAFF');
    await page.getByTestId('invite-submit').click();
    await expect(page.getByTestId('invite-error')).toContainText(/Plan limit reached: 5 users/);
    expect(await db.invitation.count({ where: { businessId: tenant.businessId } })).toBe(4);
  });

  test('a 3rd branch is refused for an owner on the base plan (limit 2), the first extra branch is allowed', async ({ request }) => {
    const tenant = await createThrowawayTenant(request, 'branches');
    const { api } = await ownerApi(request, tenant);
    expect(await db.branch.count({ where: { businessId: tenant.businessId, deletedAt: null } })).toBe(1);

    const second = await api.post('/settings/branch', { name: 'Second Shop' });
    expect(second.ok(), `${second.status()} ${await second.text()}`).toBeTruthy();
    expect(await db.branch.count({ where: { businessId: tenant.businessId, deletedAt: null } })).toBe(2);

    const third = await api.post('/settings/branch', { name: 'Third Shop' });
    expect(third.status()).toBe(403);
    expect(await third.text()).toContain('Plan limit reached: 2 branches on');
    expect(await db.branch.count({ where: { businessId: tenant.businessId, deletedAt: null } })).toBe(2);
    expect(await db.branch.count({ where: { businessId: tenant.businessId, name: 'Third Shop' } })).toBe(0);
  });

  test('the account cap also covers a full roster of members, not only invites', async ({ request }) => {
    const tenant = await createThrowawayTenant(request, 'roster');
    const { api } = await ownerApi(request, tenant);
    // Fill the roster to 5 real users directly in the DB (acceptance flow is covered by the team suite).
    const owner = await db.user.findUniqueOrThrow({ where: { id: tenant.ownerId } });
    for (let i = 1; i <= 4; i++) {
      await db.user.create({
        data: {
          name: `Member ${i}`,
          email: `member${i}-${tenant.businessId.slice(0, 6)}-${Date.now()}@deepkhata.test`,
          password: owner.password,
          role: 'STAFF',
          businessId: tenant.businessId,
        },
      });
    }
    const res = await api.post('/team/invite', { email: `roster-${Date.now()}@deepkhata.test`, role: 'STAFF' });
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain('Plan limit reached: 5 users on');
    expect(await db.invitation.count({ where: { businessId: tenant.businessId } })).toBe(0);
  });
});

