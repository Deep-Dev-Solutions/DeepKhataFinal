import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { BUSINESS_A, HALL_ROAD, createProduct, createSaleViaApi } from '../pos/support';

test.use({ storageState: storage('ownerA') });

async function closeHallRoadIfOpen(request: APIRequestContext) {
  const open = await db.cashRegisterSession.count({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' },
  });
  if (open > 0) {
    const owner = await apiAs('ownerA', request);
    const res = await owner.post(
      '/cash/register/close',
      { actualCash: '0', branchId: HALL_ROAD, notes: 'E2E cleanup close' },
      { branchId: HALL_ROAD },
    );
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

test.beforeEach(async ({ request }) => closeHallRoadIfOpen(request));
test.afterEach(async ({ request }) => closeHallRoadIfOpen(request));

test('one tap closes the galla when it is correct and opens the Z-report', async ({ page, request }) => {
  const owner = await apiAs('ownerA', request);
  await owner.post('/cash/register/open', { openingBalance: 2000 }, { branchId: HALL_ROAD });

  const product = await createProduct(request, { price: 1000, qty: 1, label: 'CloseTap' });
  await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 1, price: 1000 }],
    amountPaid: 1000,
  });

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await page.getByTestId('cash-close-register').click();
  await expect(page.getByTestId('close-register-modal')).toBeVisible();
  await expect(page.getByTestId('close-register-expected')).toContainText('3,000');
  // The note-count grid is collapsed by default.
  await expect(page.getByText('Rs 5,000')).toHaveCount(0);

  await page.getByTestId('close-register-one-tap').click();
  await expect(page.getByTestId('close-register-counted')).toHaveValue('3000');
  await expect(page.getByTestId('close-register-variance')).toContainText('Galla poora hai');
  await expect(page.getByTestId('close-register-note-required')).toHaveCount(0);

  await page.getByTestId('close-register-submit').click();
  await expect(page.getByTestId('zreport-modal')).toBeVisible();
  await expect(page.getByTestId('zreport-modal')).toContainText('3,000');

  const session = await db.cashRegisterSession.findFirstOrThrow({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  });
  expect(Number(session.expectedCash)).toBe(3000);
  expect(Number(session.actualCash)).toBe(3000);
  expect(Number(session.difference)).toBe(0);
  expect(session.notes).toBeNull();
});

test('a variance needs a written note before the galla can close', async ({ page, request }) => {
  const owner = await apiAs('ownerA', request);
  await owner.post('/cash/register/open', { openingBalance: 2000 }, { branchId: HALL_ROAD });

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await page.getByTestId('cash-close-register').click();
  await page.getByTestId('close-register-counted').fill('1500');
  await expect(page.getByTestId('close-register-variance')).toContainText('SHORT by PKR 500');
  await expect(page.getByTestId('close-register-note-required')).toBeVisible();
  await expect(page.getByTestId('close-register-submit')).toBeDisabled();

  await page.getByTestId('close-register-notes').fill('Rs 500 short: loose change given in the evening rush');
  await expect(page.getByTestId('close-register-submit')).toBeEnabled();
  await page.getByTestId('close-register-submit').click();
  await expect(page.getByTestId('zreport-modal')).toBeVisible();

  const session = await db.cashRegisterSession.findFirstOrThrow({
    where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  });
  expect(Number(session.difference)).toBe(-500);
  expect(session.notes).toContain('loose change');

  // The API refuses the same close without a note.
  const owner2 = await apiAs('ownerA', request);
  await owner2.post('/cash/register/open', { openingBalance: 1000 }, { branchId: HALL_ROAD });
  const noNote = await owner2.post(
    '/cash/register/close',
    { actualCash: '900', branchId: HALL_ROAD },
    { branchId: HALL_ROAD },
  );
  expect(noNote.status()).toBe(400);
  expect((await noNote.json()).message).toContain('note is required');
});
