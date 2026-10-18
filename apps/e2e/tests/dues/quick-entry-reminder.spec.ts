import { test, expect, type Page } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { karachiMorningIso } from '../../helpers/clock';
import { tenants } from '../../fixtures/users';

test.use({ storageState: storage('ownerA') });

// One flow, split into serial steps so a bug in one step (WhatsApp button) does not hide the others.
test.describe.configure({ mode: 'serial' });

let entryId = '';

const dueRow = (page: Page) =>
  page.locator(`[data-testid="dues-row"][data-entity-type="KHATA_ENTRY"][data-entity-id="${entryId}"]`);

test('quick Lena entry is saved and listed on /dues', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByTestId('header-quick-khata').click();
  await expect(page.getByTestId('quick-khata-modal')).toBeVisible();
  await page.getByTestId('quick-khata-dir-lena').click();
  await page.getByTestId('quick-khata-party').fill('Rana Electronics');
  await page.getByTestId('quick-khata-phone').fill('0300-1234567');
  await page.getByTestId('quick-khata-amount').fill('2000');
  await page.getByTestId('quick-khata-due-chip').and(page.locator('[data-days="7"]')).click();
  await page.getByTestId('quick-khata-submit').click();
  await expect(page.getByText('Entry saved')).toBeVisible();
  await expect(page.getByTestId('quick-khata-modal')).toBeHidden();

  const entry = await db.khataEntry.findFirstOrThrow({
    where: { businessId: tenants.A.id, partyName: 'Rana Electronics' },
  });
  entryId = entry.id;
  expect(entry.direction).toBe('RECEIVABLE');
  expect(entry.partyPhone).toBe('0300-1234567');
  expect(Number(entry.amount)).toBe(2000);
  expect(entry.status).toBe('OPEN');

  await page.goto('/dues');
  await expect(page.getByTestId('dues-page')).toBeVisible();
  await page.getByTestId('dues-tab-lena').click();
  const row = page
    .getByTestId('dues-row')
    .filter({ has: page.getByTestId('dues-row-party').filter({ hasText: 'Rana Electronics' }) });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('dues-row-amount')).toContainText('2,000');
});

test('overdue reminder lands in the bell once and deep-links to the row', async ({ page, request }) => {
  const api = await apiAs('ownerA', request);
  const now = karachiMorningIso(10); // due is today + 7, so this is due + 3 days
  const run1 = await api.post('/reminders/run', { now });
  expect(run1.ok()).toBeTruthy();
  expect((await run1.json()).fired).toBeGreaterThanOrEqual(1);

  // Duplicate protection: the same clock fires nothing new
  const run2 = await api.post('/reminders/run', { now });
  expect(run2.ok()).toBeTruthy();
  expect((await run2.json()).fired).toBe(0);

  await page.goto('/dashboard');
  await expect(page.getByTestId('notif-count')).toBeVisible();
  expect(Number((await page.getByTestId('notif-count').innerText()).trim())).toBeGreaterThanOrEqual(1);
  await page.getByTestId('notif-bell').click();
  await expect(page.getByTestId('notif-dropdown')).toBeVisible();
  const item = page.getByTestId('notif-item').filter({ hasText: 'Rana Electronics' }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/dues/);
  await expect(dueRow(page)).toBeVisible();
  await expect(dueRow(page).getByTestId('dues-row-party')).toContainText('Rana Electronics');
});

test('WhatsApp action opens a wa.me link with the amount and logs a reminder', async ({ page }) => {
  // Receivable rows must offer WhatsApp. Fails today: DueRow compares item.direction to lowercase
  // "receivable" while the API returns "RECEIVABLE", so the button is never rendered.

  await page.addInitScript(() => {
    (window as any).__opened = [];
    window.open = (u?: any) => {
      (window as any).__opened.push(String(u));
      return null;
    };
  });
  await page.goto(`/dues?focus=KHATA_ENTRY:${entryId}`);
  await page.getByTestId('dues-tab-lena').click();
  const row = dueRow(page);
  await expect(row).toBeVisible();
  const before = await db.dueReminder.count({ where: { entityId: entryId } });
  await row.getByTestId('dues-action-whatsapp').click({ timeout: 5000 });
  await expect
    .poll(() => page.evaluate(() => (window as any).__opened.length))
    .toBeGreaterThanOrEqual(1);
  const opened: string[] = await page.evaluate(() => (window as any).__opened);
  expect(opened[0].startsWith('https://wa.me/923001234567?text=')).toBe(true);
  expect(decodeURIComponent(opened[0].split('?text=')[1])).toContain('Rs 2,000');
  await expect
    .poll(() => db.dueReminder.count({ where: { entityId: entryId } }))
    .toBeGreaterThan(before);
});

test('full payment settles the entry and removes it from Lena', async ({ page }) => {
  await page.goto(`/dues?focus=KHATA_ENTRY:${entryId}`);
  await page.getByTestId('dues-tab-lena').click();
  const row = dueRow(page);
  await expect(row).toBeVisible();
  await row.getByTestId('dues-action-pay').click();
  await expect(page.getByTestId('dues-pay-modal')).toBeVisible();
  await page.getByTestId('dues-pay-amount').fill('2000');
  await page.getByTestId('dues-pay-submit').click();
  await expect(row).toHaveCount(0);

  const settled = await db.khataEntry.findUniqueOrThrow({ where: { id: entryId } });
  expect(settled.status).toBe('SETTLED');
  expect(Number(settled.settledAmount)).toBe(2000);
  await expectLedgerBalanced(tenants.A.id);
});
