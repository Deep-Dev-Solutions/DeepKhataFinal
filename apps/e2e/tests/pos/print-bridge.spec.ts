import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { addToCart, createProduct, HALL_ROAD, openCheckout, submitCheckout } from './support';

test.use({ storageState: storage('staffA') });

type RecordedCall =
  | { type: 'window.print' }
  | { type: 'bridge'; html: string; options: { width?: number } };

declare global {
  interface Window {
    __printCalls?: RecordedCall[];
  }
}

/** Walk-in cash sale so the success dialog (and its Print Slip button) opens. */
async function sellWalkIn(page: Page, label: string): Promise<void> {
  const request = page.request;
  const product = await createProduct(request, { price: 1200, qty: 2, label });
  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/orders/new');
  await addToCart(page, product.sku, product.name);
  await openCheckout(page);
  await page.getByTestId('pos-customer-mode-walkin').click();
  await page.getByTestId('pos-walkin-name').fill('Print Test');
  await page.getByTestId('pos-walkin-phone').fill('03007654321');
  await page.getByTestId('checkout-amount').fill('1200');
  await submitCheckout(page);
  await expect(page.getByTestId('pos-print-slip')).toBeVisible();
}

test.describe('receipt printing: browser vs desktop shell', () => {
  test('a plain browser tab still opens the normal print dialog', async ({ page }) => {
    await page.addInitScript(() => {
      window.__printCalls = [];
      window.print = () => {
        window.__printCalls!.push({ type: 'window.print' });
      };
    });

    await sellWalkIn(page, 'PrintBrowser');
    await page.getByTestId('pos-print-slip').click();

    await expect
      .poll(() => page.evaluate(() => window.__printCalls))
      .toEqual([{ type: 'window.print' }]);
  });

  test('inside the desktop shell the slip is handed to the thermal printer', async ({ page }) => {
    await page.addInitScript(() => {
      window.__printCalls = [];
      window.print = () => {
        window.__printCalls!.push({ type: 'window.print' });
      };
      (window as unknown as { deepkhata: unknown }).deepkhata = {
        printReceipt: async (html: string, options: { width?: number }) => {
          window.__printCalls!.push({ type: 'bridge', html, options });
          return { ok: true };
        },
        openCashDrawer: async () => ({ ok: true }),
      };
    });

    await sellWalkIn(page, 'PrintDesktop');
    await page.getByTestId('pos-print-slip').click();

    await expect
      .poll(() => page.evaluate(() => window.__printCalls?.length ?? 0))
      .toBe(1);

    const calls = (await page.evaluate(() => window.__printCalls)) as RecordedCall[];
    const call = calls[0];
    expect(call.type).toBe('bridge');
    if (call.type !== 'bridge') throw new Error('expected the desktop bridge');

    expect(call.options).toEqual({ width: 80 });
    // The receipt markup travels with its styles inlined and no class hooks,
    // because the print window never loads the app stylesheet.
    expect(call.html).toContain('SALE SLIP');
    expect(call.html).not.toContain('class=');
    expect(call.html).toMatch(/display:block/);
    expect(call.html).toContain('justify-content:space-between');
  });

  test('a printer error falls back to the print dialog instead of losing the slip', async ({ page }) => {
    await page.addInitScript(() => {
      window.__printCalls = [];
      window.print = () => {
        window.__printCalls!.push({ type: 'window.print' });
      };
      (window as unknown as { deepkhata: unknown }).deepkhata = {
        printReceipt: async () => ({ ok: false, error: 'Printer offline' }),
        openCashDrawer: async () => ({ ok: true }),
      };
    });

    await sellWalkIn(page, 'PrintFallback');
    await page.getByTestId('pos-print-slip').click();

    await expect
      .poll(() => page.evaluate(() => window.__printCalls))
      .toEqual([{ type: 'window.print' }]);
  });
});
