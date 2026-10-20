import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { tenants } from '../../fixtures/users';

/** Shared helpers for the POS / cash / returns suites (not a spec: Playwright only runs *.spec.ts). */

export const HALL_ROAD = tenants.A.branches.hallRoad.id;
export const HAFEEZ = tenants.A.branches.hafeezCentre.id;
export const BUSINESS_A = tenants.A.id;

let counter = 0;
/** Short unique token so every test's records are distinguishable. */
export function uniq(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
}

export interface TestProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
}

/** Creates a product with `qty` AVAILABLE instances at `branchId` through the owner API. */
export async function createProduct(
  request: APIRequestContext,
  o: { price: number; qty: number; branchId?: string; minSalePrice?: number; cost?: number; label?: string },
): Promise<TestProduct> {
  const token = uniq();
  const name = `E2E ${o.label ?? 'Part'} ${token}`;
  const sku = `E2E-${token}`;
  const owner = await apiAs('ownerA', request);
  const branchId = o.branchId ?? HALL_ROAD;
  const res = await owner.post(
    '/product/addproduct',
    {
      name,
      sku,
      price: o.price,
      category: 'Screens',
      quantity: o.qty,
      branchId,
      defaultCostPrice: o.cost ?? Math.round(o.price / 2),
      ...(o.minSalePrice !== undefined ? { minSalePrice: o.minSalePrice } : {}),
    },
    { branchId },
  );
  expect(res.ok(), `addproduct failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return { id: body.product.id, name, sku, price: o.price };
}

export interface TestCustomer {
  id: string;
  name: string;
  phone: string;
}

export async function createCustomer(request: APIRequestContext, label = 'Cust'): Promise<TestCustomer> {
  const token = uniq();
  const name = `E2E ${label} ${token}`;
  const phone = `03${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const owner = await apiAs('ownerA', request);
  const res = await owner.post('/customer/newcustomer', { name, phone });
  expect(res.ok(), `newcustomer failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return { id: body.customer.id, name, phone };
}

export async function instanceCounts(productId: string): Promise<Record<string, number>> {
  const rows = await db.productInstance.groupBy({ by: ['status'], where: { productId }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}

/** Net posting per account for the ledger transactions of a reference id (order id, or `RET-<orderId>`). */
export async function postingsByAccount(referenceId: string, type?: string): Promise<Record<string, number>> {
  const rows = await db.posting.findMany({
    where: { transaction: { referenceId, ...(type ? { type: type as never } : {}) } },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.accountId] = (out[r.accountId] ?? 0) + Number(r.amount);
  return out;
}

export async function transactionCount(referenceId: string): Promise<number> {
  return db.transaction.count({ where: { referenceId } });
}

/** Customer receivable balance as the app reports it (API customer detail). */
export async function customerOutstanding(request: APIRequestContext, customerId: string): Promise<number> {
  const owner = await apiAs('ownerA', request);
  const res = await owner.get(`/customer/${customerId}`);
  expect(res.ok()).toBeTruthy();
  return Number((await res.json()).customer.metrics.outstandingBalance);
}

/** Receivable balance straight from the ledger (sum of postings on the customer account). */
export async function customerLedgerBalance(customerId: string): Promise<number> {
  const agg = await db.posting.aggregate({ where: { accountId: customerId }, _sum: { amount: true } });
  return Number(agg._sum.amount ?? 0);
}

export async function orderIdsBefore(): Promise<string[]> {
  return (await db.order.findMany({ where: { businessId: BUSINESS_A }, select: { id: true } })).map((o) => o.id);
}

/** The single order created after `before`, polled until it appears. */
export async function newOrderSince(before: string[]) {
  await expect
    .poll(() => db.order.count({ where: { businessId: BUSINESS_A, id: { notIn: before } } }))
    .toBe(1);
  return db.order.findFirstOrThrow({
    where: { businessId: BUSINESS_A, id: { notIn: before } },
    include: { items: true, payments: true },
  });
}

export interface SaleInput {
  items: { productId?: string; quantity: number; price: number; isService?: boolean; serviceName?: string }[];
  customerId?: string;
  amountPaid: number;
  discount?: number;
  paymentMethod?: 'CASH' | 'BANK';
  orderStatus?: 'FINAL' | 'MEMO';
  branchId?: string;
  as?: 'ownerA' | 'managerA' | 'staffA';
}

/** Creates a sale through the API (setup for returns / settle tests). */
export async function createSaleViaApi(request: APIRequestContext, s: SaleInput) {
  const api = await apiAs(s.as ?? 'ownerA', request);
  const branchId = s.branchId ?? HALL_ROAD;
  const res = await api.post(
    '/order/neworder',
    {
      items: s.items,
      customerId: s.customerId,
      amountPaid: s.amountPaid,
      discount: s.discount ?? 0,
      paymentMethod: s.paymentMethod ?? 'CASH',
      orderStatus: s.orderStatus ?? 'FINAL',
      branchId,
    },
    { branchId },
  );
  expect(res.ok(), `neworder failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return db.order.findUniqueOrThrow({
    where: { id: body.order.id },
    include: { items: true, payments: true },
  });
}

/** Searches the POS catalogue and adds the exact product to the cart. */
export async function addToCart(page: Page, term: string, productName: string): Promise<void> {
  await page.getByTestId('pos-search').fill(term);
  const row = page.getByTestId('pos-result-row').filter({ hasText: productName });
  await expect(row).toHaveCount(1);
  const before = await page.getByTestId('pos-cart-row').count();
  await row.getByTestId('pos-add-item').click();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(before + 1);
}

export async function openCheckout(page: Page): Promise<void> {
  await page.getByTestId('pos-checkout').click();
  await expect(page.getByTestId('checkout-drawer')).toBeVisible();
}

export async function pickExistingCustomer(page: Page, c: TestCustomer): Promise<void> {
  await page.getByTestId('pos-customer-mode-existing').click();
  await page.getByTestId('pos-customer-select').fill(c.name);
  await page.getByTestId('pos-customer-option').filter({ hasText: c.name }).first().click();
}

export async function submitCheckout(page: Page): Promise<void> {
  await page.getByTestId('checkout-submit').click();
  await expect(page.getByTestId('checkout-drawer')).toHaveAttribute('aria-hidden', 'true');
}
