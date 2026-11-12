import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { BUSINESS_A, HALL_ROAD } from '../pos/support';

test.use({ storageState: storage('ownerA') });

async function closeHallRoadIfOpen(request: APIRequestContext) {
  const open = await db.cashRegisterSession.count({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' },
  });
  if (open > 0) {
    const owner = await apiAs('ownerA', request);
    const res = await owner.post(
      '/cash/register/close',
      { actualCash: 0, branchId: HALL_ROAD },
      { branchId: HALL_ROAD },
    );
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

const totalOf = async (page: import('@playwright/test').Page) => {
  const text = (await page.getByTestId('expenses-total').innerText()).replace(/[^\d.]/g, '');
  return Number(text);
};

test.beforeEach(async ({ request }) => {
  await closeHallRoadIfOpen(request);
  const owner = await apiAs('ownerA', request);
  await owner.post('/cash/register/open', { openingBalance: 5000 }, { branchId: HALL_ROAD });
  await owner.post(
    '/cash/expense',
    { amount: '300', category: 'CHAI_REFRESHMENT', description: 'History chai' },
    { branchId: HALL_ROAD },
  );
  await owner.post(
    '/cash/expense',
    { amount: '1200', category: 'DELIVERY_RIDER', description: 'History rider' },
    { branchId: HALL_ROAD },
  );
});

test.afterEach(async ({ request }) => closeHallRoadIfOpen(request));

test('the expense history page lists today, voids a voucher and drops the total', async ({ page }) => {
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash/expenses');
  await expect(page.getByTestId('expenses-page')).toBeVisible();

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const day = page.getByTestId('expense-day-row').filter({ hasText: today });
  await expect(day).toHaveCount(1);
  const before = await totalOf(page);
  expect(before).toBeGreaterThanOrEqual(1500);

  await day.click();
  const chai = page.getByTestId('expense-row').filter({ hasText: 'History chai' });
  await expect(chai).toHaveCount(1);
  await expect(chai).toContainText('-Rs 300');
  await expect(page.getByTestId('expense-row').filter({ hasText: 'History rider' })).toHaveCount(1);

  await chai.getByTestId('expense-void').click();
  await expect(page.getByTestId('expense-void-dialog')).toBeVisible();
  await page.getByTestId('expense-void-reason').fill('Chai was Rs 100');
  await page.getByTestId('expense-void-confirm').click();

  await expect(page.getByTestId('expense-void-dialog')).toHaveCount(0);
  await expect(page.getByTestId('expenses-total')).toContainText((before - 300).toLocaleString());
  const voidedRow = page.getByTestId('expense-row').filter({ hasText: 'History chai' }).first();
  await expect(voidedRow.getByTestId('expense-voided-badge')).toContainText('Voided');
  await expect(voidedRow).toContainText('Chai was Rs 100');
  await expect(voidedRow.getByTestId('expense-void')).toHaveCount(0);

  const expense = await db.expense.findFirstOrThrow({
    where: { businessId: BUSINESS_A, description: 'History chai' },
    include: { transaction: true },
  });
  expect(expense.transaction?.voidedAt).not.toBeNull();
  expect(expense.transaction?.voidReason).toBe('Chai was Rs 100');
  await expectLedgerBalanced(BUSINESS_A);
});
