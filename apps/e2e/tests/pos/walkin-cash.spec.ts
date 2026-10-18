import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { db } from '../../helpers/db';
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

test('walk-in full cash sale: order, stock, instance status, ledger and invoice', async ({ page, request }) => {
  const product = await createProduct(request, { price: 1500, qty: 3, label: 'Cash' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);

  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('pos-walkin-name').fill('Walk In Wasim');
  await page.getByTestId('pos-walkin-phone').fill('03001234567');
  await page.getByTestId('checkout-amount').fill('1500');
  await submitCheckout(page);

  const order = await newOrderSince(before);
  expect(order.status).toBe('FINAL');
  expect(order.paymentStatus).toBe('PAID');
  expect(order.customerId).toBeNull();
  expect(order.walkInName).toBe('Walk In Wasim');
  expect(order.walkInPhone).toBe('03001234567');
  expect(order.branchId).toBe(HALL_ROAD);
  expect(Number(order.totalAmount)).toBe(1500);
  expect(order.items).toHaveLength(1);
  expect(Number(order.items[0].price)).toBe(1500);
  expect(order.payments).toHaveLength(1);
  expect(order.payments[0].method).toBe('CASH');
  expect(Number(order.payments[0].amount)).toBe(1500);

  // Stock: one of three units sold, the rest untouched.
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 2 });
  const movements = await db.inventoryMovement.findMany({ where: { productId: product.id, referenceId: order.id } });
  expect(movements).toHaveLength(1);
  expect(movements[0].direction).toBe('OUT');
  expect(movements[0].quantity).toBe(1);

  // Ledger: revenue credited, cash debited, nothing on a receivable.
  expect(await postingsByAccount(order.id)).toEqual({ REVENUE: -1500, CASH: 1500 });
  await expectLedgerBalanced(BUSINESS_A);

  // Receipt: the success modal links to the order; the public invoice renders the sale.
  // Fallback selector: no testid on the success modal action (see MISSING_TESTIDS).
  await page.getByRole('button', { name: 'View Order' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText('Grand Total')).toBeVisible();

  await page.goto(`/invoice/${order.id}`);
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText('Walk-in Customer')).toBeVisible();
  await expect(page.getByText('1,500').first()).toBeVisible();
});

// S4 (cosmetic): the name typed at checkout is stored (order.walkInName) but the invoice only prints the generic
// "Walk-in Customer" (apps/client/src/app/invoice/[id]/page.tsx:216 uses customer?.name only).
test.fail('walk-in name entered at checkout is printed on the invoice', async ({ page, request }) => {
  const product = await createProduct(request, { price: 700, qty: 2, label: 'WalkName' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('pos-walkin-name').fill('Walk In Wasim');
  await page.getByTestId('checkout-amount').fill('700');
  await submitCheckout(page);
  const order = await newOrderSince(before);
  expect(order.walkInName).toBe('Walk In Wasim');
  await page.goto(`/invoice/${order.id}`);
  await expect(page.getByText('Walk In Wasim')).toBeVisible();
});

test('walk-in cannot be sent on credit: checkout is blocked client-side and the API rejects it', async ({ page, request }) => {
  const product = await createProduct(request, { price: 900, qty: 2, label: 'NoCredit' });
  const before = await orderIdsBefore();
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('checkout-amount').fill('100');
  await expect(page.getByTestId('checkout-submit')).toBeDisabled();

  // Server-side guard, bypassing the UI.
  const { apiAs } = await import('../../helpers/api');
  const api = await apiAs('staffA', request);
  const res = await api.post(
    '/order/neworder',
    { items: [{ productId: product.id, quantity: 1, price: 900 }], amountPaid: 100, orderStatus: 'FINAL', branchId: HALL_ROAD },
    { branchId: HALL_ROAD },
  );
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain('pay in full');

  expect(await db.order.count({ where: { businessId: BUSINESS_A, id: { notIn: before } } })).toBe(0);
  expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 2 });
});
