import { test, expect } from '@playwright/test';
import { TEST_PASSWORD } from '../../fixtures/users';
import { db } from '../../helpers/db';
import { E2E } from '../../env';

test.use({ storageState: { cookies: [], origins: [] } });

// Uses a freshly registered user and a unique X-Forwarded-For so the shared seeded users and the
// shared localhost IP are never locked out.
test('A: 10 failed logins lock the account for 3 hours, even for the right password', async ({ page, request }) => {
  const stamp = Date.now();
  const email = `lockout-${stamp}@deepkhata.test`;
  const fakeIp = `10.77.${stamp % 250}.${(stamp >> 3) % 250 + 1}`;
  const login = (password: string) =>
    request.post(`${E2E.apiUrl}/auth/login`, {
      data: { email, password },
      headers: { 'x-forwarded-for': fakeIp },
    });

  const reg = await request.post(`${E2E.apiUrl}/auth/register`, {
    data: { name: 'Lockout Probe', email, password: TEST_PASSWORD },
  });
  expect(reg.ok()).toBeTruthy();

  try {
    // Attempts 1..9: rejected with a running countdown.
    for (let i = 1; i <= 9; i++) {
      const res = await login('wrong-password');
      expect(res.status(), `attempt ${i}`).toBe(401);
      const remaining = 10 - i;
      expect((await res.json()).message).toContain(`${remaining} attempt${remaining === 1 ? '' : 's'} remaining`);
    }
    // Attempt 10 triggers the lockout.
    const tenth = await login('wrong-password');
    expect(tenth.status()).toBe(429);
    expect(JSON.stringify(await tenth.json())).toMatch(/lock/i);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.failedAttempts).toBe(10);
    expect(user.lockoutUntil).not.toBeNull();
    const hoursLocked = (user.lockoutUntil!.getTime() - Date.now()) / 3_600_000;
    expect(hoursLocked).toBeGreaterThan(2.9);
    expect(hoursLocked).toBeLessThanOrEqual(3.01);

    // The correct password is now refused too, with the lockout message.
    const correct = await login(TEST_PASSWORD);
    expect(correct.status()).toBe(429);
    expect(((await correct.json()).message as string)).toMatch(/temporarily locked|Too many failed login attempts/i);

    // The browser login form surfaces the same message (lockout is per account, so this works from any IP).
    await page.goto('/login');
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(TEST_PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText(/locked/i);
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
  } finally {
    await db.loginAttempt.deleteMany({ where: { ip: fakeIp } });
  }
});
