import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  addToCart,
  BUSINESS_A,
  createProduct,
  createSaleViaApi,
  HAFEEZ,
  HALL_ROAD,
  newOrderSince,
  openCheckout,
  orderIdsBefore,
  submitCheckout,
} from '../pos/support';

/**
 * Galla / cash suite. The seed leaves a register OPEN at Hafeez Centre, so the full open -> sell -> expense -> close
 * lifecycle runs on Hall Road (the only branch without a session). Specs run serially in one worker, so no other
 * spec produces Hall Road cash between open and close.
 */
test.use({ storageState: storage('ownerA') });

async function closeHallRoadIfOpen(request: APIRequestContext) {
  const owner = await apiAs('ownerA', request);
  const open = await db.cashRegisterSession.count({ where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' } });
  if (open > 0) {
    const res = await owner.post('/cash/register/close', { actualCash: 0, branchId: HALL_ROAD }, { branchId: HALL_ROAD });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

test.beforeEach(async ({ request }) => closeHallRoadIfOpen(request));
test.afterEach(async ({ request }) => closeHallRoadIfOpen(request));

test('open with float, cash sale, petty expense, close with shortage: session, variance and Z-report agree', async ({ page, request }) => {
  const product = await createProduct(request, { price: 1500, qty: 3, label: 'Galla' });
  const otherBranchProduct = await createProduct(request, { price: 700, qty: 2, branchId: HAFEEZ, label: 'GallaOther' });
  const bankProduct = await createProduct(request, { price: 1000, qty: 2, label: 'GallaBank' });

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await expect(page.getByTestId('cash-register-status')).toContainText('Register Closed');

  // 1. Open with a float of 2,000
  await page.getByTestId('cash-open-register').click();
  await expect(page.getByTestId('open-register-modal')).toBeVisible();
  await page.getByTestId('open-register-float').fill('2000');
  await page.getByTestId('open-register-submit').click();
  await expect(page.getByTestId('cash-register-status')).toContainText('Shift Active');
  await expect(page.getByTestId('cash-open-register')).toHaveCount(0);

  const session = await db.cashRegisterSession.findFirstOrThrow({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' },
  });
  expect(Number(session.openingBalance)).toBe(2000);

  // 2. Cash sale of 1,500 through the POS at Hall Road
  const before = await orderIdsBefore();
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('checkout-amount').fill('1500');
  await submitCheckout(page);
  const sale = await newOrderSince(before);
  expect(sale.branchId).toBe(HALL_ROAD);
  expect(sale.payments.map((p) => [p.method, Number(p.amount)])).toEqual([['CASH', 1500]]);

  // Sales that must NOT count towards the Hall Road drawer: a bank payment here and a cash payment at the other branch.
  await createSaleViaApi(request, {
    items: [{ productId: bankProduct.id, quantity: 1, price: 1000 }],
    amountPaid: 1000,
    paymentMethod: 'BANK',
  });
  await createSaleViaApi(request, {
    items: [{ productId: otherBranchProduct.id, quantity: 1, price: 700 }],
    amountPaid: 700,
    branchId: HAFEEZ,
  });

  // 3. Petty expense of 300
  await page.goto('/cash');
  await page.getByTestId('cash-expense-amount').fill('300');
  await page.getByTestId('cash-expense-description').fill('E2E chai for customers');
  await page.getByTestId('cash-expense-submit').click();
  const row = page.getByTestId('cash-expense-row').filter({ hasText: 'E2E chai for customers' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('300');
  const expense = await db.expense.findFirstOrThrow({ where: { businessId: BUSINESS_A, description: 'E2E chai for customers' } });
  expect(Number(expense.amount)).toBe(300);
  expect(expense.branchId).toBe(HALL_ROAD);
  await expectLedgerBalanced(BUSINESS_A);

  // Live Z-report while open: float 2,000 + sales 1,500 - expenses 300 = 3,200
  await page.getByTestId('cash-zreport').click();
  await expect(page.getByTestId('zreport-modal')).toBeVisible();
  await expect(page.getByTestId('zreport-total-sales')).toContainText('1,500');
  await expect(page.getByTestId('zreport-expected-cash')).toContainText('3,200');
  await page.getByTestId('zreport-close').click();
  await expect(page.getByTestId('zreport-modal')).toHaveCount(0);

  // 4. Close counting 3,100: variance -100 (shortage)
  await page.getByTestId('cash-close-register').click();
  await expect(page.getByTestId('close-register-modal')).toBeVisible();
  // Fallback selector: the count-mode tab has no testid (see MISSING_TESTIDS); default mode is a denomination counter.
  await page.getByRole('button', { name: 'Total Sum Only' }).click();
  await page.getByTestId('close-register-counted').fill('3100');
  await expect(page.getByTestId('close-register-variance')).toContainText('SHORT by PKR 100');
  await page.getByTestId('close-register-submit').click();

  // Z-report opens for the closed session with totals equal to the session's cash movements.
  await expect(page.getByTestId('zreport-modal')).toBeVisible();
  await expect(page.getByTestId('zreport-total-sales')).toContainText('1,500');
  await expect(page.getByTestId('zreport-expected-cash')).toContainText('3,200');
  await page.getByTestId('zreport-close').click();
  await expect(page.getByTestId('cash-register-status')).toContainText('Register Closed');

  const closed = await db.cashRegisterSession.findUniqueOrThrow({ where: { id: session.id } });
  expect(closed.status).toBe('CLOSED');
  expect(Number(closed.cashSales)).toBe(1500);
  expect(Number(closed.cashExpenses)).toBe(300);
  expect(Number(closed.expectedCash)).toBe(3200);
  expect(Number(closed.actualCash)).toBe(3100);
  expect(Number(closed.difference)).toBe(Number(closed.actualCash) - Number(closed.expectedCash));
  expect(Number(closed.difference)).toBe(-100);
  expect(closed.closedAt).not.toBeNull();
  await expectLedgerBalanced(BUSINESS_A);
});

test('a second register cannot be opened on a branch that already has one open', async ({ page, request }) => {
  const owner = await apiAs('ownerA', request);
  const first = await owner.post('/cash/register/open', { openingBalance: 500, branchId: HALL_ROAD }, { branchId: HALL_ROAD });
  expect(first.ok(), await first.text()).toBeTruthy();

  const second = await owner.post('/cash/register/open', { openingBalance: 900, branchId: HALL_ROAD }, { branchId: HALL_ROAD });
  expect(second.status()).toBe(400);
  expect(await second.text()).toContain('already open');
  expect(await db.cashRegisterSession.count({ where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' } })).toBe(1);

  // The seeded Hafeez Centre session blocks a second one there as well.
  const hafeez = await owner.post('/cash/register/open', { openingBalance: 100, branchId: HAFEEZ }, { branchId: HAFEEZ });
  expect(hafeez.status()).toBe(400);
  expect(await db.cashRegisterSession.count({ where: { businessId: BUSINESS_A, branchId: HAFEEZ, status: 'OPEN' } })).toBe(1);

  // UI: with a register open the page offers close, not open.
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await expect(page.getByTestId('cash-register-status')).toContainText('Shift Active');
  await expect(page.getByTestId('cash-open-register')).toHaveCount(0);
  await expect(page.getByTestId('cash-close-register')).toBeVisible();
});

test('closing a register with exactly the expected cash records zero difference; expenses at another branch are ignored', async ({ page, request }) => {
  const owner = await apiAs('ownerA', request);
  const opened = await owner.post('/cash/register/open', { openingBalance: 1000, branchId: HALL_ROAD }, { branchId: HALL_ROAD });
  expect(opened.ok(), await opened.text()).toBeTruthy();
  const exp = await owner.post(
    '/cash/expense',
    { amount: 150, category: 'CHAI_REFRESHMENT', description: 'E2E other branch tea', branchId: HAFEEZ },
    { branchId: HAFEEZ },
  );
  expect(exp.ok(), await exp.text()).toBeTruthy();

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await page.getByTestId('cash-close-register').click();
  await page.getByRole('button', { name: 'Total Sum Only' }).click();
  await page.getByTestId('close-register-counted').fill('1000');
  await expect(page.getByTestId('close-register-variance')).toContainText('Perfectly Balanced');
  await page.getByTestId('close-register-submit').click();
  await expect(page.getByTestId('zreport-modal')).toBeVisible();
  await page.getByTestId('zreport-close').click();

  const closed = await db.cashRegisterSession.findFirstOrThrow({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  });
  expect(Number(closed.cashExpenses)).toBe(0);
  expect(Number(closed.expectedCash)).toBe(1000);
  expect(Number(closed.difference)).toBe(0);
});

// S2: cash refunded on a return posts CASH credit in the ledger, but the register's expected cash only sums Payment rows
// (cash.service.ts getRegisterStatus / closeRegister), so the drawer is expected to hold money that was handed back.
test.fail('a cash refund on a return during the shift reduces the expected drawer cash', async ({ request }) => {
  const owner = await apiAs('ownerA', request);
  const opened = await owner.post('/cash/register/open', { openingBalance: 2000, branchId: HALL_ROAD }, { branchId: HALL_ROAD });
  expect(opened.ok(), await opened.text()).toBeTruthy();
  const product = await createProduct(request, { price: 1500, qty: 2, label: 'GallaRefund' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 1, price: 1500 }],
    amountPaid: 1500,
  });
  const ret = await owner.post(`/order/${order.id}/return`, { itemsToReturn: [{ productId: product.id, quantity: 1 }] });
  expect(ret.ok(), await ret.text()).toBeTruthy();

  const status = await owner.get('/cash/register/status', undefined, { branchId: HALL_ROAD });
  expect(status.ok()).toBeTruthy();
  const body = await status.json();
  expect(Number(body.expectedCash ?? body.status?.expectedCash)).toBe(2000);
});
