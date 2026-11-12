import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { HALL_ROAD, HAFEEZ, uniq } from '../pos/support';

test.use({ storageState: storage('ownerA') });

async function createEntry(request: APIRequestContext, branchId: string, partyName: string) {
  const owner = await apiAs('ownerA', request);
  const res = await owner.post(
    '/khata-entries',
    {
      direction: 'RECEIVABLE',
      partyType: 'OTHER',
      partyName,
      amount: 750,
      dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      counterAccount: 'REVENUE',
    },
    { branchId },
  );
  expect(res.ok(), await res.text()).toBeTruthy();
}

test('Lena rows show their branch and the branch-only toggle filters them', async ({ page, request }) => {
  const token = uniq();
  const hallParty = `E2E Hall ${token}`;
  const hafeezParty = `E2E Hafeez ${token}`;
  await createEntry(request, HALL_ROAD, hallParty);
  await createEntry(request, HAFEEZ, hafeezParty);

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/dues');

  const hallRow = page.getByTestId('dues-row').filter({ hasText: hallParty });
  const hafeezRow = page.getByTestId('dues-row').filter({ hasText: hafeezParty });
  await expect(hallRow).toHaveCount(1);
  await expect(hafeezRow).toHaveCount(1);
  await expect(hallRow.getByTestId('dues-row-branch')).toContainText('Hall Road');
  await expect(hafeezRow.getByTestId('dues-row-branch')).toContainText('Hafeez Centre');

  await page.getByTestId('dues-branch-only').click();
  await expect(hallRow).toHaveCount(1);
  await expect(hafeezRow).toHaveCount(0);
  await expect(page.getByTestId('dues-branch-only')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('dues-branch-only').click();
  await expect(hafeezRow).toHaveCount(1);
});
