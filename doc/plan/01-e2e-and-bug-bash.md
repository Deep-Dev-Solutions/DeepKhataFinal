# Phase 1: Full E2E suite and bug bash

**Goal:** cover every critical flow with Playwright, then fix every bug the suite exposes.
Fix in the app, never in the assertion.

## Process (follow in order)

1. Write all P0 specs below first, run them, and let them fail.
2. Record every failure in `docs/plan/BUGS.md`: id, spec, severity (S1 security/data loss, S2 wrong money or stock, S3 broken flow, S4 cosmetic), root cause, file.
3. Fix S1 → S2 → S3 → S4. Each fix gets a regression test (API or E2E) that failed before the fix.
4. Re-run the full suite after every 3 fixes. Finish with the suite green 3 runs in a row (flake check).

Use the `playwright-cli` skill to explore each flow in a real browser before writing its spec.

## Known bugs to confirm and fix (seed list)

These were found by reading the code. Write a failing test for each, then fix.

| Id | Severity | Where | Problem | Fix |
| --- | --- | --- | --- | --- |
| K1 | S1 | `auth/strategies/jwt.strategy.ts` | Hardcoded fallback secret `'hellosecretaccesstoken1122'` lets anyone forge tokens if the env var is missing | Remove fallback; fail fast at boot if `ACCESS_TOKEN_SECRET` or `REFRESH_TOKEN_SECRET` is unset or shorter than 32 chars |
| K2 | S1 | `onboarding/onboarding.controller.ts` + service | `POST /onboard/onboarding` has no auth and trusts `ownerId` from the body, so a caller can attach any user ID to a new business | Require `JwtAuthGuard`; use `req.user.id`; reject if the user already has a `businessId` |
| K3 | S1 | `team/team.controller.ts` → `team.service.ts inviteStaff` | `businessId` comes from the body, so a manager of shop A can invite people into shop B; user limit is also counted against the body's business | Take `businessId` from `req.user`; validate role is not higher than inviter's; never allow inviting `SUPER_ADMIN` or `OWNER` |
| K4 | S1 | all controllers | Audit every route for body/query/header `businessId` usage | Replace with session business; add isolation tests for every `:id` route (see suite A) |
| K5 | S2 | `sync/sync.service.ts` + `client/src/lib/sync.ts` | Client queues `UPDATE_ORDER_STATUS`, server only handles `CREATE_ORDER`; unhandled items stay `syncing` forever and never retry | Server returns a per-item result (`synced` / `failed` / `conflict` with reason) for every item; client sets status per item; implement `UPDATE_ORDER_STATUS` or stop queuing it |
| K6 | S2 | `products.service.ts getProducts` | Product list cached in Redis for 1 hour keyed by search text; stock can be stale after a sale if invalidation misses a path | Verify invalidation on order, return, restock, transfer, delete; add test "sell last unit → list shows 0 immediately" |
| K7 | S3 | `auth.service.ts logout` | Logout only clears the cookie; the refresh token stays valid 7 days | Short-term: refresh-token denylist table checked on refresh. Full fix lands in Phase 6 |
| K8 | S3 | `utils/mailer.ts` | Invite email says "BizFlow" | Use `APP_NAME` env |
| K9 | S3 | `auth.controller.ts register` | Public register creates a user with role `OWNER` and no business | Keep public signup (needed for trials) but default role to `OWNER` only after onboarding creates the business; block all business routes for users without `businessId` |
| K10 | S2 | `x-branch-id` header usage | Branch ID from header is not always checked against the user's business | Validate in every service that reads it (proper guard comes in Phase 2) |

## P0 E2E suites (`apps/e2e/tests/`)

**A. Auth and tenancy** (`auth/`)
- Login, logout, wrong password count, lockout after 10 failures, lockout message.
- Role matrix: for owner, manager, staff, visit every sidebar page and assert allowed/denied per `config/permissions.ts`.
- Isolation (API-level, table-driven): for every route with an `:id`, tenant B's token requesting tenant A's record returns 404, and list endpoints never include tenant A rows.
- Token tampering: a JWT signed with the old hardcoded secret is rejected.

**B. POS checkout** (`pos/`)
- Search by name and SKU, add item with condition selection, add labour/service line, discount, walk-in customer.
- Item available only at the other branch shows the remote-branch badge and cannot be added.
- Payment variants: full cash, full udhar (credit), partial, bank.
- After sale: invoice page renders and prints (print CSS), stock decremented, instance status `SOLD`, ledger balanced, customer balance updated.
- Amanat (memo): instance becomes `MEMO_LOCKED`, no ledger postings; settling memo converts to final sale.

**C. Galla / cash** (`cash/`)
- Open register with float, cash sale, petty expense, close with counted cash, variance recorded, Z-report totals equal the sum of the session.
- Cannot open two registers on the same branch.

**D. Khata** (`khata/`)
- Credit sale → customer statement shows debit; record payment → balance correct to the rupee; overpayment handled.
- Vendor: restock on credit → vendor payable; pay vendor → payable cleared.
- Customer credit limit and defaulter flag block or warn at checkout as designed.

**E. Inventory** (`inventory/`)
- Restock hub: multiple items, conditions, cabinet, vendor, unit cost → instances and movement log created.
- Cabinet and branch deletion with stock: confirmation dialog, stock moved or wiped as designed, no FK errors.
- Bulk import CSV: valid file imports; invalid rows reported.

**F. Returns** (`returns/`)
- Full and partial return: stock restored with condition, ledger reversed, customer balance corrected.

**G. Offline** (`offline/`)
- `context.setOffline(true)`; create 3 sales; assert 3 items in IndexedDB `syncQueue`; go online; assert exactly 3 orders on the server and queue empty.
- Flush twice (simulate double fire) → still 3 orders (idempotency).
- Offline sale of a serialized instance that was sold online meanwhile → returned as `conflict`, shown to the user.

**H. Subscription kill switch** (`billing/`)
- Agency admin sets tenant to `READ_ONLY` → banner shown, every write button disabled, API writes return 403, logout works.
- `SUSPENDED` → login refused with the suspension message.
- Plan limits: third branch and sixth user are blocked with a clear message.

**I. Team** (`team/`)
- Owner invites staff → email lands in Mailpit (read via Mailpit API) → accept link → staff logs in with staff permissions.
- Owner changes staff role → staff's next request reflects it (document current behaviour if it lags; fixed in Phase 6).
- Removed staff can no longer use the app.

**J. Agency admin** (`agency/`)
- Agency login; non-super-admin rejected.
- Onboard a tenant manually, add branch, log payment → subscription extended.

## Acceptance criteria

- [ ] All suites A–J exist and pass 3 consecutive runs.
- [ ] K1–K10 fixed, each with a regression test.
- [ ] `docs/plan/BUGS.md` lists every bug found with status `fixed` or `deferred (phase N)`.
- [ ] No S1 or S2 bug is deferred.
