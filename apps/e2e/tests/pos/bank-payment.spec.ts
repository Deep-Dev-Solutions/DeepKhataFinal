import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  addToCart,
  BUSINESS_A,
  createProduct,
  HALL_ROAD,
  instanceCounts,
  newOrderSince,
  openCheckout,
  orderIdsBefore,
  submitCheckout,
} from './support';

test.use({ storageState: storage('managerA') });

test('bank payment is recorded with method BANK and sells the item', async ({ page, request }) => {
  const product = await createProduct(request, { price: 3200, qty: 2, label: 'Bank' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('checkout-method').selectOption('BANK');
  await page.getByTestId('checkout-amount').fill('3200');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(order.paymentStatus).toBe('PAID');
  expect(order.payments).toHaveLength(1);
  expect(order.payments[0].method).toBe('BANK');
  expect(Number(order.payments[0].amount)).toBe(3200);
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
  await expectLedgerBalanced(BUSINESS_A);
});
