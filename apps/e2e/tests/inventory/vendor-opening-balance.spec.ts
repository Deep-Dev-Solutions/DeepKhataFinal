import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

test.describe('vendors: purani udhar', () => {
  test('the vendor page has no manual purchase, and opening balance is recorded once', async ({ page, request }) => {
    const owner = await apiAs('ownerA', request);
    const created = await owner.post('/vendors', {
      businessName: `E2E Opening Vendor ${uniq()}`,
      contactName: 'Tester',
      phone: '03001112233',
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const vendorId = (await created.json()).vendor.id as string;

    await page.goto(`/vendors/${vendorId}`);
    await expect(page.getByTestId('vendor-detail')).toBeVisible();
    await expect(page.getByTestId('vendor-purchase-open')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Record Purchase' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Purchase' })).toHaveCount(0);
    await expect(page.getByText('Maal ki khareed Restock Hub se karein.')).toBeVisible();

    await page.getByTestId('vendor-opening-balance-open').click();
    await expect(page.getByText('Purani Udhar (Opening Balance)')).toBeVisible();
    await page.getByTestId('vendor-amount').fill('25000');
    await page
      .getByTestId('vendor-description')
      .fill('Udhar from the old register');
    await page.getByTestId('vendor-submit').click();
    await expect(
      page.getByText('Purani udhar recorded as an opening balance.'),
    ).toBeVisible();
    await expect(page.getByTestId('vendor-opening-balance-open')).toHaveCount(0);

    await page.getByRole('button', { name: /^Ledger/ }).click();
    const row = page.getByTestId('vendor-ledger-row');
    await expect(row).toHaveCount(1);
    await expect(row.first()).toContainText('OPENING');
    await expect(page.getByTestId('vendor-balance').first()).toContainText(
      'Rs. 25,000',
    );

    const tx = await db.transaction.findFirstOrThrow({
      where: { type: 'VENDOR_OPENING_BALANCE', postings: { some: { accountId: vendorId } } },
      include: { postings: true },
    });
    expect(tx.postings).toHaveLength(2);
    const equity = tx.postings.find((p) => p.accountId === 'OPENING_BALANCE_EQUITY');
    expect(equity?.accountType).toBe('EQUITY');
    expect(Number(equity?.amount)).toBe(25_000);
    await expectLedgerBalanced();
  });
});
