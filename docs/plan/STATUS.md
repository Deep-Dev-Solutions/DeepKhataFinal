# Build Status

Last updated: 2026-10-21, at the start of the final-fixes close run. Run logs: `docs/plan/runs/phase-4-5.md`, `docs/plan/runs/phase-6-10.md`. Bugs: `docs/plan/BUGS.md`. Bench: `docs/plan/runs/bench-results.md`.

Numbers below are only ones that were measured. Anything not yet re-measured on `final-fixes` says so; the truth run fills it in.

## Where the code is

- Branch `final-fixes` holds phases 0-10 (phase-6-10 merged in 37cdbbb). Nothing deployed; nothing run against Supabase.
- Migrations `0000_baseline` to `0011_user_updated_at`. `0000_baseline` assumes Supabase matches the old `final-fixes` `schema.prisma`; verify before `prisma migrate resolve --applied 0000_baseline` (see `deploy/MIGRATION.md`).
- Workspaces: `server`, `client`, `agency-admin`, `desktop`, `e2e`, `bench`.

## Verification

Measured at the end of phases 0-5 (branch `phase-4-5-dues-stockfinder`, 2026-10-18):
- API tests: 14 files, 188 tests, all pass. Server unit tests: 23 files, 29 tests, all pass.
- E2E: 3 full runs of 161 specs: 159 passed + 1 failed (flaky, `stock-finder/transfer-and-sell`), then 160, then 160 passed; 1 skipped (`test.fixme`, POS condition picker).
- Bench (10,082 products, 100k orders, 10 VUs): stock finder p95 46 ms exact, 68 ms prefix, 240 ms typo (target 300). Product list page 1 p95 148 ms. Product list with search p95 about 400 ms (misses target, deferred).

Phases 6-10 on `final-fixes`: not yet re-measured. The phase-6-10 worktree reported 336 API tests and 40 desktop unit tests passing, but that run was never recorded and its fixes were left uncommitted, so those figures are not counted here. The truth run (lint, build, API, unit, full Playwright) replaces this paragraph.

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

### Phase 6: Accounts and auth, built, verification pending
- [x] Better Auth cookie sessions replace the custom JWT (bearer for tests, sync and desktop); no session cookie cache, so role change and removal apply on the next request
- [x] Signup + email verification, forgot/reset, staff username login, invites with expiry and branch scoping, deactivate and session list
- [ ] Playwright coverage for signup/verify via Mailpit, forgot/reset, username login, deactivation kick-out (close run task 3)

### Phase 7: Trial, plans, billing, built, verification pending
- [x] Plans in DB, `PLAN_LIMIT_REACHED` (403), trial lifecycle cron and emails, invoices with pdfkit PDFs and public `/i/[token]`, payment extends subscription
- [ ] Playwright coverage for trial expiry (fake clock) to invoice to payment (task 3)

### Phase 8: Agency analytics, built, verification pending
- [x] Nightly TenantDailyUsage rollup and backfill, tenants list with health, charts, usage statement PDF, read-only view-as with access log
- [ ] Playwright coverage for view-as banner, blocked writes, tenant access log (task 3)
- [ ] `offlineSyncedOrders` always 0 (N1 in BUGS.md; task 4)

### Phase 9: Client cache and offline, built, verification pending
- [x] Dexie v2 sync engine (push then pull), MiniSearch worker, offline order/payment/khata/customer/expense writes, conflict dialog
- [ ] Playwright coverage for offline sale/payment/khata sync without duplicates and zero-network cached search (task 3)

### Phase 10: Desktop, partly built
- [x] `apps/desktop`: Electron main process, embedded Postgres (the `embedded-postgres` package, not SQLite), migrate on start, utility processes, tray, LAN mode, Ed25519 licence verify with grace and clock-rollback guard, pg_dump backup rotation, outbox push; server side `DEPLOYMENT_MODE=desktop`, `POST /sync/desktop/push`, licence issuance
- [ ] Deferred (needs Windows and a certificate): NSIS installer, code signing, Electron Playwright suite on a Windows runner, 4 GB RAM test, auto-update from GitHub Releases

## Decisions for the owner

1. Refund on a partly-paid return comes out of cash first, then reduces the receivable (existing policy kept). Switch to receivable-first?
2. Stock finder: the fuzzy tier runs only when exact and all-word matches find nothing. OK?
3. POS has no item-condition picker and products have no condition input at creation/restock. Add one?
4. Customer overpayment is clamped to 0 (no store credit). Add customer credit?
5. Verify Supabase matches the old `final-fixes` schema before baselining production.

## Phase log

| Date | Phase | Result | Notes |
| --- | --- | --- | --- |
| 2026-10-11 | 0 | Partial | Audit by Claude; blocker on schema mismatch |
| 2026-10-18 | 0-5 | Done (3 prepared, not deployed) | See runs/phase-4-5.md |
| 2026-10-18 to 10-20 | 6-10 | Built, merged to final-fixes | See runs/phase-6-10.md; Windows-only parts of 10 deferred |
| 2026-10-21 | close | In progress | Truth run, missing specs, hardening, k6; PR `hardening-close` into `final-fixes` |
