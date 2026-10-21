# Build Status

Last updated: 2026-10-22, at the end of the final-fixes close run (branch `hardening-close`, PR into `final-fixes`). Run logs: `docs/plan/runs/phase-4-5.md`, `docs/plan/runs/phase-6-10.md`. Bugs: `docs/plan/BUGS.md`. Bench: `docs/plan/runs/bench-results.md`.

Numbers below are only ones that were measured.

## Where the code is

- Branch `final-fixes` holds phases 0-10 (phase-6-10 merged in 37cdbbb); `hardening-close` (PR, not merged) adds the close-run fixes, missing specs, `isOfflineSync`, cleanup, bot hardening and k6. Nothing deployed; nothing run against Supabase.
- Migrations `0000_baseline` to `0013_trial_claim`. `0000_baseline` assumes Supabase matches the old `final-fixes` `schema.prisma`; verify before `prisma migrate resolve --applied 0000_baseline` (see `deploy/MIGRATION.md`).
- Workspaces: `server`, `client`, `agency-admin`, `desktop`, `e2e`, `bench`.

## Verification

Measured at the end of phases 0-5 (branch `phase-4-5-dues-stockfinder`, 2026-10-18):
- API tests: 14 files, 188 tests, all pass. Server unit tests: 23 files, 29 tests, all pass.
- E2E: 3 full runs of 161 specs: 159 passed + 1 failed (flaky, `stock-finder/transfer-and-sell`), then 160, then 160 passed; 1 skipped (`test.fixme`, POS condition picker).
- Bench (10,082 products, 100k orders, 10 VUs): stock finder p95 46 ms exact, 68 ms prefix, 240 ms typo (target 300). Product list page 1 p95 148 ms. Product list with search p95 about 400 ms (misses target, deferred).

Measured at the end of the close run (`hardening-close`, 2026-10-22):
- Lint: 0 errors in every workspace; 221 warnings (client 206, admin 15; the client's `no-explicit-any` and React-compiler rules are warnings by decision, BUGS.md T1).
- Builds: server, client, agency-admin, desktop all pass.
- API tests (`npm run test:api`): 28 files, 442 tests, all pass.
- Server unit tests: 27 files, 103 tests. Desktop unit tests: 5 files, 40 tests. All pass.
- Playwright (`E2E_WITH_ADMIN=1 npm run test:e2e`), three full runs in a row: 185 passed, 0 failed, 1 skipped each (the POS condition picker `test.fixme`). Runs took 10.4, 10.5 and 10.7 minutes.
- On the clean `final-fixes` before any fix: lint 149 client errors, `test:api` 334/336, Playwright 130 passed / 18 failed / 12 did not run (BUGS.md T1-T7).
- k6 scenarios (`apps/bench/k6/`) are written but have not been run: no `k6` binary here.

## Phase progress

### Phase 0: Foundation, done
- [x] Schema/migration/seed aligned; `ItemCondition` restored on ProductInstance and InventoryMovement (0001)
- [x] Redis optional; `deleteByPattern` uses SCAN
- [x] Root CLAUDE.md, AGENTS.md, `.env.example` files, CI workflow
- [x] API harness (Vitest + Supertest, per-worker test DBs) and `apps/e2e` Playwright workspace
- [x] Seed `--large`

### Phase 1: E2E and bug bash, done
- [x] Suites A-J plus dues and stock finder; K1-K3 security holes, K5 sync, K7 revocation fixed
- [x] 21 bugs found and fixed with regression tests; 11 deferred (BUGS.md)

### Phase 2: Correctness and performance, done
- [x] Money as Decimal(14,2); balanced ledger helper; tenant guard; fast product list, trigram search, indexes
- [ ] Refactor remaining services onto `@Tenant()` (deferred)
- [ ] Product list search p95 under 300 ms at 10k products (about 400 ms)

### Phase 3: VPS deployment, prepared (not deployed, by decision)
- [x] Dockerfiles, prod compose, Caddyfile, bootstrap.sh, nightly R2 backup, tag deploy workflow, migration runbook
- [ ] Actual deploy, DNS, R2 bucket, smoke monitor Worker

### Phase 4: Dues and reminders, done
### Phase 5: Stock finder, done

### Phase 6: Accounts and auth, done
- [x] Better Auth cookie sessions replace the custom JWT (bearer for tests, sync and desktop); no session cookie cache, so role change and removal apply on the next request
- [x] Signup + email verification, forgot/reset, staff username login, invites with expiry and branch scoping, deactivate and session list
- [x] Playwright: signup + Mailpit verify, forgot/reset, staff username login, deactivation kick-out (`tests/accounts`)
- [x] Bot hardening: Cloudflare client IP via Caddy, global throttler with strict auth/public limits, Better Auth rate limits, body size limits, Turnstile captcha (sign-up, forgot, resend, sign-in after 3 failures), disposable-email block, one trial per phone, per-address daily email cap
- [ ] Turnstile widget on the agency-admin login; client widgets not browser-tested

### Phase 7: Trial, plans, billing, done
- [x] Plans in DB, `PLAN_LIMIT_REACHED` (403), trial lifecycle cron and emails, invoices with pdfkit PDFs and public `/i/[token]`, payment extends subscription
- [x] Playwright: trial expiry (Subscription dates moved in the DB; the lifecycle cron itself is not driven by Playwright) to read-only, invoice, payment, writable again (`tests/billing/trial-to-paid`)

### Phase 8: Agency analytics, done
- [x] Nightly TenantDailyUsage rollup and backfill, tenants list with health, charts, usage statement PDF, read-only view-as with access log
- [x] Playwright: view-as banner, blocked writes, tenant access log, exit restores the admin session (`tests/agency/view-as`)
- [x] `offlineSyncedOrders` counted via `Order.isOfflineSync` (migration 0012)

### Phase 9: Client cache and offline, done
- [x] Dexie v2 sync engine (push then pull), MiniSearch worker, offline order/payment/khata/customer/expense writes, conflict dialog
- [x] Playwright: offline sale, payment and khata entry sync with no duplicates; cached product search makes zero network calls (`tests/offline/offline-writes`)

### Phase 10: Desktop, partly built
- [x] `apps/desktop`: Electron main process, embedded Postgres (the `embedded-postgres` package, not SQLite), migrate on start, utility processes, tray, LAN mode, Ed25519 licence verify with grace and clock-rollback guard, pg_dump backup rotation, outbox push; server side `DEPLOYMENT_MODE=desktop`, `POST /sync/desktop/push`, licence issuance
- [ ] Deferred (needs Windows and a certificate): NSIS installer, code signing, Electron Playwright suite on a Windows runner, 4 GB RAM test, auto-update from GitHub Releases

## Security review

RBAC and tenancy audit: `docs/plan/runs/rbac-audit.md` (about 187 routes; 3 S1, 12 S2, 17 S3). The 3 S1 findings are fixed with tests (owner to SUPER_ADMIN promotion, settings invite role, customer update mass assignment). The 12 S2 and 17 S3 findings are open and listed in BUGS.md (F4-F15): STAFF can see vendor/low-stock costs and the cached dashboard, STAFF can cancel orders and discount below the minimum price, several cross-tenant id checks, public invoice leaks the customer row, desktop endpoints ignore READ_ONLY.

## Decisions for the owner

1. Refund on a partly-paid return comes out of cash first, then reduces the receivable (existing policy kept). Switch to receivable-first?
2. Stock finder: the fuzzy tier runs only when exact and all-word matches find nothing. OK?
3. POS has no item-condition picker and products have no condition input at creation/restock. Add one?
4. Customer overpayment is clamped to 0 (no store credit). Add customer credit?
5. Verify Supabase matches the old `final-fixes` schema before baselining production.
6. Client lint: keep `no-explicit-any` and React-compiler rules as warnings, or schedule typing the client?
7. Role change revokes the member's sessions (kept; the old Playwright spec was updated to match).
8. Fix the open S2 RBAC findings (F4-F15) next.

## Phase log

| Date | Phase | Result | Notes |
| --- | --- | --- | --- |
| 2026-10-11 | 0 | Partial | Audit by Claude; blocker on schema mismatch |
| 2026-10-18 | 0-5 | Done (3 prepared, not deployed) | See runs/phase-4-5.md |
| 2026-10-18 to 10-20 | 6-10 | Built, merged to final-fixes | See runs/phase-6-10.md; Windows-only parts of 10 deferred |
| 2026-10-22 | close | Done, PR open | Truth run, missing specs, `isOfflineSync`, cleanup, bot hardening, k6, RBAC audit; PR `hardening-close` into `final-fixes` (not merged) |
