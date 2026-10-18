import { test, expect } from '@playwright/test';
import { storage, type StoredUser } from '../../helpers/auth';
import { apiAs } from '../../helpers/api';
import { E2E } from '../../env';
import { tenants } from '../../fixtures/users';

/**
 * Role matrix from apps/server/src/config/permissions.ts + Sidebar.tsx.
 * Differences between roles: STAFF lacks read:reports, read:dues, manage:team,
 * manage:business, and the Store Settings nav entry; MANAGER lacks manage:team/business
 * (Store Settings stays visible, the Management group is only hidden for STAFF).
 */
const NAV = [
  'dashboard', 'orders', 'cash', 'stock-finder', 'products', 'restock',
  'categories', 'cabinets', 'dues', 'customers', 'vendors', 'reports', 'settings',
] as const;

const visibleFor: Record<'ownerA' | 'managerA' | 'staffA', Record<(typeof NAV)[number], boolean>> = {
  ownerA: Object.fromEntries(NAV.map((n) => [n, true])) as never,
  managerA: Object.fromEntries(NAV.map((n) => [n, true])) as never,
  staffA: Object.fromEntries(NAV.map((n) => [n, !['dues', 'reports', 'settings'].includes(n)])) as never,
};

for (const role of ['ownerA', 'managerA', 'staffA'] as const) {
  test.describe(`A: role matrix UI - ${role}`, () => {
    test.use({ storageState: storage(role as StoredUser) });

    test(`sidebar shows exactly the allowed entries for ${role}`, async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('sidebar-root')).toBeVisible({ timeout: 60_000 });
      for (const item of NAV) {
        const nav = page.getByTestId(`nav-${item}`);
        if (visibleFor[role][item]) await expect(nav, `nav-${item} for ${role}`).toBeVisible();
        else await expect(nav, `nav-${item} for ${role}`).toHaveCount(0);
      }
    });
  });
}

test.describe('A: role matrix UI - denied pages (staffA)', () => {
  test.use({ storageState: storage('staffA') });

  for (const route of ['/reports', '/dues', '/settings?tab=team']) {
    test(`staff visiting ${route} gets no privileged data`, async ({ page }) => {
      const apiCalls: { url: string; status: number }[] = [];
      page.on('response', (r) => {
        if (r.url().startsWith(E2E.apiUrl)) apiCalls.push({ url: r.url(), status: r.status() });
      });
      await page.goto(route);
      await expect(page.getByTestId('sidebar-root')).toBeVisible({ timeout: 60_000 });
      // Whatever the page does (redirect, denied message, empty), no data API behind it may answer 200
      // for a permission the role lacks.
      const privileged = [/\/reports\//, /\/dues(\?|\/|$)/, /\/team\/(activemembers|pendinginvites)/];
      await page.waitForLoadState('networkidle');
      const leaked = apiCalls.filter((c) => c.status === 200 && privileged.some((p) => p.test(c.url)));
      expect(leaked, `staff received 200 from privileged APIs: ${JSON.stringify(leaked)}`).toEqual([]);
      // The team management UI (invite button) must never be reachable for staff.
      await expect(page.getByTestId('invite-modal')).toHaveCount(0);
    });
  }
});

test.describe('A: role matrix API', () => {
  const cases: { name: string; method: 'get' | 'post'; path: string; body?: unknown; allowed: Record<string, boolean>; bug?: Partial<Record<string, string>> }[] = [
    { name: 'reports', method: 'get', path: '/reports/financial', allowed: { ownerA: true, managerA: true, staffA: false }, bug: { managerA: 'reports.controller.ts @Roles(OWNER, SUPER_ADMIN) blocks MANAGER although permissions.ts grants read:reports and the sidebar shows Reports to managers' } },
    { name: 'dues list', method: 'get', path: '/dues', allowed: { ownerA: true, managerA: true, staffA: false } },
    { name: 'dues summary', method: 'get', path: '/dues/summary', allowed: { ownerA: true, managerA: true, staffA: false } },
    { name: 'team members', method: 'get', path: '/team/activemembers', allowed: { ownerA: true, managerA: false, staffA: false } },
    { name: 'team invite', method: 'post', path: '/team/invite', body: { email: '', role: 'STAFF' }, allowed: { ownerA: true, managerA: false, staffA: false } },
    { name: 'customers', method: 'get', path: '/customer/getallcustomers', allowed: { ownerA: true, managerA: true, staffA: true } },
    { name: 'products', method: 'get', path: '/product/getproducts', allowed: { ownerA: true, managerA: true, staffA: true } },
  ];
  for (const c of cases) {
    for (const role of ['ownerA', 'managerA', 'staffA'] as const) {
      test(`${c.method.toUpperCase()} ${c.path} as ${role} -> ${c.allowed[role] ? 'allowed' : '403'}`, async ({ request }) => {
        if (c.bug?.[role]) test.fail(true, c.bug[role]);
        const api = await apiAs(role, request);
        const res = await api[c.method](c.path, c.body, { branchId: tenants.A.branches.hafeezCentre.id });
        if (c.allowed[role]) {
          // allowed means "not blocked by RBAC"; business validation (e.g. empty invite email) may still 400.
          expect([401, 403], `${role} blocked on ${c.path}`).not.toContain(res.status());
        } else {
          expect(res.status(), `${role} on ${c.path}`).toBe(403);
        }
      });
    }
  }
});
