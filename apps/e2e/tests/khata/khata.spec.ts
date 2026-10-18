import { test, expect, type Page } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { expectLedgerBalanced } from '../../helpers/ledger';
import { karachiDatePlus } from '../../helpers/clock';
import { tenants } from '../../fixtures/users';
import { uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

const BUSINESS_A = tenants.A.id;
const fmt = (n: number) => n.toLocaleString('en-US');

/** Net posting per account type for the ledger transactions that reference `entryId`. */
async function khataPostings(entryId: string, type?: string): Promise<Record<string, number>> {
  const rows = await db.posting.findMany({
    where: { transaction: { referenceId: entryId, ...(type ? { type } : {}) } },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.accountType] = (out[r.accountType] ?? 0) + Number(r.amount);
  return out;
}

async function createViaQuickEntry(
  page: Page,
  o: { direction: 'lena' | 'dena'; party: string; amount: number; phone?: string },
) {
  await page.goto('/dashboard');
  await page.getByTestId('header-quick-khata').click();
  await expect(page.getByTestId('quick-khata-modal')).toBeVisible();
  await page.getByTestId(`quick-khata-dir-${o.direction}`).click();
  await page.getByTestId('quick-khata-party').fill(o.party);
  if (o.phone) await page.getByTestId('quick-khata-phone').fill(o.phone);
  await page.getByTestId('quick-khata-amount').fill(String(o.amount));
  await page.getByTestId('quick-khata-due-chip').and(page.locator('[data-days="7"]')).click();
  await page.getByTestId('quick-khata-submit').click();
  await expect(page.locator('[data-testid="toast"][data-type="success"]')).toContainText('Entry saved');
  await expect(page.getByTestId('quick-khata-modal')).toBeHidden();
  return db.khataEntry.findFirstOrThrow({ where: { businessId: BUSINESS_A, partyName: o.party } });
}

const rowFor = (page: Page, entryId: string) =>
  page.locator(`[data-testid="dues-row"][data-entity-type="KHATA_ENTRY"][data-entity-id="${entryId}"]`);

async function payFromDues(page: Page, entryId: string, tab: 'lena' | 'dena', amount: number) {
  await page.goto(`/dues?focus=KHATA_ENTRY:${entryId}`);
  await page.getByTestId(`dues-tab-${tab}`).click();
  const row = rowFor(page, entryId);
  await expect(row).toBeVisible();
  await row.getByTestId('dues-action-pay').click();
  await expect(page.getByTestId('dues-pay-modal')).toBeVisible();
  await page.getByTestId('dues-pay-amount').fill(String(amount));
  await page.getByTestId('dues-pay-submit').click();
  await expect(page.getByTestId('dues-pay-modal')).toBeHidden();
  return row;
}

async function createOther(
  request: Parameters<typeof apiAs>[1],
  direction: 'RECEIVABLE' | 'PAYABLE',
  amount: number,
  label: string,
): Promise<string> {
  const api = await apiAs('ownerA', request);
  const res = await api.post('/khata-entries', {
    direction,
    partyType: 'OTHER',
    partyName: `E2E ${label} ${uniq()}`,
    amount,
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id as string;
}

test.describe('khata: create', () => {
  test('lena entry: row, due date and OTHER_AR posting against cash', async ({ page }) => {
    const party = `E2E Lena ${uniq()}`;
    const entry = await createViaQuickEntry(page, { direction: 'lena', party, amount: 3200, phone: '0300-5550101' });

    expect(entry.direction).toBe('RECEIVABLE');
    expect(entry.partyType).toBe('OTHER');
    expect(entry.status).toBe('OPEN');
    expect(Number(entry.amount)).toBe(3200);
    expect(Number(entry.settledAmount)).toBe(0);
    expect(entry.partyPhone).toBe('0300-5550101');
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(entry.dueDate)).toBe(karachiDatePlus(7));

    // Ledger: money we are owed is a debit on OTHER_AR (accountId = entry id), cash goes out.
    const posts = await db.posting.findMany({ where: { transaction: { referenceId: entry.id } } });
    expect(posts).toHaveLength(2);
    expect(await khataPostings(entry.id)).toEqual({ OTHER_AR: 3200, ASSET: -3200 });
    expect(posts.find((p) => p.accountType === 'OTHER_AR')!.accountId).toBe(entry.id);
    await expectLedgerBalanced(BUSINESS_A);

    await page.goto('/dues');
    await page.getByTestId('dues-tab-lena').click();
    const row = rowFor(page, entry.id);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('dues-row-party')).toContainText(party);
    await expect(row.getByTestId('dues-row-amount')).toContainText(fmt(3200));
  });

  test('dena entry: shows on Dena (not Lena) with OTHER_AP posting', async ({ page }) => {
    const party = `E2E Dena ${uniq()}`;
    const entry = await createViaQuickEntry(page, { direction: 'dena', party, amount: 1800 });

    expect(entry.direction).toBe('PAYABLE');
    expect(entry.status).toBe('OPEN');
    // Payable: cash comes in, OTHER_AP is credited.
    expect(await khataPostings(entry.id)).toEqual({ ASSET: 1800, OTHER_AP: -1800 });
    await expectLedgerBalanced(BUSINESS_A);

    await page.goto(`/dues?focus=KHATA_ENTRY:${entry.id}`);
    await page.getByTestId('dues-tab-dena').click();
    const row = rowFor(page, entry.id);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('dues-row-amount')).toContainText(fmt(1800));
    await page.getByTestId('dues-tab-lena').click();
    await expect(rowFor(page, entry.id)).toHaveCount(0);
  });

  test('quick entry validation: zero amount is refused and nothing is written', async ({ page }) => {
    const party = `E2E Bad ${uniq()}`;
    await page.goto('/dashboard');
    await page.getByTestId('header-quick-khata').click();
    await page.getByTestId('quick-khata-party').fill(party);
    await page.getByTestId('quick-khata-amount').fill('0');
    await page.getByTestId('quick-khata-due-chip').and(page.locator('[data-days="7"]')).click();
    await page.getByTestId('quick-khata-submit').click();
    await expect(page.getByTestId('quick-khata-error')).toBeVisible();
    await expect(page.getByTestId('quick-khata-modal')).toBeVisible();
    expect(await db.khataEntry.count({ where: { businessId: BUSINESS_A, partyName: party } })).toBe(0);
  });
});

test.describe('khata: settle', () => {
  test('partial then full settle of a lena: status, amounts and ledger follow', async ({ page, request }) => {
    const entryId = await createOther(request, 'RECEIVABLE', 5000, 'Settle');

    // Partial: Rs 1,500 of 5,000 through the Dues UI.
    const row = await payFromDues(page, entryId, 'lena', 1500);
    await expect(row.getByTestId('dues-row-amount')).toContainText(fmt(3500));
    let e = await db.khataEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(e.status).toBe('PARTIAL');
    expect(Number(e.settledAmount)).toBe(1500);
    expect(await khataPostings(entryId, 'KHATA_SETTLEMENT')).toEqual({ ASSET: 1500, OTHER_AR: -1500 });

    // Full: the remaining 3,500.
    await payFromDues(page, entryId, 'lena', 3500);
    await expect(rowFor(page, entryId)).toHaveCount(0);
    e = await db.khataEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(e.status).toBe('SETTLED');
    expect(Number(e.settledAmount)).toBe(5000);

    // OTHER_AR nets to zero across creation + both settlements.
    expect(await khataPostings(entryId)).toEqual({ OTHER_AR: 0, ASSET: 0 });
    const txns = await db.transaction.findMany({ where: { referenceId: entryId }, orderBy: { createdAt: 'asc' } });
    expect(txns.map((t) => t.type)).toEqual(['KHATA_ENTRY', 'KHATA_SETTLEMENT', 'KHATA_SETTLEMENT']);
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('dena settle moves cash out and clears OTHER_AP', async ({ page, request }) => {
    const entryId = await createOther(request, 'PAYABLE', 2400, 'DenaSettle');

    const row = await payFromDues(page, entryId, 'dena', 900);
    await expect(row.getByTestId('dues-row-amount')).toContainText(fmt(1500));
    expect(await khataPostings(entryId, 'KHATA_SETTLEMENT')).toEqual({ OTHER_AP: 900, ASSET: -900 });
    expect((await db.khataEntry.findUniqueOrThrow({ where: { id: entryId } })).status).toBe('PARTIAL');

    await payFromDues(page, entryId, 'dena', 1500);
    await expect(rowFor(page, entryId)).toHaveCount(0);
    const e = await db.khataEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(e.status).toBe('SETTLED');
    expect(await khataPostings(entryId)).toEqual({ OTHER_AP: 0, ASSET: 0 });
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('settle API refuses over-settling, zero and already-settled entries without posting', async ({ request }) => {
    const api = await apiAs('ownerA', request);
    const id = await createOther(request, 'RECEIVABLE', 1000, 'Over');

    const over = await api.post(`/khata-entries/${id}/settle`, { amount: 1000.01 });
    expect(over.status()).toBe(400);
    expect(await over.text()).toContain('exceeds open balance');
    expect((await api.post(`/khata-entries/${id}/settle`, { amount: 0 })).status()).toBe(400);
    expect((await api.post(`/khata-entries/${id}/settle`, { amount: -5 })).status()).toBe(400);
    expect(await db.transaction.count({ where: { referenceId: id, type: 'KHATA_SETTLEMENT' } })).toBe(0);

    expect((await api.post(`/khata-entries/${id}/settle`, { amount: 1000 })).ok()).toBeTruthy();
    const again = await api.post(`/khata-entries/${id}/settle`, { amount: 1 });
    expect(again.status()).toBe(400);
    expect(await again.text()).toContain('SETTLED');
    expect(await db.transaction.count({ where: { referenceId: id, type: 'KHATA_SETTLEMENT' } })).toBe(1);
    await expectLedgerBalanced(BUSINESS_A);
  });

  test('write-off moves the open balance to BAD_DEBT and is lena-only', async ({ request }) => {
    const api = await apiAs('ownerA', request);
    const lenaId = await createOther(request, 'RECEIVABLE', 800, 'WO');
    expect((await api.post(`/khata-entries/${lenaId}/settle`, { amount: 300 })).ok()).toBeTruthy();
    const wo = await api.post(`/khata-entries/${lenaId}/write-off`, { reason: 'bhaag gaya' });
    expect(wo.ok(), await wo.text()).toBeTruthy();
    expect((await db.khataEntry.findUniqueOrThrow({ where: { id: lenaId } })).status).toBe('WRITTEN_OFF');
    expect(await khataPostings(lenaId, 'KHATA_WRITE_OFF')).toEqual({ BAD_DEBT_EXPENSE: 500, OTHER_AR: -500 });
    expect((await khataPostings(lenaId)).OTHER_AR).toBe(0);

    const denaId = await createOther(request, 'PAYABLE', 100, 'WO2');
    expect((await api.post(`/khata-entries/${denaId}/write-off`, {})).status()).toBe(400);
    await expectLedgerBalanced(BUSINESS_A);
  });
});

test.describe('khata: tenant isolation and roles', () => {
  test('tenant B gets 404 on every operation against a tenant A entry', async ({ request }) => {
    const id = await createOther(request, 'RECEIVABLE', 700, 'Iso');
    const b = await apiAs('ownerB', request);

    expect((await b.get(`/khata-entries/${id}`)).status()).toBe(404);
    expect((await b.patch(`/khata-entries/${id}`, { note: 'hijack' })).status()).toBe(404);
    expect((await b.post(`/khata-entries/${id}/settle`, { amount: 100 })).status()).toBe(404);
    expect((await b.post(`/khata-entries/${id}/write-off`, { reason: 'x' })).status()).toBe(404);
    expect((await b.post(`/khata-entries/${id}/promote`, {})).status()).toBe(404);

    // Untouched, and not listed for B.
    const e = await db.khataEntry.findUniqueOrThrow({ where: { id } });
    expect(e.status).toBe('OPEN');
    expect(Number(e.settledAmount)).toBe(0);
    expect(e.note).toBeNull();
    const listB = (await (await b.get('/khata-entries')).json()) as { id: string }[];
    expect(listB.some((x) => x.id === id)).toBe(false);
    expect(await db.transaction.count({ where: { referenceId: id } })).toBe(1);
  });

  test('a tenant B customer cannot be attached to a tenant A entry', async ({ request }) => {
    const a = await apiAs('ownerA', request);
    const customerB = await db.customer.findFirstOrThrow({ where: { businessId: tenants.B.id } });
    const res = await a.post('/khata-entries', {
      direction: 'RECEIVABLE',
      partyType: 'CUSTOMER',
      customerId: customerB.id,
      amount: 100,
    });
    expect(res.status()).toBe(404);
  });

  test('role matrix: staff cannot read or create khata, manager cannot write off', async ({ request }) => {
    const staff = await apiAs('staffA', request);
    const party = `E2E StaffTry ${uniq()}`;
    const create = await staff.post('/khata-entries', { direction: 'RECEIVABLE', partyType: 'OTHER', partyName: party, amount: 50 });
    expect(create.status()).toBe(403);
    expect((await staff.get('/khata-entries')).status()).toBe(403);
    expect(await db.khataEntry.count({ where: { businessId: BUSINESS_A, partyName: party } })).toBe(0);

    const id = await createOther(request, 'RECEIVABLE', 400, 'MgrWO');
    const manager = await apiAs('managerA', request);
    expect((await manager.post(`/khata-entries/${id}/write-off`, {})).status()).toBe(403);
    expect((await manager.post(`/khata-entries/${id}/settle`, { amount: 100 })).ok()).toBeTruthy();
    const e = await db.khataEntry.findUniqueOrThrow({ where: { id } });
    expect(e.status).toBe('PARTIAL');
    expect(Number(e.settledAmount)).toBe(100);
  });
});
