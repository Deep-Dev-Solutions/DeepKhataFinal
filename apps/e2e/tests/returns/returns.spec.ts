import { test, expect, type Page } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import {
  BUSINESS_A,
  createCustomer,
  createProduct,
  createSaleViaApi,
  customerLedgerBalance,
  customerOutstanding,
  HALL_ROAD,
  instanceCounts,
  postingsByAccount,
} from '../pos/support';

test.use({ storageState: storage('ownerA') });

/**
 * Return UI on /orders/[id]: per-line "Process Return/Refund" icon button -> modal with quantity -> "Confirm Return".
 * No testids exist there (see MISSING_TESTIDS), so title / label / role fallbacks are used.
 */
async function returnViaUi(page: Page, orderId: string, qty: number): Promise<void> {
  await useBranch(page.context(), HALL_ROAD);
  await page.goto(`/orders/${orderId}`);
  await page.getByTitle('Process Return/Refund').click();
  await page.getByRole('spinbutton').fill(String(qty));
  await page.getByRole('button', { name: 'Confirm Return' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Return processed successfully' })).toBeVisible();
}

test('full return of a paid walk-in sale restores stock, refunds cash and reverses the ledger', async ({ page, request }) => {
  const product = await createProduct(request, { price: 1500, qty: 3, label: 'RetFull' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 2, price: 1500 }],
    amountPaid: 3000,
  });
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 2, AVAILABLE: 1 });

  await returnViaUi(page, order.id, 2);

  const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe('RETURNED');
  expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 3 });
  const movement = await db.inventoryMovement.findFirstOrThrow({ where: { referenceId: order.id, referenceType: 'RETURN' } });
  expect(movement.direction).toBe('IN');
  expect(movement.quantity).toBe(2);

  // Sale posted REVENUE -3000 / CASH +3000; the return reverses exactly that.
  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 3000, CASH: -3000 });
  const net = await postingsByAccount(order.id);
  expect(net).toEqual({ REVENUE: -3000, CASH: 3000 });
  await expectLedgerBalanced(BUSINESS_A);

  // The return action is no longer offered.
  await page.reload();
  await expect(page.getByTitle('Process Return/Refund')).toBeDisabled();
});

test('partial return of a paid walk-in sale refunds the returned share and restores only those units', async ({ page, request }) => {
  const product = await createProduct(request, { price: 1000, qty: 4, label: 'RetPart' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 3, price: 1000 }],
    amountPaid: 3000,
  });
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 3, AVAILABLE: 1 });

  await returnViaUi(page, order.id, 1);

  expect(await instanceCounts(product.id)).toEqual({ SOLD: 2, AVAILABLE: 2 });
  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 1000, CASH: -1000 });
  const movement = await db.inventoryMovement.findFirstOrThrow({ where: { referenceId: order.id, referenceType: 'RETURN' } });
  expect(movement.quantity).toBe(1);
  await expectLedgerBalanced(BUSINESS_A);
});

// Regression (S3, fixed): a partial return used to set the whole order to RETURNED, blocking the remaining units.
test('after a partial return the order stays returnable for the remaining units', async ({ request }) => {
  const product = await createProduct(request, { price: 1000, qty: 3, label: 'RetTwice' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 3, price: 1000 }],
    amountPaid: 3000,
  });
  const owner = await apiAs('ownerA', request);
  const first = await owner.post(`/order/${order.id}/return`, { itemsToReturn: [{ productId: product.id, quantity: 1 }] });
  expect(first.ok(), await first.text()).toBeTruthy();
  const second = await owner.post(`/order/${order.id}/return`, { itemsToReturn: [{ productId: product.id, quantity: 1 }] });
  expect(second.ok(), `second partial return rejected: ${await second.text()}`).toBeTruthy();
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 2 });
});

test('full return of an unpaid credit sale clears the customer balance', async ({ page, request }) => {
  const customer = await createCustomer(request, 'RetCredit');
  const product = await createProduct(request, { price: 4000, qty: 2, label: 'RetCredit' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 1, price: 4000 }],
    customerId: customer.id,
    amountPaid: 0,
  });
  expect(await customerOutstanding(request, customer.id)).toBe(4000);

  await returnViaUi(page, order.id, 1);

  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('RETURNED');
  expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 2 });
  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 4000, [customer.id]: -4000 });
  expect(await customerOutstanding(request, customer.id)).toBe(0);
  expect(await customerLedgerBalance(customer.id)).toBe(0);
  await expectLedgerBalanced(BUSINESS_A);
});

test('partial return of a credit sale drops the customer balance by the returned net amount', async ({ page, request }) => {
  const customer = await createCustomer(request, 'RetCreditPart');
  const product = await createProduct(request, { price: 1000, qty: 4, label: 'RetCreditPart' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 3, price: 1000 }],
    customerId: customer.id,
    amountPaid: 0,
  });
  expect(await customerOutstanding(request, customer.id)).toBe(3000);

  await returnViaUi(page, order.id, 1);

  expect(await instanceCounts(product.id)).toEqual({ SOLD: 2, AVAILABLE: 2 });
  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 1000, [customer.id]: -1000 });
  expect(await customerOutstanding(request, customer.id)).toBe(2000);
  expect(await customerLedgerBalance(customer.id)).toBe(2000);
  await expectLedgerBalanced(BUSINESS_A);
});

test('returning a discounted, part-paid credit sale refunds the discounted net: cash first, rest off the balance', async ({ page, request }) => {
  const customer = await createCustomer(request, 'RetDiscount');
  const product = await createProduct(request, { price: 2500, qty: 2, label: 'RetDiscount' });
  // gross 5000 - discount 500 = net 4500, paid 2000, owes 2500
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 2, price: 2500 }],
    customerId: customer.id,
    amountPaid: 2000,
    discount: 500,
  });
  expect(Number(order.totalAmount)).toBe(4500);
  expect(await customerOutstanding(request, customer.id)).toBe(2500);

  await returnViaUi(page, order.id, 2);

  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 4500, CASH: -2000, [customer.id]: -2500 });
  expect(await customerOutstanding(request, customer.id)).toBe(0);
  expect(await instanceCounts(product.id)).toEqual({ AVAILABLE: 2 });
  await expectLedgerBalanced(BUSINESS_A);
});

test('a defective return goes back to stock as DEFECTIVE, not AVAILABLE; invalid quantities are rejected', async ({ request }) => {
  const product = await createProduct(request, { price: 800, qty: 2, label: 'RetDefect' });
  const order = await createSaleViaApi(request, {
    items: [{ productId: product.id, quantity: 1, price: 800 }],
    amountPaid: 800,
  });
  const owner = await apiAs('ownerA', request);

  const tooMany = await owner.post(`/order/${order.id}/return`, { itemsToReturn: [{ productId: product.id, quantity: 2 }] });
  expect(tooMany.status()).toBe(400);
  const zero = await owner.post(`/order/${order.id}/return`, { itemsToReturn: [{ productId: product.id, quantity: 0 }] });
  expect(zero.status()).toBe(400);
  expect(await instanceCounts(product.id)).toEqual({ SOLD: 1, AVAILABLE: 1 });

  const ok = await owner.post(`/order/${order.id}/return`, {
    itemsToReturn: [{ productId: product.id, quantity: 1, returnCondition: 'DEFECTIVE' }],
  });
  expect(ok.ok(), await ok.text()).toBeTruthy();
  expect(await instanceCounts(product.id)).toEqual({ DEFECTIVE: 1, AVAILABLE: 1 });
  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 800, CASH: -800 });

  // A returned order cannot be returned again (no double refund).
  const again = await owner.post(`/order/${order.id}/return`, { itemsToReturn: [{ productId: product.id, quantity: 1 }] });
  expect(again.status()).toBe(400);
  expect(await postingsByAccount(`RET-${order.id}`)).toEqual({ REVENUE: 800, CASH: -800 });
  await expectLedgerBalanced(BUSINESS_A);
});
