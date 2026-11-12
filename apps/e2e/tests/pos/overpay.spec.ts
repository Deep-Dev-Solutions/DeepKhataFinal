import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  addToCart,
  BUSINESS_A,
  createProduct,
  HALL_ROAD,
  newOrderSince,
  openCheckout,
  orderIdsBefore,
  submitCheckout,
} from './support';

test.use({ storageState: storage('ownerA') });

test('checkout refuses an amount larger than the bill and recovers when it is corrected', async ({
  page,
  request,
}) => {
  const product = await createProduct(request, {
    price: 50000,
    qty: 1,
    label: 'Overpay',
  });
  const before = await orderIdsBefore();

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();

  await page.getByTestId('checkout-amount').fill('55000');
  await expect(page.getByTestId('checkout-overpay-error')).toContainText(
    'is more than the bill (Rs 50,000)',
  );
  await expect(page.getByTestId('checkout-submit')).toBeDisabled();

  // Nothing was sent to the API while the amount was too high.
  expect(await orderIdsBefore()).toEqual(before);

  await page.getByTestId('checkout-amount').fill('50000');
  await expect(page.getByTestId('checkout-overpay-error')).toHaveCount(0);
  await expect(page.getByTestId('checkout-submit')).toBeEnabled();
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(Number(order.totalAmount)).toBe(50000);
  expect(order.paymentStatus).toBe('PAID');
  expect(order.payments).toHaveLength(1);
  expect(Number(order.payments[0].amount)).toBe(50000);
  await expectLedgerBalanced(BUSINESS_A);
});
