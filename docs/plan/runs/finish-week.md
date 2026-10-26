# Run log: finish-week (7-day plan)

Branch: `finish-week` (from `final-fixes` @ 6578aae). Owner work per day; report after each day.

## Day 1 — Cleanup and map (2026-10-24) — CLOSED

| Task | State | Commit |
| --- | --- | --- |
| Remove Vercel leftovers (`main.ts` handler, cors.ts legacy origins, stale `.env.production`) | done | 6ade969 |
| Remove legacy one-off test scripts (`test-phase4/rbac/masked-ip-lockout.ts`) | done | 6ade969 |
| jwt-auth.guard stub | n/a — no JWT guard exists (`auth/guards` has only session/permissions/roles + desktop device guard) |
| Prune merged worktrees | done — all 4 under `.claude/worktrees` were merged/prunable; removed |
| Root `docker-compose.yml` profile `full` + `stack:up/down/logs` | done — compose config validated | 6ade969 |
| `ARCHITECTURE.md` (≤2 pages) + INSTALL.md stack section | done | 6d9808e |
| Lint (all workspaces) | pass — warnings only (pre-existing) |
| Build (all workspaces) | pass — fixes: stale Prisma client regenerated (fixed `trial-claim` TS2339); missing `@typescript/typescript-linux-x64` in agency-admin (local install artifact, `npm i -w agency-admin --force`) |
| Unit: server / desktop | 103/103 · 40/40 |
| API/integration | 442/442 (28 files) |
| E2E full Playwright (`E2E_WITH_ADMIN=1`) | **185 passed, 1 skipped (9.9m)** |

Extra findings:
- `apps/server/.env` pointed `DATABASE_URL`/`DIRECT_URL` at **Supabase production** — switched to local dev Postgres `:5433` (5432 is occupied on this machine; Supabase lines kept commented). Nothing ran against production.
- `stack:up` smoke test: root disk filled to 100% during the 3 parallel image builds (16 GB build cache). User reclaimed ~13 GB (`docker builder prune`). Smoke rerun pending — build cache will be trimmed again between builds.
- `agency-admin` Dockerfile moved to `node:22-bookworm-slim`: typescript 7's native binary optional packages are glibc-only; npm silently skips them on alpine (musl) and `next build` dies with "Unable to resolve @typescript/typescript-linux-x64".

Incident note: while the disk was at 100%, the runs file was truncated by a failed write; this file is the restored authoritative log.

## Day 2 — Custom deals

Scouted facts:
- `Subscription` already has `priceOverride`, `customLimits: Json?`, `currentPeriodStart/End`, `billingCycle` (enum has only MONTHLY/YEARLY → needs `CUSTOM`).
- `DealHistory` model does not exist. Migration 0014 adds `BillingCycle.CUSTOM` + `DealHistory` (+ `supportEndsAt DateTime?` on Subscription for on-prem licence support end).
- Plans seeded in migration 0009: TRIAL(0/0, 1/2/100, 30d), STARTER(3000/30000, 1/3), BUSINESS(null/null, 3/10), CUSTOM(unlimited, isPublic=false). Existing tenants live on CUSTOM plan with customLimits {2,5,∞}.
- `PlanLimitsService.getLimits` (src/plans/plan-limits.service.ts:49) applies `customLimits` keys over Plan columns with no date check — must scope to the deal period when dates exist (no dates → legacy always-apply behaviour, existing tenants unaffected).
- Kill switch: `SubscriptionsService.computeEffectiveStatus` uses `currentPeriodEnd` — deal end date flows through automatically once the deal writes period dates.
- Invoices: `BillingService.createInvoice` already prefers `sub.priceOverride` when the plan matches (src/billing/billing.service.ts:179); CUSTOM cycle has no month math (`months = YEARLY?12:1`) — needs a deal-period branch, and `recordPayment` extension for CUSTOM must use `until: periodEnd`.
- Renewal cron (src/billing/renewals.service.ts:67) year/month price checks — needs `priceOverride` path awareness for CUSTOM.
- Desktop licence cap (src/desktop/licence.service.ts:63): `min(periodEnd, now+30d)` — must also respect `supportEndsAt` when set; limits come from `PlanLimitsService` so deal limits flow through.
- Agency UI: `apps/agency-admin/app/tenants/[id]/page.tsx` (status override + log-payment form live there). API types: `apps/agency-admin/src/types/agency.ts`.

Task graph (Sonnet unless noted):
| Id | Task | Files |
| --- | --- | --- |
| D2-1 | Prisma migration 0014: `BillingCycle.CUSTOM`, `DealHistory` (businessId, actorId, old Db, new Db, notes, changedAt; index businessId+changedAt), `Subscription.supportEndsAt` | schema.prisma, migrations/0014 |
| D2-2 | Plan templates: TRIAL/BASIC(1,5,∞)/STANDARD(2,10,∞)/CUSTOM via migration; retire STARTER/BUSINESS (active=false, isPublic=false) so existing tenants keep their limits; align prisma/seed.ts | migration SQL, seed.ts |
| D2-3 | Deal API: `POST /agency/tenants/:id/deal` + `GET /agency/tenants/:id/deal-history`; SetDealDto (class-validator, money-as-string); Subscription + DealHistory old→new in one `$transaction`, mirrors Business, invalidates tenant cache | agency.service.ts, agency.controller.ts, dto |
| D2-4 | Deal-period scoping in `PlanLimitsService` + `supportEndsAt` cap in `LicenceService` | plans/plan-limits.service.ts, desktop/licence.service.ts |
| D2-5 | CUSTOM cycle branches in `createInvoice`/`recordPayment` (period from deal dates, `until` extension) + renewals CUSTOM awareness | billing.service.ts, renewals.service.ts |
| D2-6 | Agency-admin UI: Set-deal form + deal-history table on the tenant page (testids: deal-price, deal-cycle, deal-start, deal-end, deal-maxbranches, deal-maxusers, deal-maxproducts, deal-submit) | agency-admin tenant page |
| D2-7 | Tests: `apps/server/test/agency-deals.e2e-spec.ts` + Playwright spec (20000/yr 2-branch deal, third branch 403, invoice shows 20000, deal history, cross-tenant 404) | server test, apps/e2e |

Break-the-feature list: invoice in/out of deal window, null price deal, concurrent deal updates, limits after deal expiry revert to plan caps, licence cap min() correctness, tenant-cache invalidation.

Status: Day-2 implementation queued.

## Day 2 — verification (Section A)

| # | Task | State | Commit |
| --- | --- | --- | --- |
| A0 | Switch to `finish-week` (already at `a398867`, same as `final-fixes`; no fast-forward needed, clean tree) | done | — |
| A1 | `a398867 idk` = D2-7 leftovers, not a stray commit: adds `data-testid="deal-success"` and `data-testid="tenant-deal-history-row"` to `apps/agency-admin/app/tenants/[id]/page.tsx` (+8/-2) and a new `apps/e2e/tests/agency/deals.spec.ts` (75 lines, "K: custom deals"). Two defects in that spec: its second test asserts `expect(async () => count).toBe(before)` (a function compared to a number — fails unconditionally) and never actually attempts the 3rd-branch create; and it drives `deal-plan`, a testid D2-6's list did not name (the page has it, so harmless). Not reverted. | described, defects listed | pending |
| A2 | `npm run lint`: client 206 warnings / server 21 warnings, 0 errors. `agency-admin` aborts before linting (TS 7 vs typescript-eslint, eslint 10 vs eslint-plugin-react 7 — logged in BUGS.md). Under the root toolchain it reports one real error in the Day 2 tenant page (`fetchDealHistory` used in an effect before its `const` declaration) — fixed in this commit, then 0 errors / 13 warnings. | pass on code, blocker on deps | pending |
| A3 | `npm run build`: green for all four workspaces — agency-admin (next 16.3.8, TS 7.0.2, 7 routes), client (next 16.4.2), desktop (`tsc`), server (`nest build`). Only the pre-existing "middleware convention is deprecated" warning. | pass | pending |
| A4 | `npm test -w server` (unit): 27 files, 103/103 tests passed in 14.7 s — same count as Day 1, the new Day-2 service code included. | pass | pending |
