import { test, expect, type APIRequestContext } from '@playwright/test';
import { storage } from '../../helpers/auth';
import { useBranch } from '../../helpers/branch';
import { apiAs } from '../../helpers/api';
import { db } from '../../helpers/db';
import { tenants } from '../../fixtures/users';
import { BUSINESS_A, HALL_ROAD, HAFEEZ } from '../pos/support';

test.use({ storageState: storage('ownerA') });

const HALL_NAME = tenants.A.branches.hallRoad.name;
const HAFEEZ_NAME = tenants.A.branches.hafeezCentre.name;

async function closeBranch(request: APIRequestContext, branchId: string) {
  const open = await db.cashRegisterSession.count({
    where: { businessId: BUSINESS_A, branchId, status: 'OPEN' },
  });
  if (open > 0) {
    const owner = await apiAs('ownerA', request);
    const res = await owner.post(
      '/cash/register/close',
      { actualCash: '0', notes: 'E2E cleanup close' },
      { branchId },
    );
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

test('the galla follows the active branch with no branch picker', async ({ page, request }) => {
  await closeBranch(request, HALL_ROAD);
  const owner = await apiAs('ownerA', request);

  // Give Hafeez an open galla so the two branches read differently.
  const hafeezWasOpen = (await db.cashRegisterSession.count({
    where: { businessId: BUSINESS_A, branchId: HAFEEZ, status: 'OPEN' },
  })) > 0;
  if (!hafeezWasOpen) {
    await owner.post('/cash/register/open', { openingBalance: 700 }, { branchId: HAFEEZ });
  }
  await owner.post('/cash/register/open', { openingBalance: 2000 }, { branchId: HALL_ROAD });

  await useBranch(page.context(), HALL_ROAD);
  await page.goto('/cash');
  await expect(page.getByTestId('cash-branch-label')).toContainText(HALL_NAME);
  await expect(page.getByTestId('cash-close-register')).toBeVisible();
  await expect(page.getByText('Shop Branch')).toHaveCount(0);

  // Switch the active branch and reload: the same page now shows Hafeez's galla.
  await useBranch(page.context(), HAFEEZ);
  await page.reload();
  await expect(page.getByTestId('cash-branch-label')).toContainText(HAFEEZ_NAME);
  await expect(page.getByTestId('cash-close-register')).toBeVisible();

  // Hall Road is still open in the database: the page never wrote to another branch.
  expect(
    await db.cashRegisterSession.count({
      where: { businessId: BUSINESS_A, branchId: HALL_ROAD, status: 'OPEN' },
    }),
  ).toBe(1);

  await closeBranch(request, HALL_ROAD);
  if (!hafeezWasOpen) await closeBranch(request, HAFEEZ);

  await page.reload();
  await expect(page.getByTestId('cash-branch-label')).toContainText(HAFEEZ_NAME);
});
