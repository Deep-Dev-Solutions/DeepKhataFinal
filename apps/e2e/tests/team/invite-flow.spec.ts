import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, tenants, users } from '../../fixtures/users';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { storage } from '../../helpers/auth';
import { inviteLinkFromEmail, waitForEmailText } from '../../helpers/mailpit';
import { E2E } from '../../env';

const stamp = Date.now();
const staffEmail = `invitee-${stamp}@deepkhata.test`;
const staffName = 'Invited Staff';
const staffPassword = 'Invitee#Pass1';

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

test.describe.serial('I: team - invite, accept, role change, removal', () => {
  test('owner invites a STAFF member from the team settings UI; invitation row + email exist', async ({ browser, request }) => {
    const ctx = await browser.newContext({ storageState: storage('ownerA') });
    const page = await ctx.newPage();
    await page.goto('/settings?tab=team');
    // MISSING testid: the "Invite Staff" button has none (see MISSING_TESTIDS).
    await page.getByRole('button', { name: /invite staff/i }).click();
    await expect(page.getByTestId('invite-modal')).toBeVisible();
    await page.getByTestId('invite-email').fill(staffEmail);
    await page.getByTestId('invite-role').selectOption('STAFF');
    await page.getByTestId('invite-submit').click();
    await expect(page.getByTestId('invite-modal')).toHaveCount(0);

    const inv = await db.invitation.findFirst({ where: { email: staffEmail } });
    expect(inv).not.toBeNull();
    expect(inv!.role).toBe('STAFF');
    expect(inv!.businessId).toBe(tenants.A.id);

    const text = await waitForEmailText(request, staffEmail);
    expect(text).toContain(`/join?token=${inv!.token}`);
    expect(text).toMatch(/\*STAFF\*/);
    await ctx.close();
  });

  test('inviting the same email twice, or an existing user, shows invite-error', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storage('ownerA') });
    const page = await ctx.newPage();
    await page.goto('/settings?tab=team');
    for (const email of [staffEmail, users.staffA.email]) {
      await page.getByRole('button', { name: /invite staff/i }).click();
      await page.getByTestId('invite-email').fill(email);
      await page.getByTestId('invite-submit').click();
      await expect(page.getByTestId('invite-error')).toBeVisible();
      await page.getByTestId('invite-close').click();
      await expect(page.getByTestId('invite-modal')).toHaveCount(0);
    }
    expect(await db.invitation.count({ where: { email: staffEmail } })).toBe(1);
    await ctx.close();
  });

  test('invitee opens the emailed link, sets a password, then logs in with STAFF permissions', async ({ browser, request }) => {
    const text = await waitForEmailText(request, staffEmail);
    const link = inviteLinkFromEmail(text);
    expect(link.startsWith(E2E.webUrl)).toBe(true);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(link);
    // MISSING testids on /join: name, password, submit (fallback: input types / button role).
    await expect(page.locator('input[type="email"]')).toHaveValue(staffEmail, { timeout: 60_000 });
    await page.locator('input[type="text"]').fill(staffName);
    await page.locator('input[type="password"]').fill(staffPassword);
    await page.getByRole('button', { name: /join workspace/i }).click();
    await expect(page).toHaveURL(/\/login/);

    const created = await db.user.findUniqueOrThrow({ where: { email: staffEmail } });
    expect(created.role).toBe('STAFF');
    expect(created.businessId).toBe(tenants.A.id);
    expect(created.name).toBe(staffName);
    expect(await db.invitation.count({ where: { email: staffEmail } })).toBe(0);

    await uiLogin(page, staffEmail, staffPassword);
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    await expect(page.getByTestId('nav-orders')).toBeVisible();
    for (const hidden of ['reports', 'dues', 'settings']) {
      await expect(page.getByTestId(`nav-${hidden}`)).toHaveCount(0);
    }
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    const denied = await request.get(`${E2E.apiUrl}/reports/financial`, { headers: { Authorization: `Bearer ${token}` } });
    expect(denied.status()).toBe(403);
    const allowed = await request.get(`${E2E.apiUrl}/customer/getallcustomers`, { headers: { Authorization: `Bearer ${token}` } });
    expect(allowed.status()).toBe(200);
    await ctx.close();
  });

  test('the used invite link cannot be reused', async ({ request }) => {
    // Invitation row was deleted on accept, so the token lookup must now fail.
    const res = await request.post(`${E2E.apiUrl}/team/join`, {
      data: { token: 'a'.repeat(64), name: 'x', password: 'y' },
    });
    expect(res.status()).toBe(400);
  });

  test('owner changes the role to MANAGER (API); a fresh login gets MANAGER permissions', async ({ request }) => {
    const owner = await apiAs('ownerA', request);
    const res = await owner.patch('/team/updaterole', { email: staffEmail, role: 'MANAGER' });
    expect(res.status()).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { email: staffEmail } })).role).toBe('MANAGER');

    const login = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email: staffEmail, password: staffPassword } });
    const { accessToken } = await login.json();
    // /dues needs read:dues: MANAGER has it, STAFF does not.
    const dues = await request.get(`${E2E.apiUrl}/dues`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(dues.status()).toBe(200);
  });

  test('role change is effective on the staff member\'s already-issued token', async ({ request }) => {
    // Token issued while the user was still STAFF: take a token, demote, change, compare.
    const owner = await apiAs('ownerA', request);
    await owner.patch('/team/updaterole', { email: staffEmail, role: 'STAFF' });
    const login = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email: staffEmail, password: staffPassword } });
    const { accessToken: staffToken } = await login.json();
    expect((await request.get(`${E2E.apiUrl}/dues`, { headers: { Authorization: `Bearer ${staffToken}` } })).status()).toBe(403);
    await owner.patch('/team/updaterole', { email: staffEmail, role: 'MANAGER' });
    const next = await request.get(`${E2E.apiUrl}/dues`, { headers: { Authorization: `Bearer ${staffToken}` } });
    expect(next.status()).toBe(200);
  });

  test('team tab role dropdown changes the role in the database', async ({ browser }) => {
    await db.user.update({ where: { email: staffEmail }, data: { role: 'STAFF' } });
    const ctx = await browser.newContext({ storageState: storage('ownerA') });
    const page = await ctx.newPage();
    await page.goto('/settings?tab=team');
    const row = page.getByTestId('team-member-row').filter({ hasText: staffEmail });
    await expect(row).toBeVisible();
    await row.getByTestId('team-member-role-select').selectOption('MANAGER');
    await page.getByRole('button', { name: 'Change Role' }).click();
    await expect
      .poll(async () => (await db.user.findUniqueOrThrow({ where: { email: staffEmail } })).role, { timeout: 5_000 })
      .toBe('MANAGER');
    await ctx.close();
  });

  let removedMemberToken = '';

  test('removed member is deleted and can no longer log in', async ({ request }) => {
    const login = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email: staffEmail, password: staffPassword } });
    removedMemberToken = (await login.json()).accessToken;
    expect(removedMemberToken).toBeTruthy();
    const owner = await apiAs('ownerA', request);
    const rm = await owner.delete('/team/removemember', { email: staffEmail });
    expect(rm.status()).toBe(200);
    expect(await db.user.count({ where: { email: staffEmail } })).toBe(0);

    const relogin = await request.post(`${E2E.apiUrl}/auth/login`, { data: { email: staffEmail, password: staffPassword } });
    expect(relogin.status()).toBe(401);
  });

  test('removed member\'s already-issued token no longer returns any data', async ({ request }) => {
    for (const path of ['/customer/getallcustomers', '/product/getproducts', '/dues']) {
      const res = await request.get(`${E2E.apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${removedMemberToken}`, 'x-branch-id': tenants.A.branches.hafeezCentre.id },
      });
      expect(res.ok(), `${path} answered ${res.status()} for a deleted user's token`).toBe(false);
      test.info().annotations.push({ type: 'removed-token-status', description: `${path} -> ${res.status()}` });
    }
  });

  test('removed member\'s token is rejected with 401/403 (not a 400 from a missing user row)', async ({ request }) => {
    const res = await request.get(`${E2E.apiUrl}/customer/getallcustomers`, {
      headers: { Authorization: `Bearer ${removedMemberToken}` },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('I: team - RBAC on team management', () => {
  test('manager and staff cannot open the invite flow or call team endpoints', async ({ request }) => {
    for (const role of ['managerA', 'staffA'] as const) {
      const api = await apiAs(role, request);
      expect((await api.post('/team/invite', { email: `x-${role}-${stamp}@deepkhata.test`, role: 'STAFF' })).status()).toBe(403);
      expect((await api.patch('/team/updaterole', { email: users.staffA.email, role: 'MANAGER' })).status()).toBe(403);
      expect((await api.delete('/team/removemember', { email: users.staffA.email })).status()).toBe(403);
    }
    expect(await db.invitation.count({ where: { email: { startsWith: 'x-' } } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { email: users.staffA.email } })).role).toBe('STAFF');
  });
});
