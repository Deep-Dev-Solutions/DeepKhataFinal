import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { E2E } from "../../env";
import { TEST_PASSWORD, users } from "../../fixtures/users";
import { db } from "../../helpers/db";
import {
  createThrowawayTenant,
  type ThrowawayTenant,
} from "../../helpers/tenant-admin";

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * P0 of the admin audit (docs/plan/runs/admin-audit.md, finding A1).
 *
 * One browser, one shared session cookie: opening view-as (or signing into the client app as a
 * shop user) replaces the console's SUPER_ADMIN session. These specs assert the FIXED behaviour,
 * so they fail on the current build:
 *   - the console must never turn a 403 into "No tenants match the selected filters"
 *   - it must show a `session-switched` notice explaining who the browser is now signed in as
 *   - "Exit view-as" appears only when the switch came from view-as
 *   - exiting restores the SUPER_ADMIN console and the tenants list
 */

const NOTICE = "session-switched";
const NOTICE_EXIT = "session-switched-exit";
const NOTICE_LOGIN = "session-switched-login";
const EMPTY_STATE = "No tenants match the selected filters.";
const RAW_403 = "Required role: SUPER_ADMIN";

async function adminLogin(page: Page) {
  await page.goto(`${E2E.adminUrl}/login`);
  await expect(page.getByTestId("agency-login-email")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("agency-login-email").fill(users.superAdmin.email);
  await page.getByTestId("agency-login-password").fill(TEST_PASSWORD);
  await page.getByTestId("agency-login-submit").click();
  await expect(page.getByTestId("tenants-page")).toBeVisible({
    timeout: 60_000,
  });
}

/**
 * The identity the console's own cookie jar presents right now: the role /user/me returns and the
 * status /agency/analytics/tenants returns. Both are probed with the tab's cookies.
 */
async function consoleIdentity(page: Page) {
  const me = await page.request.get(`${E2E.apiUrl}/user/me`);
  const meBody = me.ok() ? ((await me.json()) as { role?: string }) : null;
  const tenants = await page.request.get(
    `${E2E.apiUrl}/agency/analytics/tenants`,
  );
  return {
    meStatus: me.status(),
    role: meBody?.role ?? null,
    tenantsStatus: tenants.status(),
  };
}

/**
 * Opens a tenant detail from the console list, then returns to the list via the in-app back link.
 * The detail page renders "Back to Tenants" in both its loaded and its error branch, because on
 * the current build its own fetches are already 403.
 */
async function openTenantAndReturn(page: Page, bizName: string) {
  const row = page.getByTestId("tenant-row").filter({ hasText: bizName });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByTestId("tenant-open").click();
  const back = page.getByRole("link", { name: /Back to Tenants/i });
  await expect(back).toBeVisible({ timeout: 30_000 });
  const detailError = await page
    .getByText(RAW_403)
    .count()
    .catch(() => 0);
  if (detailError > 0) {
    console.log("[P0-EVIDENCE] tenant detail shows the raw 403 message");
  }
  await back.click();
  await expect(page).toHaveURL(`${E2E.adminUrl}/`, { timeout: 30_000 });
  await expect(page.getByTestId("tenants-page")).toBeVisible({
    timeout: 30_000,
  });
}

/** Samples the identity the console's cookie jar presents and records it as evidence. */
async function sampleIdentity(page: Page, scenario: string) {
  const identity = await consoleIdentity(page);
  const evidence = {
    scenario,
    tenantsListStatus: identity.tenantsStatus,
    meStatus: identity.meStatus,
    meRole: identity.role,
    noticeVisible: (await page.getByTestId(NOTICE).count()) > 0,
    emptyStateVisible: (await page.getByText(EMPTY_STATE).count()) > 0,
    rawForbiddenVisible: (await page.getByText(RAW_403).count()) > 0,
    url: page.url(),
  };
  test
    .info()
    .annotations.push({
      type: "p0-evidence",
      description: JSON.stringify(evidence),
    });
  console.log(`[P0-EVIDENCE] ${JSON.stringify(evidence)}`);
  return identity;
}

/**
 * While the browser's cookie belongs to the shop user, the console must pause honestly: no
 * misleading empty state, no raw 403 text, and a notice naming the switch.
 *
 * The cookie itself still belongs to the shop user here on purpose - changing that is P7. What P1
 * guarantees is that the console never renders a rejected request as if it were real data.
 */
async function expectConsolePaused(page: Page, scenario: string) {
  const identity = await sampleIdentity(page, scenario);

  // The console must not lie about empty data when the truth is a rejected request.
  await expect(
    page.getByText(EMPTY_STATE),
    `${scenario}: tenants list shows a misleading empty state`,
  ).toHaveCount(0);
  await expect(
    page.getByText(RAW_403),
    `${scenario}: raw 403 leaked into the UI`,
  ).toHaveCount(0);

  // It must explain the switch instead.
  await expect(
    page.getByTestId(NOTICE),
    `${scenario}: no session-switched notice`,
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(NOTICE_LOGIN)).toBeVisible();
  await expect(page.getByTestId(NOTICE_LOGIN)).toContainText("Sign in again");

  return identity;
}

/** After Exit view-as the console must be the super admin again, with a working tenants list. */
async function expectConsoleRestored(
  page: Page,
  scenario: string,
  bizName: string,
) {
  // Exit posts first and reloads the console afterwards, so wait for the notice to clear and for the
  // list to come back before sampling the identity the cookie jar now presents.
  await expect(
    page.getByTestId(NOTICE),
    `${scenario}: notice still blocking the console`,
  ).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(
    page.getByTestId("tenant-row").filter({ hasText: bizName }),
    `${scenario}: tenants list`,
  ).toHaveCount(1, {
    timeout: 60_000,
  });
  const identity = await sampleIdentity(page, scenario);
  await expect(identity.meStatus, `${scenario}: /user/me status`).toBe(200);
  await expect(identity.role, `${scenario}: /user/me role`).toBe("SUPER_ADMIN");
  await expect(
    identity.tenantsStatus,
    `${scenario}: /agency/analytics/tenants status`,
  ).toBe(200);
  await expect(
    page.getByTestId("tenant-row").filter({ hasText: bizName }),
  ).toHaveCount(1, {
    timeout: 60_000,
  });
}

test.describe("P0: console session switch (A1)", () => {
  let tenant: ThrowawayTenant;
  let bizName = "";

  test.beforeAll(async ({ request }) => {
    tenant = await createThrowawayTenant(request, "sesswitch");
    bizName = (
      await db.business.findUniqueOrThrow({ where: { id: tenant.businessId } })
    ).name;
  });

  test("view-as in the same browser must not switch the console identity", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const ctx: BrowserContext = await browser.newContext();
    try {
      const adminPage = await ctx.newPage();
      await adminLogin(adminPage);
      await expect(adminPage.getByTestId("tenant-row")).not.toHaveCount(0, {
        timeout: 30_000,
      });

      // (b) View As opens the tenant app in a second tab of the same context.
      const popupPromise = ctx.waitForEvent("page");
      await adminPage
        .getByTestId("tenant-row")
        .filter({ hasText: bizName })
        .getByTestId("tenant-view-as")
        .click();
      // P1 added a confirmation dialog before a view-as session is created.
      await adminPage.getByTestId("view-as-confirm-accept").click();
      const viewPage = await popupPromise;
      await expect(viewPage.getByTestId("view-as-banner")).toBeVisible({
        timeout: 60_000,
      });

      // (c) Back on the console: open a tenant detail and return to the list.
      await openTenantAndReturn(adminPage, bizName);

      await expectConsolePaused(adminPage, "view-as tab open");

      // The notice offers Exit view-as for a switch caused by view-as.
      await expect(adminPage.getByTestId(NOTICE_EXIT)).toBeVisible();
      await expect(adminPage.getByTestId(NOTICE_EXIT)).toContainText(
        "Exit view-as",
      );

      // Leaving view-as restores the console identity and the list.
      await adminPage.getByTestId(NOTICE_EXIT).click();
      await expectConsoleRestored(adminPage, "after Exit view-as", bizName);
    } finally {
      await ctx.close();
    }
  });

  test("signing into the client app as a shop owner must not switch the console identity", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const ctx: BrowserContext = await browser.newContext();
    try {
      const adminPage = await ctx.newPage();
      await adminLogin(adminPage);
      await expect(adminPage.getByTestId("tenant-row")).not.toHaveCount(0, {
        timeout: 30_000,
      });

      // Page two: a normal client-app login as the seeded owner in the same browser context.
      const clientPage = await ctx.newPage();
      await clientPage.goto(`${E2E.webUrl}/login`);
      await expect(clientPage.getByTestId("login-email")).toBeVisible({
        timeout: 60_000,
      });
      await clientPage.getByTestId("login-email").fill(users.ownerA.email);
      await clientPage.getByTestId("login-password").fill(TEST_PASSWORD);
      await clientPage.getByTestId("login-submit").click();
      await expect(clientPage).toHaveURL(/\/dashboard$/, { timeout: 60_000 });

      await openTenantAndReturn(adminPage, bizName);

      await expectConsolePaused(adminPage, "client login in the same browser");

      // Not a view-as switch: there is nothing to exit, only to sign in again.
      await expect(adminPage.getByTestId(NOTICE_EXIT)).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("closing the view-as tab without Exit must not switch the console identity (A15)", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const ctx: BrowserContext = await browser.newContext();
    try {
      const adminPage = await ctx.newPage();
      await adminLogin(adminPage);
      await expect(adminPage.getByTestId("tenant-row")).not.toHaveCount(0, {
        timeout: 30_000,
      });

      const popupPromise = ctx.waitForEvent("page");
      await adminPage
        .getByTestId("tenant-row")
        .filter({ hasText: bizName })
        .getByTestId("tenant-view-as")
        .click();
      // P1 added a confirmation dialog before a view-as session is created.
      await adminPage.getByTestId("view-as-confirm-accept").click();
      const viewPage = await popupPromise;
      await expect(viewPage.getByTestId("view-as-banner")).toBeVisible({
        timeout: 60_000,
      });

      // The support agent just closes the tab. No /auth/view-as/exit call.
      await viewPage.close();

      await openTenantAndReturn(adminPage, bizName);
      await expectConsolePaused(adminPage, "view-as tab closed without Exit");

      // The stashed admin session still exists, so Exit view-as must be offered and must work.
      await expect(adminPage.getByTestId(NOTICE_EXIT)).toBeVisible();
      await expect(adminPage.getByTestId(NOTICE_EXIT)).toContainText(
        "Exit view-as",
      );
      await adminPage.getByTestId(NOTICE_EXIT).click();
      await expectConsoleRestored(
        adminPage,
        "after Exit view-as with the tab closed",
        bizName,
      );
    } finally {
      await ctx.close();
    }
  });
});
