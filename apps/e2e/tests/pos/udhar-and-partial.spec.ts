import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  addToCart,
  BUSINESS_A,
  createCustomer,
  createProduct,
  customerLedgerBalance,
  customerOutstanding,
  HALL_ROAD,
  instanceCounts,
  newOrderSince,
  openCheckout,
  orderIdsBefore,
  pickExistingCustomer,
  postingsByAccount,
  submitCheckout,
} from './support';

test.use({ storageState: storage('ownerA') });

test('full udhar: existing customer, nothing paid; whole total lands on the customer account', async ({ page, request }) => {
  const customer = await createCustomer(request, 'Udhar');
  const product = await createProduct(request, { price: 2500, qty: 2, label: 'Udhar' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await pickExistingCustomer(page, customer);
  await page.getByTestId('checkout-amount').fill('0');
  await expect(page.getByTestId('checkout-balance')).toContainText('2,500');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(order.customerId).toBe(customer.id);
  expect(order.status).toBe('FINAL');
  expect(order.paymentStatus).toBe('UNPAID');
  expect(order.dueDate).not.toBeNull();
  expect(Number(order.totalAmount)).toBe(2500);
  expect(order.payments).toHaveLength(0);
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
  expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -2500, [customer.id]: 2500 });
  expect(await customerLedgerBalance(customer.id)).toBe(2500);
  expect(await customerOutstanding(request, customer.id)).toBe(2500);
  await expectLedgerBalanced(BUSINESS_A);
});

test('partial payment: cash taken now, the rest becomes udhar', async ({ page, request }) => {
  const customer = await createCustomer(request, 'Partial');
  const product = await createProduct(request, { price: 2500, qty: 2, label: 'Partial' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await pickExistingCustomer(page, customer);
  await page.getByTestId('checkout-amount').fill('1000');
  await expect(page.getByTestId('checkout-balance')).toContainText('1,500');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(order.customerId).toBe(customer.id);
  expect(order.paymentStatus).toBe('PARTIAL');
  expect(order.payments).toHaveLength(1);
  expect(Number(order.payments[0].amount)).toBe(1000);
  expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -2500, CASH: 1000, [customer.id]: 1500 });
  expect(await customerLedgerBalance(customer.id)).toBe(1500);
  expect(await customerOutstanding(request, customer.id)).toBe(1500);
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });
  await expectLedgerBalanced(BUSINESS_A);
  expect(await db.order.count({ where: { customerId: customer.id } })).toBe(1);
});
