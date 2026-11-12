import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { BUSINESS_A, HALL_ROAD } from '../pos/support';

/**
 * Expense guards: the galla must be open and hold enough cash. Owners and
 * managers can override a shortfall with a reason; staff cannot.
 */
test.use({ storageState: storage('ownerA') });

async function closeHallRoadIfOpen(request: APIRequestContext) {
  const owner = await apiAs('ownerA', request);
  const open = await db.cashRegisterSession.count({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' },
  });
  if (open > 0) {
    const res = await owner.post(
      '/cash/register/close',
      { actualCash: '0', branchId: HALL_ROAD, notes: 'E2E cleanup close' },
      { branchId: HALL_ROAD },
    );
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

async function openRegister(page: import('@playwright/test').Page, float: string) {
  await page.getByTestId('cash-open-register').click();
  await expect(page.getByTestId('open-register-modal')).toBeVisible();
  await page.getByTestId('open-register-float').fill(float);
  await page.getByTestId('open-register-submit').click();
  await expect(page.getByTestId('cash-register-status')).toContainText('Shift Active');
}

test.beforeEach(async ({ request }) => closeHallRoadIfOpen(request));
test.afterEach(async ({ request }) => closeHallRoadIfOpen(request));

test('an expense with the register closed shows the galla warning and an Open Register action', async ({ page }) => {
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await expect(page.getByTestId('cash-register-status')).toContainText('Register Closed');

  await page.getByTestId('cash-expense-amount').fill('500');
  await page.getByTestId('cash-expense-description').fill('Chai while closed');
  await page.getByTestId('cash-expense-submit').click();

  const warning = page.getByTestId('cash-galla-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Galla band hai. Pehle register kholen.');

  await page.getByTestId('cash-galla-open-register').click();
  await expect(page.getByTestId('open-register-modal')).toBeVisible();

  const saved = await db.expense.count({
    where: { businessId: BUSINESS_A, description: 'Chai while closed' },
  });
  expect(saved).toBe(0);
});

test('an owner over the galla balance must give a reason before logging the expense', async ({ page }) => {
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await openRegister(page, '2000');

  await page.getByTestId('cash-expense-amount').fill('3000');
  await page.getByTestId('cash-expense-description').fill('Rider paid from home cash');
  await page.getByTestId('cash-expense-submit').click();

  const warning = page.getByTestId('cash-galla-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Galla mein cash kam hai');
  await expect(warning).toContainText('Galla mein sirf Rs 2,000 hain.');

  const logAnyway = page.getByTestId('cash-galla-log-anyway');
  await expect(logAnyway).toBeDisabled();

  await page.getByTestId('cash-galla-override-reason').fill('Paid from home cash, will add tomorrow');
  await expect(logAnyway).toBeEnabled();
  await logAnyway.click();

  await expect(page.getByTestId('cash-galla-warning')).toHaveCount(0);

  const expense = await db.expense.findFirstOrThrow({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, amount: 3000 },
    orderBy: { createdAt: 'desc' },
  });
  expect(expense.description).toBe(
    '[OVERRIDE: Paid from home cash, will add tomorrow] Rider paid from home cash',
  );
  expect(expense.sessionId).not.toBeNull();
});
