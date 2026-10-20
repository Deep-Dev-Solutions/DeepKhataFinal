import type { BrowserContext } from '@playwright/test';
import { tenants } from '../fixtures/users';

/** Pre-select the active branch (client reads localStorage `activeBranch_<businessId>`) before any page script runs. */
export async function useBranch(context: BrowserContext, branchId: string): Promise<void> {
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`activeBranch_${tenants.A.id}`, branchId],
  );
}
