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
  postingsByAccount,
  submitCheckout,
} from './support';

test.use({ storageState: storage('ownerA') });

test('a discount lowers the total, the cash taken and the revenue posted', async ({ page, request }) => {
  const product = await createProduct(request, { price: 2000, qty: 2, label: 'Discount' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('pos-discount').fill('300');
  await expect(page.getByTestId('checkout-balance')).toContainText('1,700');
  await page.getByTestId('checkout-amount').fill('1700');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(Number(order.discount)).toBe(300);
  expect(Number(order.totalAmount)).toBe(1700);
  expect(order.paymentStatus).toBe('PAID');
  expect(Number(order.items[0].price)).toBe(2000);
  expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -1700, CASH: 1700 });
  await expectLedgerBalanced(BUSINESS_A);
});

test('a discount larger than the subtotal is rejected by the API', async ({ request }) => {
  const product = await createProduct(request, { price: 500, qty: 1, label: 'BigDiscount' });
  const { apiAs } = await import('../../helpers/api');
  const api = await apiAs('ownerA', request);
  const res = await api.post(
    '/order/neworder',
    { items: [{ productId: product.id, quantity: 1, price: 500 }], discount: 600, amountPaid: 0, orderStatus: 'FINAL', branchId: HALL_ROAD },
    { branchId: HALL_ROAD },
  );
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain('cannot exceed');
});
