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
  postingsByAccount,
  submitCheckout,
} from './support';

test.use({ storageState: storage('staffA') });

test('a labour line is added next to a part; revenue covers both, only the part moves stock', async ({ page, request }) => {
  const product = await createProduct(request, { price: 1200, qty: 2, label: 'Labour' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);

  await page.getByTestId('pos-service-toggle').click();
  await page.getByTestId('pos-service-name').fill('Screen Fitting');
  await page.getByTestId('pos-service-price').fill('500');
  await page.getByTestId('pos-add-service').click();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(2);
  await expect(page.getByTestId('pos-cart-row').filter({ hasText: 'Screen Fitting' })).toHaveCount(1);
  await expect(page.getByTestId('pos-total')).toContainText('1,700');

  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('checkout-amount').fill('1700');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(Number(order.totalAmount)).toBe(1700);
  expect(order.paymentStatus).toBe('PAID');
  const service = order.items.find((i) => i.isService);
  const part = order.items.find((i) => !i.isService);
  expect(service?.serviceName).toBe('Screen Fitting');
  expect(service?.productId).toBeNull();
  expect(Number(service?.price)).toBe(500);
  expect(part?.productId).toBe(product.id);
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
  expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -1700, CASH: 1700 });
  await expectLedgerBalanced(BUSINESS_A);
});

test('a service-only invoice sells without touching stock', async ({ page, request }) => {
  const product = await createProduct(request, { price: 700, qty: 1, label: 'Untouched' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await page.getByTestId('pos-service-toggle').click();
  await page.getByTestId('pos-service-name').fill('Diagnostics');
  await page.getByTestId('pos-service-price').fill('300');
  await page.getByTestId('pos-add-service').click();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(1);

  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('checkout-amount').fill('300');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(Number(order.totalAmount)).toBe(300);
  expect(order.items.every((i) => i.isService)).toBe(true);
  expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 1 });
  expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -300, CASH: 300 });
  await expectLedgerBalanced(BUSINESS_A);
});
