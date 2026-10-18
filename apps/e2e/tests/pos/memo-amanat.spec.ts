import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  addToCart,
  BUSINESS_A,
  createCustomer,
  createProduct,
  customerLedgerBalance,
  HALL_ROAD,
  instanceCounts,
  newOrderSince,
  openCheckout,
  orderIdsBefore,
  pickExistingCustomer,
  postingsByAccount,
  submitCheckout,
  transactionCount,
} from './support';

test.use({ storageState: storage('ownerA') });

test('memo (amanat): stock is locked with no ledger postings; settling makes it a final sale with postings', async ({ page, request }) => {
  const customer = await createCustomer(request, 'Memo');
  const product = await createProduct(request, { price: 4000, qty: 2, label: 'Memo' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await pickExistingCustomer(page, customer);
  await page.getByTestId('pos-status-select').selectOption('MEMO');
  await page.getByTestId('checkout-amount').fill('0');
  await submitCheckout(page);

  const memo = await newOrderSince(before);
  expect(memo.status).toBe('MEMO');
  expect(memo.customerId).toBe(customer.id);
  expect(await instanceCounts(product.id)).toEqual({ MEMO_LOCKED: 1, AVAILABLE: 1 });
  expect(await transactionCount(memo.id)).toBe(0);
  expect(await customerLedgerBalance(customer.id)).toBe(0);
  const movement = await db.inventoryMovement.findFirstOrThrow({ where: { referenceId: memo.id } });
  expect(movement.referenceType).toBe('MEMO');
  expect(movement.direction).toBe('OUT');

  // Settle through the API (the order page "Convert to Final Sale" modal has no testids).
  const owner = await apiAs('ownerA', request);
  const res = await owner.patch(`/order/${memo.id}/settle-memo`, { amountPaid: 1500, paymentMethod: 'CASH' });
  expect(res.ok(), await res.text()).toBeTruthy();

  const settled = await db.order.findUniqueOrThrow({ where: { id: memo.id }, include: { payments: true } });
  expect(settled.status).toBe('FINAL');
  expect(settled.paymentStatus).toBe('PARTIAL');
  expect(settled.payments).toHaveLength(1);
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
  expect(await postingsByAccount(memo.id)).toEqual({ REVENUE: -4000, CASH: 1500, [customer.id]: 2500 });
  expect(await customerLedgerBalance(customer.id)).toBe(2500);
  await expectLedgerBalanced(BUSINESS_A);
});

test('memo settled from the order page UI: Convert to Final Sale', async ({ page, request }) => {
  const customer = await createCustomer(request, 'MemoUi');
  const product = await createProduct(request, { price: 1800, qty: 1, label: 'MemoUi' });
  const { createSaleViaApi } = await import('./support');
  const memo = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 1, price: 1800 }],
    customerId: customer.id,
    amountPaid: 0,
    orderStatus: 'MEMO',
  });
  expect(await instanceCounts(product.id)).toEqual({ MEMO_LOCKED: 1 });

  await useBranch(page.context(), HALL_ROAD);
  await page.goto(`/orders/${memo.id}`);
  // Fallback selectors: no testids on the order detail page (see MISSING_TESTIDS).
  // The page renders the action twice (header bar and memo banner); both open the same modal.
  await page.getByRole('button', { name: 'Convert to Final Sale' }).first().click();
  await page.getByRole('button', { name: /Full Paid/ }).click();
  await page.getByRole('button', { name: 'Convert & Record Payment' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'converted to FINAL' })).toBeVisible();

  const settled = await db.order.findUniqueOrThrow({ where: { id: memo.id } });
  expect(settled.status).toBe('FINAL');
  expect(settled.paymentStatus).toBe('PAID');
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1 });
  expect(await postingsByAccount(memo.id)).toEqual({ REVENUE: -1800, CASH: 1800 });
  await expectLedgerBalanced(BUSINESS_A);
});
