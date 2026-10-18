import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { karachiDatePlus } from '../../helpers/clock';
import { catalog } from '../../fixtures/catalog';
import { tenants } from '../../fixtures/users';

test.use({ storageState: storage('ownerA') });

test('credit sale with due date shows on Lena and updates after a partial payment', async ({ page }) => {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: catalog.creditOrder.customerId } });
  expect(customer.phone).toBeTruthy();
  const before = await db.order.findMany({ where: { businessId: tenants.A.id }, select: { id: true } });

  await page.goto('/orders/new');
  await page.getByTestId('pos-search').fill('Keyboard');
  const result = page.getByTestId('pos-result-row').filter({ hasText: catalog.keyboard840.name });
  await expect(result).toHaveCount(1);
  await result.getByTestId('pos-add-item').click();
  await expect(page.getByTestId('pos-cart-row')).toHaveCount(1);

  await page.getByTestId('pos-checkout').click();
  await expect(page.getByTestId('checkout-drawer')).toBeVisible();
  await page.getByRole('button', { name: 'Existing Account' }).click();
  await page.getByTestId('pos-customer-select').fill(customer.name);
  await page.getByRole('button', { name: customer.phone!, exact: false }).first().click();

  const paid = 1000;
  await page.getByTestId('checkout-amount').fill(String(paid));
  await expect(page.getByTestId('checkout-due-date')).toBeVisible();
  await page.getByTestId('checkout-due-chip').and(page.locator('[data-days="14"]')).click();
  await expect(page.getByTestId('checkout-due-date')).toHaveValue(karachiDatePlus(14));
  await page.getByTestId('checkout-submit').click();
  await expect(page.getByTestId('checkout-drawer')).toHaveAttribute('aria-hidden', 'true');

  const order = await expect
    .poll(async () => {
      const all = await db.order.findMany({
        where: { businessId: tenants.A.id, id: { notIn: before.map((o) => o.id) } },
      });
      return all.length;
    })
    .toBe(1)
    .then(() =>
      db.order.findFirstOrThrow({
        where: { businessId: tenants.A.id, id: { notIn: before.map((o) => o.id) } },
      }),
    );
  expect(order.customerId).toBe(customer.id);
  expect(order.paymentStatus).toBe('PARTIAL');
  expect(order.dueDate).not.toBeNull();
  // Due date stored as the Karachi calendar day + 14 (allow the stored instant to fall on that day in Karachi)
  const storedKarachi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(order.dueDate!);
  expect(storedKarachi).toBe(karachiDatePlus(14));

  const total = Number(order.totalAmount);
  const open = total - paid;
  expect(open).toBeGreaterThan(0);

  await page.goto('/dues');
  await page.getByTestId('dues-tab-lena').click();
  const row = page.locator(`[data-testid="dues-row"][data-entity-id="${order.id}"]`);
  await expect(row).toBeVisible();
  const fmt = (n: number) => n.toLocaleString('en-US');
  await expect(row.getByTestId('dues-row-amount')).toContainText(fmt(open));

  const partial = 500;
  await row.getByTestId('dues-action-pay').click();
  await expect(page.getByTestId('dues-pay-modal')).toBeVisible();
  await page.getByTestId('dues-pay-amount').fill(String(partial));
  await page.getByTestId('dues-pay-submit').click();

  await expect(row).toBeVisible();
  await expect(row.getByTestId('dues-row-amount')).toContainText(fmt(open - partial));
  const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.paymentStatus).toBe('PARTIAL');
  const paidSum = await db.payment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
  expect(Number(paidSum._sum.amount)).toBe(paid + partial);
  await expectLedgerBalanced(tenants.A.id);
});
