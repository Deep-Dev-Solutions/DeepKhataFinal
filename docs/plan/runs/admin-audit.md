# Agency admin audit and fix plan

Owner: planner (Claude). Builder: OpenCode agent. Branch: `admin-audit`.
This file is the single source of truth for the admin panel audit. The agent appends findings and progress here; it does not create other planning files.

## 1. The bug that started this (root cause, confirmed from code)

Symptom: logged into the admin console (localhost:3001) as SUPER_ADMIN, opened a tenant, came back, and got
`You do not have permission to perform this action. Required role: SUPER_ADMIN`. The Tenants page then showed
"No tenants match the selected filters" while the header still said SUPER_ADMIN.

Cause: one shared session cookie for every app.

- `POST /auth/view-as/activate` (apps/server/src/analytics/view-as.controller.ts) replaces that shared cookie with the impersonated tenant OWNER session. It stashes the admin session in `dk_admin_return` and only puts it back on `/auth/view-as/exit` (BUGS.md T9).
- So the moment "View as" opens the tenant tab, every request from the admin tab is sent as the tenant OWNER. `RolesGuard` correctly answers 403 "Required role: SUPER_ADMIN".
- Logging into the client app as any shop user in the same browser does the same thing.
- The admin UI hides it: `AuthContext` checks `/user/me` only once on mount, so the header keeps saying SUPER_ADMIN; `fetchTenants` and `fetchOverview` in `app/page.tsx` swallow the error with `console.error`, so the list renders the empty state "No tenants match the selected filters" instead of an error.
- E2E gap: `tests/agency/view-as.spec.ts` checks the admin identity only after Exit, never while the view-as tab is still open.

Quick confirm for the owner: hard reload the admin tab while a view-as tab is open. `/user/me` now returns OWNER and you get bounced to /login.

Dev workaround until fixed: use a separate browser profile (or a private window) for the client app and the admin console.

## 2. Decisions needed from the owner (agent must not decide these)

| ID  | Question                                                                                                                                                                                                                                                   | Planner recommendation                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | Structural view-as fix: should view-as stop touching the shared cookie (per-tab token in `sessionStorage`, sent as `Authorization: Bearer`, which SessionGuard already accepts)? Touches the client app (middleware cookie check, api client, Dexie sync). | Yes, but after Phase 1. Phase 1 makes the console detect and explain the switch; that unblocks you today.       |
| D2 (decided 2026-11-11, owner may still override) | Owner asked why "Deal History" and "Payment & Billing History" are separate. Answer: they are different things (deal = what the shop agreed to pay, payment = cash received), but today both overwrite the plan and the expiry date, so they fight. | ONE billing model per tenant. The deal is the only thing that sets plan, limits, price and expiry. A payment only records money received against the deal (amount, received-on date, method, notes) and never changes plan or expiry. Tenant page shows one "Billing" card: current deal, total due, total paid, balance, and one merged timeline (deal changes and payments, newest first). This reverses the "payments that set the plan" part of commit p1.1. |
| D4 (planner proposal) | Date rules. | Block what is always wrong, warn on what is sometimes right. Deal end date: must be after today and after start, hard block (client and server). Deal start date: may be in the past (deal agreed last week) but warn with a confirm if more than 30 days back; may not be after end. Payment received-on date: not in the future (hard block); warn with a confirm if more than 30 days back. Today is computed in Asia/Karachi. |
| D5 (agent must ask) | Editing a tenant after provisioning. | Editable: business name, address, phone, owner name. Owner email and phone have side effects (login identity, email verification, one-trial-per-phone `TrialClaim`), so the agent asks the owner before touching those two. |
| D3  | Should the SUPER_ADMIN have a `businessId` at all? `prisma/seedSuperAdmin.ts` attaches it to the first business. That feeds BUGS.md F13 (super admin `GET /dashboard` shows another tenant's data) and the "Store Dashboard →" link.                       | No. Super admin is business-less; remove the "Store Dashboard" link or point it at the public site.             |

## 3. Known findings (seeded by planner, agent verifies and extends)

Severity: S1 security/data loss, S2 broken core flow, S3 wrong or misleading behaviour, S4 polish.

| ID  | Sev | Area      | Finding                                                                                                                                                                                                   | Where                                                                                           |
| --- | --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A1  | S2  | Session   | View-as or a client login in the same browser silently switches the admin console's identity; every agency call 403s                                                                                      | view-as.controller.ts, shared cookie                                                            |
| A2  | S2  | Session   | `AuthContext` verifies `/user/me` only on mount; never on focus, visibility change, or after a 401/403                                                                                                    | src/context/AuthContext.tsx                                                                     |
| A3  | S3  | Errors    | Load failures are swallowed and shown as empty data: tenants list, overview cards, deal history, signups, tasks, invoice list/detail                                                                      | app/page.tsx 117-147, tenants/[id]/page.tsx 151-172, components/signups/_, components/billing/_ |
| A4  | S3  | Errors    | View-as, CSV export, usage PDF and invoice PDF failures only hit `console.error`; the user sees nothing                                                                                                   | page.tsx 157-190, tenants/[id]/page.tsx 222-260, InvoiceDetail.tsx 70                           |
| A5  | S3  | Errors    | `api.ts` has no central 401/403 handling; each page invents its own                                                                                                                                       | src/lib/api.ts                                                                                  |
| A6  | S1  | Secrets   | `prisma/seedSuperAdmin.ts` hardcodes a real email and plaintext password in the repo, and bcrypt-hashes into `User.password` (may not match Better Auth's account table)                                  | apps/server/prisma/seedSuperAdmin.ts                                                            |
| A7  | S2  | API input | `@Body() data: any` on `onboard-tenant`, `tenants/:id/status`, `tenants/:id/billing`, `branch/:businessId` (breaks the "DTO for every body" rule; unknown fields pass through)                            | agency.controller.ts                                                                            |
| A8  | S3  | API input | No `ParseUUIDPipe` on `GET tenants/:id`, `PATCH tenants/:id/status`, `POST tenants/:id/billing`, `POST branch/:businessId`, `PATCH signups/:businessId`, `PATCH tasks/:id`; a bad id likely becomes a 500 | agency.controller.ts                                                                            |
| A9  | S3  | Money     | Log payment sends `amount: parseFloat(amount)` (JS number); deal `maxProducts` via `Number()`; money must travel as strings                                                                               | tenants/[id]/page.tsx 204, 283                                                                  |
| A10 | S3  | Data      | Duplicate API base URL logic: `process.env.NEXT_PUBLIC_API_URL                                                                                                                                            |                                                                                                 | "http://localhost:5000"` inlined instead of `API_BASE_URL` | page.tsx 156, tenants/[id]/page.tsx 243 |
| A11 | S3  | UX        | "Store Dashboard →" sends the super admin into the client app with the shared cookie (see D3, F13)                                                                                                        | src/components/AppShell.tsx 90                                                                  |
| A12 | S4  | Auth      | Admin login has no Turnstile widget (BUGS.md open item)                                                                                                                                                   | app/login/page.tsx                                                                              |
| A13 | S3  | Tests     | No E2E for: admin tab while view-as is open, error states, bad tenant id, signups/tasks actions, invoice send/void/payment from the console                                                               | apps/e2e/tests/agency/                                                                          |
| A14 | S3  | UX        | Header role badge was hardcoded `SUPER_ADMIN`, not `user.role` (check P1 fixed it) | src/components/AppShell.tsx |
| A15 | S2  | Session   | Closing the view-as tab without Exit leaves the console switched for up to 60 min; only Exit restores the stash | view-as.controller.ts |
| A16 | S2  | Session   | A1 also hits production: `COOKIE_DOMAIN` shares the cookie across `app.`, `api.`, `admin.` (raises D1 priority) | better-auth.ts, deploy/.env.example |
| A17 | S2  | Billing   | Payment form field "Next Expiry Date" is sent as `paymentDate`, stored in `BillingLog.paymentDate` and shown in history as "Payment Date". One field does two jobs, so history shows payments dated in the future (e.g. 11 Sept 2027). **Fixed in P1.2:** the form now asks for "Received on" plus a method, and the payment path writes only AgencyBillingLog | tenants/[id]/page.tsx ~975, agency.service.ts logPaymentAndExtend |
| A18 | S2  | Billing   | Deal and payment both overwrite `Business.subscriptionExpiresAt`, subscription period and plan; last save wins. Screenshot: deal renews 11 Nov 2027, a later payment can silently move expiry to 11 Sept 2027. **Fixed in P1.2:** setDeal is the only writer of plan, price, period and expiry; a payment touches money only | agency.service.ts setDeal, logPaymentAndExtend |
| A19 | S2  | Dates     | Past expiry / deal end dates are accepted on client and server; a past date puts the shop into read-only mode on save (kill switch) | deal.dto.ts, agency.service.ts, tenants/[id]/page.tsx |
| A20 | S3  | Billing   | No balance anywhere: deal Rs 50,000 and payments Rs 30,000 + Rs 70,000 are not linked, so nobody can tell what the shop owes. **Fixed in P1.2:** one Billing card shows due / paid / balance and a merged timeline | tenants/[id]/page.tsx |
| A21 | S3  | Tenants   | A tenant cannot be edited after provisioning: no `PATCH /agency/tenants/:id`, no edit form | agency.controller.ts, tenants/[id]/page.tsx |
| A22 | S4  | UX        | Deal success message prints raw ISO timestamps ("2026-11-11T00:00:00.000Z") instead of formatted dates | tenants/[id]/page.tsx handleSetDeal |
| A23 | S4  | UX        | Number inputs keep leading zeros ("020" max users) | tenants/[id]/page.tsx deal form |
| A24 | S4  | UX        | Deal History table scrolls sideways at 1920 px; columns are cut | tenants/[id]/page.tsx ~1204 |
| A25 | S3  | Billing   | Third money path: invoices under Billing (`/agency/billing/invoices`) are not linked to the deal or to the tenant's payment history | components/billing/*, billing.service.ts |

## 4. Audit checklist (Phase 2 walks every cell)

For every page: loads with data; loads empty; API returns 500; API returns 401 (session gone); API returns 403 (identity switched); slow network (loading state); bad URL param; browser back/forward; hard reload; 1366x768 and 390px width.

Pages: `/login`, `/` (tenants), `/tenants/[id]`, `/tenants/[id]/billing`, `/signups`, `/billing`, `/billing/[id]`.

Actions: login (good, wrong password, non-admin, locked), logout, search, filter, sort, CSV export, provision tenant (valid, duplicate email, duplicate phone, missing fields), expand row, add branch, change status (each value, then kill switch check), log payment, set deal (valid, end before start, unknown plan), deal history, view-as (open, use admin tab while open, exit), usage PDF, signups edit, task complete, invoice create/send/void/record payment/PDF.

For each: what the user sees, what the network shows, what the DB holds, console errors. Record anything wrong as a new row in section 3 (next free ID, currently A26).

## 5. Phases (one OpenCode session each, stop after each)

| Phase         | Goal                                                                                  | Exit check                                         |
| ------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P0            | Reproduce A1 with a failing Playwright spec; confirm cause                            | Spec fails for the documented reason               |
| P1            | Session-switch detection and honest error states (A1 UI side, A2-A5, A10)             | P0 spec passes; agency E2E green                   |
| P1.2 (D2)     | One billing model: deal sets terms, payments only record money, balance and merged timeline (A17, A18, A20, A25 decision) | API + E2E tests green; old BillingLog rows still display |
| P1.3 (D4, D5) | Date rules and tenant editing (A19, A21, A22, A23, A24) | API + E2E tests green |
| P2            | Full audit sweep per section 4 plus admin vs client parity; findings and owner questions only, no fixes                               | Section 3 extended; P2 report                      |
| P3            | Server hardening of agency routes (A7, A8, A9 server side) plus route-table RBAC test | test:api green                                     |
| P4            | Fix S1/S2/S3 findings from P2, frontend                                               | Each fix has a test; agency E2E green              |
| P5            | Secrets and super admin identity (A6, A11, per D3)                                    | Seed reads env; docs updated                       |
| P6            | Regression and report                                                                 | lint, build, test:api, full E2E with admin         |
| P7 (needs D1) | View-as via per-tab bearer token, cookie never replaced                               | View-as specs plus new "both tabs work" spec green |

## 6. Progress log (agent appends: phase, task, state, commit)

### P0 - reproduce A1 with a failing spec

| Phase | Task                                                                                              | State                        | Commit         |
| ----- | ------------------------------------------------------------------------------------------------- | ---------------------------- | -------------- |
| P0    | Step 1: read section 1 and the three files                                                        | done (evidence in section 1) | -              |
| P0    | Step 2: add `apps/e2e/tests/agency/session-switch.spec.ts`, 3 tests asserting the fixed behaviour | done                         | test(admin-p0) |
| P0    | Step 3: run with `E2E_WITH_ADMIN=1`, all three fail at the console step                           | done, red by design          | test(admin-p0) |
| P0    | Step 4: commit                                                                                    | done                         | test(admin-p0) |

**Failure evidence.** `E2E_WITH_ADMIN=1 npm run test:e2e -- tests/agency/session-switch.spec.ts` -> 3 failed, 4 setup passed. Each test prints a `[P0-EVIDENCE]` line sampled from the console tab's own cookie jar before asserting.

| Test                                  | `/agency/analytics/tenants` | `/user/me` role | Failing assertion                                                         |
| ------------------------------------- | --------------------------- | --------------- | ------------------------------------------------------------------------- |
| view-as tab open                      | 403                         | OWNER (200)     | `getByText("No tenants match the selected filters.")` expected 0, found 1 |
| client login in the same browser      | 403                         | OWNER (200)     | same                                                                      |
| view-as tab closed without Exit (A15) | 403                         | OWNER (200)     | same                                                                      |

In all three the `session-switched` notice is absent and the list renders the empty state. The tenant detail page shows the raw `Required role: SUPER_ADMIN` message (logged separately by the spec); the list document also matched that text.

**P0 report (10 lines max)**

- Cause confirmed in code, not just probable: `POST /auth/view-as/activate` replaces the one shared cookie, so the admin tab sends the tenant OWNER session; `RolesGuard` correctly answers 403 and the console renders that as "No tenants match the selected filters" while `AppShell` keeps printing a hardcoded SUPER_ADMIN badge.
- Closing the view-as tab without Exit leaves the same broken state, so Exit is not the only way in (A15).
- A plain client-app login in the same browser produces an identical console state, so the bug is the shared cookie, not view-as itself.
- Nothing was fixed in P0 (out of scope). The spec asserts the fixed behaviour and stays red until P1.
- P1 must add: central 401/403 handling in `api.ts`, a `session-switched` notice with `session-switched-exit` / `session-switched-login`, honest per-area error states instead of the empty state, and the real role in the header.

### P1 - the console always knows who it is (backfilled from git log, 2bfe6f6)

| Phase | Task | State | Commit |
| --- | --- | --- | --- |
| P1 | 401/403 hook in `lib/api.ts`: one `/user/me` re-check, then `session-expired` / `session-switched` / `forbidden` | done | 2bfe6f6 |
| P1 | `AuthContext` listens to the events and re-verifies on focus / visibilitychange (10 s throttle) | done | 2bfe6f6 |
| P1 | `SessionSwitchedNotice` names the account and shop; Exit view-as only when impersonated; always Sign in again | done | 2bfe6f6 |
| P1 | Inline `<area>-error` / `<area>-retry` for tenants, overview, tenant detail, deal history, signups, tasks, invoices; empty text only on success | done | 2bfe6f6 |
| P1 | Action failures to toast; `API_BASE_URL` replaces the inlined env read; view-as confirm dialog | done | 2bfe6f6 |
| P1 | Checks: lint 0 errors, `build -w agency-admin` clean, session-switch 7 passed, tests/agency 24 passed | done | 2bfe6f6 |

**P1 report (10 lines max)**

- New `src/lib/session.ts`, `src/lib/errors.ts`, `src/components/InlineError.tsx`, `src/components/SessionSwitchedNotice.tsx`.
- The header now prints `user.role`, not a hardcoded `SUPER_ADMIN`; while switched it prints "Console paused".
- `isAuthenticated` no longer redirects on a role mismatch; the notice blocks instead, so the page state survives.
- Cookie behaviour deliberately untouched (P7 owns it). The P0 spec now asserts "paused, then restored after Exit", which is stricter than before.
- A payment-sets-plan change followed in P1.1; D2 later reversed that part.

### P1.1 - editable plan presets (backfilled from git log, 5a3ba8d)

| Phase | Task | State | Commit |
| --- | --- | --- | --- |
| P1.1 | `GET/POST/PATCH /agency/plans` with DTOs, ParseUUIDPipe and RBAC | done | 5a3ba8d |
| P1.1 | Console `/plans` preset manager: rename, re-price, limits, add | done | 5a3ba8d |
| P1.1 | Tenant plan editor prefilled from the current subscription; cycle change re-prices only an untouched price | done | 5a3ba8d |
| P1.1 | `setDeal` update branch clears `trialEndsAt`/`graceEndsAt` (sticky expiry, A18) | done | 5a3ba8d |
| P1.1 | Client trial-days pill accepts `TRIALING` as well as `TRIAL` | done | 5a3ba8d |
| P1.1 | `AddBranchDto.override` declared, so `whitelist: true` stops stripping it | done | 5a3ba8d |
| P1.1 | Tests: `test/agency-plans.e2e-spec.ts` 8/8, `tests/agency/plans.spec.ts` 5/5, API 448/452 (4 Mailpit), agency E2E 29/29 | done | 5a3ba8d |

**P1.1 report (10 lines max)**

- Payments also set the plan in this commit. **D2 reverses that**: see P1.2.
- Presets are the existing `Plan` rows; no migration was needed.
- The durable part of P1.1 is the plan editor, the preset manager and the `trialEndsAt` clearing in `setDeal`.

### P1.2 - one billing model (decision D2)

**Design note (before coding).**

1. Tables used: `Subscription` (plan, limits, price, `currentPeriodStart/End`) is the deal; `DealHistory` is its append-only log; `AgencyBillingLog` is cash received.
2. Columns added: `AgencyBillingLog.receivedAt DateTime?` and `AgencyBillingLog.method String?`, both nullable, migration `p1_2_billing_received_at`. No column is reinterpreted.
3. New payments write `receivedAt`, `method`, and also `paymentDate = receivedAt` so the column is never null for new rows.
4. Legacy rows keep `receivedAt IS NULL`. They render as "Legacy payment" dated by their stored `paymentDate`, labelled "Paid until".
5. Balance: total due = the current deal's price for its cycle (`Subscription.priceOverride` else `Plan.priceMonthly/priceYearly`) across the current deal period.
6. Total received = sum of `AgencyBillingLog.amount` whose `receivedAt` falls inside the current period. Legacy rows are excluded because D2 defines a payment by its received-on date and theirs is an expiry date.
7. Balance = due - received, all through `src/common/money.ts` (`Decimal`, never a JS number).
8. `setDeal` remains the only writer of plan, limits, price, period and `Business.subscriptionExpiresAt`; the payment path writes nothing but `AgencyBillingLog`.
9. Timeline = `DealHistory` + `AgencyBillingLog` merged, newest first, each row labelled `deal` or `payment` / `legacy-payment`.
10. Invoices are not merged here; the question is open in section 7 as Q1.

**Execution (after the design note).**

| Phase | Task | State | Commit |
| --- | --- | --- | --- |
| P1.2 | Design note in section 6 before coding | done | feat(admin-p1.2) |
| P1.2 | Migration `p1_2_billing_received_at`: `receivedAt` + `method`, both nullable | done | feat(admin-p1.2) |
| P1.2 | `RecordPaymentDto`: amount, received-on date, method, notes - no plan, no cycle | done | feat(admin-p1.2) |
| P1.2 | `recordPayment` writes one billing row and nothing else | done | feat(admin-p1.2) |
| P1.2 | `GET /agency/tenants/:id/billing`: deal, due, paid, balance, merged timeline | done | feat(admin-p1.2) |
| P1.2 | UI: one Billing card replaces the payment, deal-history and billing-history cards | done | feat(admin-p1.2) |
| P1.2 | Rewrote the specs that asserted the old behaviour (payment extends expiry / sets plan) | done | feat(admin-p1.2) |
| P1.2 | New API + Playwright coverage for balance and timeline | done | feat(admin-p1.2) |
| P1.2 | Q1 (invoice semantics) written in section 7 | done | feat(admin-p1.2) |

**P1.2 report (10 lines max)**
- The deal is now the only writer of plan, price, limits, period and `Business.subscriptionExpiresAt`; `recordPayment` writes one `AgencyBillingLog` row and cannot move any of them.
- `AgencyBillingLog` gained nullable `receivedAt` and `method`; no existing column was reinterpreted, so old rows keep their value.
- Legacy rows (no `receivedAt`) render as "Legacy payment" with their stored date shown as "Paid until", and are excluded from money received in the current period.
- Balance is `due - received` in Decimals from `src/common/money.ts`, where due is the deal price for its cycle and received is the sum of payments inside the current period.
- One Billing card replaces three: deal summary, due / paid / balance, the record-payment form, and one merged newest-first timeline labelled deal / payment / legacy-payment.
- A25 is not merged by design; Q1 in section 7 asks what an invoice should mean under D2 (recommendation: a printable statement of one deal period, no balance effect).
- API: `test/agency-plans.e2e-spec.ts` 10/10; full suite 441 passed, 4 failed only because Mailpit listens on 1026 while the server expects 1025; 9 skipped.
- E2E: `tests/agency/*` 30/30 green; lint 0 errors; agency-admin build clean.
- Specs that had encoded the old behaviour were rewritten to assert the D2 rule, not relaxed: a payment is now asserted to leave expiry, status and plan untouched, and a deal is asserted to change them.

## 7. Questions for the owner (agent writes, owner answers inline)

Format: `Q<n> | where | what the admin shows | what the client shows (or what the code does) | options (a/b/c) | agent recommendation | owner answer`. Leave "owner answer" empty. Never act on an unanswered question.

| Q | Where | Admin shows | Client shows / code does | Options | Recommendation | Owner answer |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | `AgencyInvoice`, `/agency/billing/invoices` | A separate invoice list and PDF under Billing, not linked to the deal or to recorded payments | The shop sees plan and expiry only; nothing references an invoice number | (a) invoices stay an internal document generated from a deal period, no balance effect (b) invoices become the bill of record and payments settle them, matching the due/paid/balance (c) retire invoices and keep only the deal + payment timeline | (a) for now: an invoice is a printable statement of one deal period, it never moves the balance | |

