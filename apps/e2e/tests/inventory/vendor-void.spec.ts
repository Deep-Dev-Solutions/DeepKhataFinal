import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

test.describe('vendors: void a wrong payment', () => {
  test('an owner voids a 10,000,000 typo, the balance returns and both entries stay in the ledger', async ({ page, request }) => {
    const owner = await apiAs('ownerA', request);
    const created = await owner.post('/vendors', {
      businessName: `E2E Void Vendor ${uniq()}`,
      contactName: 'Tester',
      phone: '03001112233',
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const vendorId = (await created.json()).vendor.id as string;

    const paid = await owner.post(`/vendors/${vendorId}/payment`, {
      amount: 10_000_000,
      description: 'Typed one extra zero',
    });
    expect(paid.ok(), await paid.text()).toBeTruthy();
    const originalId = (await paid.json()).transaction.id as string;

    await page.goto(`/vendors/${vendorId}`);
    await page.getByRole('button', { name: /^Ledger/ }).click();
    const rows = page.getByTestId('vendor-ledger-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Rs. 10,000,000');

    await rows.first().getByTestId('vendor-tx-void').click();
    const dialog = page.getByTestId('vendor-tx-void-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('vendor-tx-void-confirm')).toBeDisabled();

    await page
      .getByTestId('vendor-tx-void-reason')
      .fill('Typed an extra zero while entering the payment');
    await page.getByTestId('vendor-tx-void-confirm').click();
    await expect(dialog).toBeHidden();

    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('vendor-tx-voided-badge').first()).toContainText(
      'Voided by',
    );
    await expect(page.getByTestId('vendor-tx-voided-badge').first()).toContainText(
      'Typed an extra zero while entering the payment',
    );
    await expect(rows.filter({ hasText: 'REVERSAL' })).toHaveCount(1);
    await expect(page.getByTestId('vendor-balance').first()).toContainText('Rs. 0');

    const original = await db.transaction.findUniqueOrThrow({
      where: { id: originalId },
      select: { voidedAt: true, voidReason: true, voidedById: true },
    });
    expect(original.voidedAt).toBeTruthy();
    expect(original.voidReason).toBe(
      'Typed an extra zero while entering the payment',
    );
    expect(original.voidedById).toBeTruthy();

    const reversal = await db.transaction.findFirstOrThrow({
      where: { reversesId: originalId },
    });
    expect(reversal.type).toBe('VENDOR_PAYMENT_REVERSAL');
    await expectLedgerBalanced();
  });
});
