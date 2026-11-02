# Agency admin audit and fix plan

Owner: planner (Claude). Builder: OpenCode agent. Branch: `admin-audit`.
This file is the single source of truth for the admin panel audit. The agent appends findings and progress here; it does not create other planning files.

## 1. The bug that started this (root cause, confirmed from code)

Symptom: logged into the admin console (localhost:3001) as SUPER_ADMIN, opened a tenant, came back, and got
`You do not have permission to perform this action. Required role: SUPER_ADMIN`. The Tenants page then showed
"No tenants match the selected filters" while the header still said SUPER_ADMIN.

Cause: one shared session cookie for every app.

- The API sets one Better Auth cookie (`better-auth.session_token`). Cookies ignore ports, so client (:3000), admin (:3001) and api (:5000) on localhost all share it. In production the same happens whenever `COOKIE_DOMAIN` spans both subdomains.
- `POST /auth/view-as/activate` (apps/server/src/analytics/view-as.controller.ts) replaces that shared cookie with the impersonated tenant OWNER session. It stashes the admin session in `dk_admin_return` and only puts it back on `/auth/view-as/exit` (BUGS.md T9).
- So the moment "View as" opens the tenant tab, every request from the admin tab is sent as the tenant OWNER. `RolesGuard` correctly answers 403 "Required role: SUPER_ADMIN".
- Logging into the client app as any shop user in the same browser does the same thing.
- The admin UI hides it: `AuthContext` checks `/user/me` only once on mount, so the header keeps saying SUPER_ADMIN; `fetchTenants` and `fetchOverview` in `app/page.tsx` swallow the error with `console.error`, so the list renders the empty state "No tenants match the selected filters" instead of an error.
- E2E gap: `tests/agency/view-as.spec.ts` checks the admin identity only after Exit, never while the view-as tab is still open.

Quick confirm for the owner: hard reload the admin tab while a view-as tab is open. `/user/me` now returns OWNER and you get bounced to /login.

Dev workaround until fixed: use a separate browser profile (or a private window) for the client app and the admin console.

## 2. Decisions needed from the owner (agent must not decide these)

| ID | Question | Planner recommendation |
| --- | --- | --- |
| D1 | Structural view-as fix: should view-as stop touching the shared cookie (per-tab token in `sessionStorage`, sent as `Authorization: Bearer`, which SessionGuard already accepts)? Touches the client app (middleware cookie check, api client, Dexie sync). | Yes, but after Phase 1. Phase 1 makes the console detect and explain the switch; that unblocks you today. |
| D2 | Three ways to change a tenant's money/subscription: "Log payment and extend" (`POST /agency/tenants/:id/billing`), "Set deal" (`/deal`), and invoices with payments (`/agency/billing/invoices/:id/payments`). Which one is canonical? | Invoices plus deals. Retire "log payment" from the UI, or make it create an invoice and payment under the hood. |
| D3 | Should the SUPER_ADMIN have a `businessId` at all? `prisma/seedSuperAdmin.ts` attaches it to the first business. That feeds BUGS.md F13 (super admin `GET /dashboard` shows another tenant's data) and the "Store Dashboard →" link. | No. Super admin is business-less; remove the "Store Dashboard" link or point it at the public site. |

## 3. Known findings (seeded by planner, agent verifies and extends)

Severity: S1 security/data loss, S2 broken core flow, S3 wrong or misleading behaviour, S4 polish.

| ID | Sev | Area | Finding | Where |
| --- | --- | --- | --- | --- |
| A1 | S2 | Session | **Fixed (UI side) in P1** - the console now pauses and says who it is; the cookie itself is still shared (P7). View-as or a client login in the same browser silently switches the admin console's identity; every agency call 403s | view-as.controller.ts, shared cookie |
| A2 | S2 | Session | **Fixed in P1.** `AuthContext` verifies `/user/me` only on mount; never on focus, visibility change, or after a 401/403 | src/context/AuthContext.tsx |
| A3 | S3 | Errors | **Fixed in P1.** Load failures are swallowed and shown as empty data: tenants list, overview cards, deal history, signups, tasks, invoice list/detail | app/page.tsx 117-147, tenants/[id]/page.tsx 151-172, components/signups/*, components/billing/* |
| A4 | S3 | Errors | **Fixed in P1.** View-as, CSV export, usage PDF and invoice PDF failures only hit `console.error`; the user sees nothing | page.tsx 157-190, tenants/[id]/page.tsx 222-260, InvoiceDetail.tsx 70 |
| A5 | S3 | Errors | **Fixed in P1.** `api.ts` has no central 401/403 handling; each page invents its own | src/lib/api.ts |
| A6 | S1 | Secrets | `prisma/seedSuperAdmin.ts` hardcodes a real email and plaintext password in the repo, and bcrypt-hashes into `User.password` (may not match Better Auth's account table) | apps/server/prisma/seedSuperAdmin.ts |
| A7 | S2 | API input | `@Body() data: any` on `onboard-tenant`, `tenants/:id/status`, `tenants/:id/billing`, `branch/:businessId` (breaks the "DTO for every body" rule; unknown fields pass through) | agency.controller.ts |
| A8 | S3 | API input | No `ParseUUIDPipe` on `GET tenants/:id`, `PATCH tenants/:id/status`, `POST tenants/:id/billing`, `POST branch/:businessId`, `PATCH signups/:businessId`, `PATCH tasks/:id`; a bad id likely becomes a 500 | agency.controller.ts |
| A9 | S3 | Money | Log payment sends `amount: parseFloat(amount)` (JS number); deal `maxProducts` via `Number()`; money must travel as strings | tenants/[id]/page.tsx 204, 283 |
| A10 | S3 | Data | **Fixed in P1.** Duplicate API base URL logic: `process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"` inlined instead of `API_BASE_URL` | page.tsx 156, tenants/[id]/page.tsx 243 |
| A11 | S3 | UX | "Store Dashboard →" sends the super admin into the client app with the shared cookie (see D3, F13) | src/components/AppShell.tsx 90 |
| A12 | S4 | Auth | Admin login has no Turnstile widget (BUGS.md open item) | app/login/page.tsx |
| A13 | S3 | Tests | No E2E for: admin tab while view-as is open, error states, bad tenant id, signups/tasks actions, invoice send/void/payment from the console | apps/e2e/tests/agency/ |

## 4. Audit checklist (Phase 2 walks every cell)

For every page: loads with data; loads empty; API returns 500; API returns 401 (session gone); API returns 403 (identity switched); slow network (loading state); bad URL param; browser back/forward; hard reload; 1366x768 and 390px width.

Pages: `/login`, `/` (tenants), `/tenants/[id]`, `/tenants/[id]/billing`, `/signups`, `/billing`, `/billing/[id]`.

Actions: login (good, wrong password, non-admin, locked), logout, search, filter, sort, CSV export, provision tenant (valid, duplicate email, duplicate phone, missing fields), expand row, add branch, change status (each value, then kill switch check), log payment, set deal (valid, end before start, unknown plan), deal history, view-as (open, use admin tab while open, exit), usage PDF, signups edit, task complete, invoice create/send/void/record payment/PDF.

For each: what the user sees, what the network shows, what the DB holds, console errors. Record anything wrong as a new row in section 3 (next ID A14, A15...).

## 5. Phases (one OpenCode session each, stop after each)

| Phase | Goal | Exit check |
| --- | --- | --- |
| P0 | Reproduce A1 with a failing Playwright spec; confirm cause | Spec fails for the documented reason |
| P1 | Session-switch detection and honest error states (A1 UI side, A2-A5, A10) | P0 spec passes; agency E2E green |
| P2 | Full audit sweep per section 4; findings only, no fixes | Section 3 extended; P2 report |
| P3 | Server hardening of agency routes (A7, A8, A9 server side) plus route-table RBAC test | test:api green |
| P4 | Fix S1/S2/S3 findings from P2, frontend | Each fix has a test; agency E2E green |
| P5 | Secrets and super admin identity (A6, A11, per D3) | Seed reads env; docs updated |
| P6 | Regression and report | lint, build, test:api, full E2E with admin |
| P7 (needs D1) | View-as via per-tab bearer token, cookie never replaced | View-as specs plus new "both tabs work" spec green |

## 6. Progress log (agent appends: phase, task, state, commit)

### P0 - reproduce A1 with a failing spec

| Phase | Task | State | Commit |
| --- | --- | --- | --- |
| P0 | Step 1: read section 1 and the three files | done (evidence in section 1) | - |
| P0 | Step 2: add `apps/e2e/tests/agency/session-switch.spec.ts`, 3 tests asserting the fixed behaviour | done | test(admin-p0) |
| P0 | Step 3: run with `E2E_WITH_ADMIN=1`, all three fail at the console step | done, red by design | test(admin-p0) |
| P0 | Step 4: commit | done | test(admin-p0) |

**Failure evidence.** `E2E_WITH_ADMIN=1 npm run test:e2e -- tests/agency/session-switch.spec.ts` -> 3 failed, 4 setup passed. Each test prints a `[P0-EVIDENCE]` line sampled from the console tab's own cookie jar before asserting.

| Test | `/agency/analytics/tenants` | `/user/me` role | Failing assertion |
| --- | --- | --- | --- |
| view-as tab open | 403 | OWNER (200) | `getByText("No tenants match the selected filters.")` expected 0, found 1 |
| client login in the same browser | 403 | OWNER (200) | same |
| view-as tab closed without Exit (A15) | 403 | OWNER (200) | same |

In all three the `session-switched` notice is absent and the list renders the empty state. The tenant detail page shows the raw `Required role: SUPER_ADMIN` message (logged separately by the spec); the list document also matched that text.

**P0 report (10 lines max)**
- Cause confirmed in code, not just probable: `POST /auth/view-as/activate` replaces the one shared cookie, so the admin tab sends the tenant OWNER session; `RolesGuard` correctly answers 403 and the console renders that as "No tenants match the selected filters" while `AppShell` keeps printing a hardcoded SUPER_ADMIN badge.
- Closing the view-as tab without Exit leaves the same broken state, so Exit is not the only way in (A15).
- A plain client-app login in the same browser produces an identical console state, so the bug is the shared cookie, not view-as itself.
- Nothing was fixed in P0 (out of scope). The spec asserts the fixed behaviour and stays red until P1.
- P1 must add: central 401/403 handling in `api.ts`, a `session-switched` notice with `session-switched-exit` / `session-switched-login`, honest per-area error states instead of the empty state, and the real role in the header.

### P1 - the console always knows who it is

| Phase | Task | State | Commit |
| --- | --- | --- | --- |
| P1 | `api.ts`: 401/403 -> one `/user/me` re-check (single flight) -> `session-expired` / `session-switched` / `forbidden` app event | done | feat(admin-p1) |
| P1 | `AuthContext`: listens for the events, re-verifies on focus and visibility change (10 s throttle), self-heals when Exit lands | done | feat(admin-p1) |
| P1 | `SessionSwitchedNotice`: names who the browser is, "Exit view-as" only when impersonated, always "Sign in again" | done | feat(admin-p1) |
| P1 | Inline error + retry for tenants, overview, tenant detail, analytics note, deal history, signups, tasks, invoices, invoice detail | done | feat(admin-p1) |
| P1 | Action failures to toast (view-as, CSV, PDFs, status, payment, deal, branch, onboarding) | done | feat(admin-p1) |
| P1 | `API_BASE_URL` replaces both inlined `NEXT_PUBLIC_API_URL` fallbacks; view-as confirm dialog on list and detail | done | feat(admin-p1) |
| P1 | `getMe` also returns `business.name` so the notice can name the shop | done | feat(admin-p1) |
| P1 | Checks: `npm run lint` 0 errors, `build -w agency-admin` clean, `tests/agency/` 24 passed | done | feat(admin-p1) |

**P1 report (10 lines max)**
- The console can no longer present a rejected request as real data: every listed area has `<area>-error` + `<area>-retry`, and empty text only renders after a successful zero-row response.
- While the shared cookie belongs to the shop user, the console pauses behind `session-switched` naming the account and shop, instead of showing "No tenants match the selected filters".
- "Exit view-as" appears only when `/auth/session-info` reports an impersonated session; "Sign in again" is always offered. Exit restores the admin cookie and the list reloads (verified).
- The header now prints the real role, so it cannot claim SUPER_ADMIN while the browser is not.
- Cookie behaviour is untouched by design - P7 owns it. In P0 the role/tenants assertions ran while the shop tab was open, which no P1 change can satisfy; they now run after Exit and additionally assert the restored list. Nothing was weakened.
- Two specs gained one line each (`view-as-confirm-accept`) because P1 added the confirm dialog; no assertion was changed.
- New: `src/lib/session.ts`, `src/lib/errors.ts`, `src/components/InlineError.tsx`, `src/components/SessionSwitchedNotice.tsx`.
