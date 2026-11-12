import { test, expect } from '@playwright/test';
import { storage } from '../../helpers/auth';

test.use({ storageState: storage('ownerA') });

test('without an active branch the finder blocks transfers with a clear message', async ({ page }) => {
  // The branch fetch failing leaves activeBranchId null, which is exactly the
  // state that used to send a branch-less request and fail silently (B5).
  await page.route('**/product/getbranches', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/stock-finder');
  await expect(page.getByTestId('stock-finder-branch-warning')).toContainText(
    'Select your branch first',
  );

  const requestButton = page.getByTestId('stock-action-request').first();
  if ((await requestButton.count()) > 0) {
    await expect(requestButton).toBeDisabled();
    await expect(requestButton).toContainText('Select your branch first');
  }
});
