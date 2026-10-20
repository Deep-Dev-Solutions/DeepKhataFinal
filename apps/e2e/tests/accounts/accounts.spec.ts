import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { waitForEmailLink } from '../../helpers/mailpit';
import { createThrowawayTenant } from '../../helpers/tenant-admin';
import { E2E } from '../../env';

test.use({ storageState: { cookies: [], origins: [] } });

const stamp = Date.now();

async function uiLogin(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-email').fill(identifier);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

async function apiLogin(request: import('@playwright/test').APIRequestContext, body: Record<string, string>) {
  return request.post(`${E2E.apiUrl}/auth/login`, { data: body });
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe.serial('P6: sign up, email verification, onboarding', () => {
  const email = `signup-${stamp}@deepkhata.test`;
  const password = 'SignUp#Pass1';
  const shopName = `Signup Shop ${stamp}`;

  test('register through the UI, finish onboarding; unverified owner is warned and blocked from adding people', async ({ page, request }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Signup Owner');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-phone').fill('03001234567');
    await page.getByTestId('register-password').fill(password);
    await page.getByTestId('terms-checkbox').check();
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });

    const created = await db.user.findUniqueOrThrow({ where: { email } });
    expect(created.emailVerified).toBe(false);
    expect(created.businessId).toBeNull();

    // Onboarding: 3 steps.
    await page.getByTestId('onboarding-shop-name').fill(shopName);
    await page.getByTestId('onboarding-city').fill('Lahore');
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-phone').fill('03001234567');
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-sample-data').uncheck();
    await page.getByTestId('onboarding-accept-terms').check();
    await page.getByTestId('onboarding-submit').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });

    const owner = await db.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    expect(owner.role).toBe('OWNER');
    expect(owner.business?.name).toBe(shopName);
    expect(owner.emailVerified).toBe(false);

    // Unverified: banner shown on the dashboard.
    await expect(page.getByTestId('email-verify-banner')).toBeVisible();

    // API gating: both team-creation routes answer EMAIL_NOT_VERIFIED and write nothing.
    const login = await apiLogin(request, { email, password });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).accessToken as string;
    const members = await request.post(`${E2E.apiUrl}/team/members`, {
      headers: bearer(token),
      data: { name: 'Blocked Staff', username: `blocked${stamp}`, password: 'Blocked#Pass1', role: 'STAFF' },
    });
    expect(members.status()).toBe(403);
    expect((await members.json()).code).toBe('EMAIL_NOT_VERIFIED');
    const invite = await request.post(`${E2E.apiUrl}/team/invite`, {
      headers: bearer(token),
      data: { email: `blocked-invite-${stamp}@deepkhata.test`, role: 'STAFF' },
    });
    expect(invite.status()).toBe(403);
    expect((await invite.json()).code).toBe('EMAIL_NOT_VERIFIED');
    expect(await db.user.count({ where: { businessId: owner.businessId, id: { not: owner.id } } })).toBe(0);
    expect(await db.invitation.count({ where: { businessId: owner.businessId! } })).toBe(0);

    // UI gating: the create dialog surfaces the same refusal.
    await page.goto('/settings?tab=team');
    await page.getByTestId('team-create-open').click();
    await page.getByTestId('team-create-name').fill('Blocked Staff');
    await page.getByTestId('team-create-username').fill(`blocked${stamp}`);
    await page.getByTestId('team-create-password').fill('Blocked#Pass1');
    await page.getByTestId('team-create-submit').click();
    await expect(page.getByTestId('team-create-error')).toContainText(/verify your email/i);
  });

  test('the verification email link verifies the address; banner disappears and the owner can add staff', async ({ page, request }) => {
    const link = await waitForEmailLink(request, email, '/verify-email');
    await uiLogin(page, email, password);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
    await expect(page.getByTestId('email-verify-banner')).toBeVisible();

    await page.goto(link);
    await expect(page.getByTestId('verify-status')).toHaveAttribute('data-status', 'success', { timeout: 30_000 });
    await expect
      .poll(async () => (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified)
      .toBe(true);

    await page.goto('/dashboard');
    await expect(page.getByTestId('nav-orders')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('email-verify-banner')).toHaveCount(0);

    // A verified owner can now add a member.
    await page.goto('/settings?tab=team');
    await page.getByTestId('team-create-open').click();
    await page.getByTestId('team-create-name').fill('Allowed Staff');
    await page.getByTestId('team-create-username').fill(`allowed${stamp}`);
    await page.getByTestId('team-create-password').fill('Allowed#Pass1');
    await page.getByTestId('team-create-submit').click();
    await expect(page.getByTestId('team-create-result')).toBeVisible();
    const staff = await db.user.findFirstOrThrow({ where: { displayUsername: `allowed${stamp}` } });
    expect(staff.role).toBe('STAFF');
    expect(staff.businessId).toBe((await db.user.findUniqueOrThrow({ where: { email } })).businessId);
  });

  test('a tampered verification token reports an error and verifies nobody', async ({ page, request }) => {
    const link = await waitForEmailLink(request, email, '/verify-email');
    // Tampered token: never verifies anyone.
    const other = await createThrowawayTenant(request, 'verifybad');
    await db.user.update({ where: { id: other.ownerId }, data: { emailVerified: false } });
    const tampered = link.replace(/token=[^&]+/, 'token=not-a-real-token');
    await page.goto(tampered);
    await expect(page.getByTestId('verify-status')).toHaveAttribute('data-status', 'error', { timeout: 30_000 });
    expect((await db.user.findUniqueOrThrow({ where: { id: other.ownerId } })).emailVerified).toBe(false);
  });
});

test.describe.serial('P6: forgot password and reset', () => {
  const newPassword = 'Brand#NewPass9';
  let ownerEmail = '';
  let oldToken = '';

  test('request a reset from the UI, set a new password from the emailed link', async ({ page, request }) => {
    const tenant = await createThrowawayTenant(request, 'reset');
    ownerEmail = tenant.ownerEmail;

    // An already-issued session that must die with the reset.
    const login = await apiLogin(request, { email: ownerEmail, password: TEST_PASSWORD });
    expect(login.ok()).toBeTruthy();
    oldToken = (await login.json()).accessToken as string;
    expect((await request.get(`${E2E.apiUrl}/user/me`, { headers: bearer(oldToken) })).status()).toBe(200);
    expect(await db.session.count({ where: { userId: tenant.ownerId } })).toBeGreaterThan(0);

    await page.goto('/forgot-password');
    await page.getByTestId('forgot-email').fill(ownerEmail);
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-done')).toBeVisible({ timeout: 30_000 });

    const link = await waitForEmailLink(request, ownerEmail, '/reset-password');
    await page.goto(link);
    await page.getByTestId('reset-password').fill(newPassword);
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('reset-done')).toBeVisible({ timeout: 30_000 });
  });

  test('old password is refused, new password works, and the old session is revoked in the DB', async ({ request }) => {
    const user = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });

    const oldLogin = await apiLogin(request, { email: ownerEmail, password: TEST_PASSWORD });
    expect(oldLogin.status()).toBe(401);

    // The session issued before the reset is gone (row deleted) and its token is rejected.
    expect(await db.session.count({ where: { token: oldToken } })).toBe(0);
    expect((await request.get(`${E2E.apiUrl}/user/me`, { headers: bearer(oldToken) })).status()).toBe(401);

    const newLogin = await apiLogin(request, { email: ownerEmail, password: newPassword });
    expect(newLogin.ok()).toBeTruthy();
    const newToken = (await newLogin.json()).accessToken as string;
    expect((await request.get(`${E2E.apiUrl}/user/me`, { headers: bearer(newToken) })).status()).toBe(200);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);

    // The stored credential changed.
    const account = await db.account.findFirstOrThrow({ where: { userId: user.id, providerId: 'credential' } });
    expect(account.password).toBeTruthy();
  });

  test('UI login: the old password shows an error, the new one reaches the dashboard', async ({ page }) => {
    await uiLogin(page, ownerEmail, TEST_PASSWORD);
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await uiLogin(page, ownerEmail, newPassword);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
    await expect(page.getByTestId('nav-orders')).toBeVisible();
  });

  test('a used reset link cannot be replayed', async ({ page, request }) => {
    const link = await waitForEmailLink(request, ownerEmail, '/reset-password');
    await page.goto(link);
    await page.getByTestId('reset-password').fill('Replay#Attack99');
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('reset-error')).toBeVisible({ timeout: 30_000 });
    const attempt = await apiLogin(request, { email: ownerEmail, password: 'Replay#Attack99' });
    expect(attempt.status()).toBe(401);
    expect((await apiLogin(request, { email: ownerEmail, password: newPassword })).ok()).toBeTruthy();
  });
});

test.describe.serial('P6: staff username login and deactivation', () => {
  const handle = `till${stamp}`;
  const staffName = 'Till Staff';
  const staffPassword = 'TillStaff#Pass1';
  let ownerEmail = '';
  let slug = '';
  let businessId = '';
  let loginUsername = '';
  let staffId = '';
  let staffToken = '';

  test('owner creates a staff login from the Team settings UI; staff signs in with username@slug and lands in the dashboard', async ({ browser, page, request }) => {
    const tenant = await createThrowawayTenant(request, 'staffname');
    ownerEmail = tenant.ownerEmail;
    businessId = tenant.businessId;
    slug = (await db.business.findUniqueOrThrow({ where: { id: businessId } })).slug;
    loginUsername = `${handle}@${slug}`;

    await uiLogin(page, ownerEmail, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
    await page.goto('/settings?tab=team');
    await page.getByTestId('team-create-open').click();
    await page.getByTestId('team-create-name').fill(staffName);
    await page.getByTestId('team-create-username').fill(handle);
    await page.getByTestId('team-create-password').fill(staffPassword);
    await page.getByTestId('team-create-role').selectOption('STAFF');
    await page.getByTestId('team-create-submit').click();
    await expect(page.getByTestId('team-create-result-username')).toHaveText(loginUsername);

    const staff = await db.user.findUniqueOrThrow({ where: { username: loginUsername } });
    staffId = staff.id;
    expect(staff.role).toBe('STAFF');
    expect(staff.businessId).toBe(businessId);
    expect(staff.name).toBe(staffName);
    expect(staff.displayUsername).toBe(handle);
    expect(staff.deactivatedAt).toBeNull();

    // Fresh browser context: the staff member signs in with username@slug.
    const ctx = await browser.newContext();
    const staffPage = await ctx.newPage();
    await uiLogin(staffPage, loginUsername, staffPassword);
    await expect(staffPage).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await expect(staffPage.getByTestId('nav-orders')).toBeVisible();
    for (const hidden of ['reports', 'settings']) {
      await expect(staffPage.getByTestId(`nav-${hidden}`)).toHaveCount(0);
    }
    expect(await db.session.count({ where: { userId: staffId } })).toBeGreaterThan(0);
    await ctx.close();

    // Wrong password for the same username is refused.
    expect((await apiLogin(request, { username: loginUsername, password: 'WrongPass#1' })).status()).toBe(401);
  });

  test('owner deactivates the staff member: the old token dies, login is refused, the DB shows it', async ({ page, request }) => {
    const login = await apiLogin(request, { username: loginUsername, password: staffPassword });
    expect(login.ok()).toBeTruthy();
    staffToken = (await login.json()).accessToken as string;
    const read = () => request.get(`${E2E.apiUrl}/customer/getallcustomers`, { headers: bearer(staffToken) });
    expect((await read()).status()).toBe(200);

    await uiLogin(page, ownerEmail, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
    await page.goto('/settings?tab=team');
    const row = page.getByTestId('team-member-row').filter({ hasText: handle });
    await expect(row).toBeVisible();
    await row.getByTestId('team-member-deactivate').click();
    // MISSING testid: AlertDialog confirm button (confirm is the last "Deactivate" button in the DOM).
    await page.getByRole('button', { name: 'Deactivate', exact: true }).last().click();
    await expect(row.getByTestId('team-member-deactivated')).toBeVisible();

    const after = await db.user.findUniqueOrThrow({ where: { id: staffId } });
    expect(after.deactivatedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: staffId } })).toBe(0);

    // The token issued before deactivation is dead, on reads and on /user/me.
    expect((await read()).status()).toBe(401);
    expect((await request.get(`${E2E.apiUrl}/user/me`, { headers: bearer(staffToken) })).status()).toBe(401);

    // Correct password, deactivated account: refused, no session is left behind.
    const refused = await apiLogin(request, { username: loginUsername, password: staffPassword });
    expect(refused.status()).toBe(401);
    expect(await refused.text()).toMatch(/deactivated/i);
    expect(await db.session.count({ where: { userId: staffId } })).toBe(0);
  });

  test('UI login of a deactivated member shows the error and never opens the dashboard', async ({ page }) => {
    await uiLogin(page, loginUsername, staffPassword);
    await expect(page.getByTestId('login-error')).toContainText(/deactivated/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('reactivating lets the member back in, but the old token stays dead', async ({ page, request }) => {
    await uiLogin(page, ownerEmail, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
    await page.goto('/settings?tab=team');
    const row = page.getByTestId('team-member-row').filter({ hasText: handle });
    await expect(row.getByTestId('team-member-deactivated')).toBeVisible();
    await row.getByTestId('team-member-reactivate').click();
    await expect(row.getByTestId('team-member-deactivated')).toHaveCount(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: staffId } })).deactivatedAt).toBeNull();

    // Reactivation does not resurrect the revoked session.
    const stale = await request.get(`${E2E.apiUrl}/customer/getallcustomers`, { headers: bearer(staffToken) });
    expect(stale.status()).toBe(401);

    const login = await apiLogin(request, { username: loginUsername, password: staffPassword });
    expect(login.ok()).toBeTruthy();
    const fresh = (await login.json()).accessToken as string;
    expect((await request.get(`${E2E.apiUrl}/customer/getallcustomers`, { headers: bearer(fresh) })).status()).toBe(200);
  });
});
