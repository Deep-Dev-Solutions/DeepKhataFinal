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
| A1 | `a398867 idk` = D2-7 leftovers, not a stray commit: adds `data-testid="deal-success"` and `data-testid="tenant-deal-history-row"` to `apps/agency-admin/app/tenants/[id]/page.tsx` (+8/-2) and a new `apps/e2e/tests/agency/deals.spec.ts` (75 lines, "K: custom deals"). Two defects in that spec: its second test asserts `expect(async () => count).toBe(before)` (a function compared to a number — fails unconditionally) and never actually attempts the 3rd-branch create; and it drives `deal-plan`, a testid D2-6's list did not name (the page has it, so harmless). Not reverted. | described, defects listed | 819421b |
| A2 | `npm run lint`: client 206 warnings / server 21 warnings, 0 errors. `agency-admin` aborts before linting (TS 7 vs typescript-eslint, eslint 10 vs eslint-plugin-react 7 — logged in BUGS.md). Under the root toolchain it reports one real error in the Day 2 tenant page (`fetchDealHistory` used in an effect before its `const` declaration) — fixed in this commit, then 0 errors / 13 warnings. | pass on code, blocker on deps | 6ba9ccb |
| A3 | `npm run build`: green for all four workspaces — agency-admin (next 16.3.8, TS 7.0.2, 7 routes), client (next 16.4.2), desktop (`tsc`), server (`nest build`). Only the pre-existing "middleware convention is deprecated" warning. | pass | 886d05b |
| A4 | `npm test -w server` (unit): 27 files, 103/103 tests passed in 14.7 s — same count as Day 1, the new Day-2 service code included. | pass | c11a197 |
| A5 | `npm test -w desktop` (unit): 5 files, 40/40 passed in 0.7 s — unchanged from Day 1. | pass | 93032d6 |
| A6 | `npm run test:api`: 29 files, 443/443 passed in 145 s (Day 1: 28 files, 442) — the extra file/test is `test/agency-deals.e2e-spec.ts`, so D2-3 deal API, D2-4 limit scoping, D2-5 CUSTOM billing and the cross-tenant 404 all hold at API level. | pass | 2682892 |
| A7 | `E2E_WITH_ADMIN=1 npx playwright test tests/agency/deals.spec.ts tests/billing`: 22/22 passed in 2.5 min. First run exposed two Day-2 defects, both fixed in this commit: (a) the deal banner/history printed `Rs. 20000.00` while the page's own `formatAmount` groups (`20,000`) and the spec asserted the grouped form; (b) the "third branch" test was a no-op — `expect(async () => count).toBe(before)` compares a function to a number and never attempted the create — rewritten to POST `/settings/branch` as the owner and assert 403 `PLAN_LIMIT_REACHED` with an unchanged branch count. The meter assertion now derives used counts from the DB (same rule as `PlanLimitsService.getUsage`) instead of hardcoding `0 / 10`. | pass | 20a1cea |
| A8 | `npm run stack:up` smoke (Day 1's pending item, after `docker builder prune -f`): **all five services healthy**. `docker compose --profile full ps` → postgres :5434, mailpit :1027/:8027, api :5000, client :3000, admin :3001 all `(healthy)`; `GET :5000/health` → `{"status":"ok","db":"up"}`, api log ends "All migrations have been successfully applied" + "Nest application successfully started"; client `/` and `/login` → 200 (`<title>DeepKhata - Modern Business OS</title>`); admin `/` → 307 to `/login` → 200; mailpit UI → 200. `npm run stack:down` clean. Two blockers found, both fixed: (a) the lockfile had no `@typescript/typescript-*` platform entries, so the admin image's `next build` died on the missing native compiler (fixed in `b807bd5`, the Day-1 "local install artifact" was really a lockfile gap); (b) `stack:up` builds api+client+admin concurrently and the api `npm ci` crashed after 242 s with npm's "Exit handler never called!" — serial `docker compose --profile full build <svc>` builds all three fine (logged in BUGS.md). | pass after fix | b807bd5 |

### Day 2 report

- Shipped: verification of Day 2 only — no new features. Checks run: lint, build (4 workspaces), server unit 103/103, desktop 40/40, API 443/443, deals+billing E2E 22/22, full-stack `stack:up` smoke 5/5 healthy.
- Fixed while verifying (all Day-2 defects): `fetchDealHistory` declared after its effect (agency-admin lint error); deal banner/history printing `20000.00` instead of the page's grouped `20,000`; a third-branch cap test that compared a function to a number and never made a request; missing `@typescript/typescript-*` entries in the lockfile that broke the admin image build.
- Failing: `npm run lint` still exits 2 because the `agency-admin` workspace crashes on its own TS 7 / eslint 10 pair before linting anything. Code is clean under the root toolchain (0 errors). Fix is one dependency line — needs your call.
- Also logged in BUGS.md: parallel image builds can OOM npm on a 16 GB machine (serial works); migration folders carry `migrate dev` timestamps instead of the `0014_` naming rule; two Day-2 unused-import warnings.
- Decisions needed: (1) bump `eslint` in `apps/agency-admin/package.json` to `^9.39.5` so its lint runs in CI? (2) add `COMPOSE_PARALLEL_LIMIT=1` to `stack:up`? (3) rename migrations or amend AGENTS.md to the timestamp convention?
- Disk note: builds pushed the root filesystem to 99% (2.7 GB free at worst); build cache trimmed after each image, 4.8 GB free now.
- Next: Section B (Day 3, UI foundation + POS). Not started.

### Day 2 decisions applied (owner, 2026-10-26)

- `apps/agency-admin/package.json`: `eslint` `^10.12.0` → `^9.39.5`. `npm run lint` is now green across the monorepo: **exit 0**, 0 errors (client 206 / server 21 / admin 13 warnings). Reinstall removed 371 packages.
- `stack:up` now runs `COMPOSE_PARALLEL_LIMIT=1 docker compose --profile full up -d --build --wait`, so api/client/admin images build one at a time (the parallel run OOM'd npm on a 16 GB box).
- `AGENTS.md`: migrations keep Prisma's `<timestamp>_<seq>_<name>` folder form; existing migrations are not renamed.
- Re-verified after the change: `npm run build -w agency-admin` → exit 0.

## Day 3 — design direction (owner, for Section B)

- Clean and dense, like a professional retail POS; designed for 1366x768 shop laptops.
- One primary colour: deep blue. Neutral greys for structure. Green and red only for money in / money out.
- Inter, 14px base size. Compact tables with zebra rows.
- Large touch-friendly buttons only on the POS checkout — every other screen stays compact.
- No gradients, no glassmorphism, no emojis in the UI.
- Housekeeping for every build: check `df -h /` first; if free space is under 8 GB, stop and report instead of building.

## Day 3 — UI foundation + POS (Section B)

| # | Task | State | Commit |
| --- | --- | --- | --- |
| B0 | Before screenshots (dashboard + POS, 1366x768, seeded dev login) into docs/ui/ via apps/e2e/scripts/ui-shots.mjs | done | df70bfe |
| B1 | Design tokens in globals.css: brand scale (deep blue primary), unified gray/slate neutral scale, success/warning/danger (money in/caution/money out), fs-* type scale (14px base), control heights, 6px radius, subtle shadows, .dk-zebra helper; Inter via next/font in layout.tsx | done | 473cbbb |
| B2 | Shared UI kit in `components/ui/`: Button (primary/secondary/ghost/danger, sm/md/lg, loading), Input, Select, Textarea, Table (zebra, hover, empty row, pagination slot), Card, Modal (Base UI dialog wrapper), PageHeader, EmptyState, Badge, Toast (restyled over existing ToastContext), Skeleton — all take `className` and forward `data-testid` | done | 4a7dc45 |
| B3 | App shell on tokens: Sidebar 224px/64px, Header 56px, brand active nav state, neutral surfaces; page container unchanged in behaviour | done | 1629a3b |
| B4a | POS screen on the tokens/UI kit: brand+neutral+success/danger only, shared Input/Button/Badge/EmptyState/Skeleton, no handler changes, 23/23 `pos-*` testids kept; `npm run build -w client` green, `tests/pos` 19 passed / 1 pre-existing skip | done | fb8cbf5 |
| B4b | Checkout drawer on the tokens/UI kit: solid backdrop (no blur), shared Button/Input/Select/Badge, `lg` submit + 44px controls, 18/18 testids kept, no handler changes; `npm run build -w client` green, `tests/pos` 19 passed / 1 pre-existing skip | done | 8f8527e |
| B5 | After screenshots at 1366x768 via `node apps/e2e/scripts/ui-shots.mjs after`: new blue/gray shell, tokenised POS; `docs/ui/*-after.png` written next to the before shots (docs/ui stays git-excluded, same as B0) | done | docs-only |
| B6 | Section checks: `npm run build -w client` green (28 routes), `tests/pos` 19 passed / 1 pre-existing skip, `tests/smoke.spec.ts` 7/7 after reseed; Day 3 report below | done | — |

### Day 3 report

- Shipped: design tokens in `globals.css` (brand blue, gray scale, success/warning/danger, 14px base type scale, control heights, 6px radius, flat shadows, `.dk-zebra`) with Inter via `next/font`; a 12-part shared UI kit under `components/ui/` (Button, Input, Select, Table, Card, Modal, PageHeader, EmptyState, Badge, Toast, Skeleton, plus the existing dialogs); app shell at 224px/56px with a brand active state; POS screen and checkout drawer rebuilt on tokens + kit — deep blue actions, neutral structure, green/red only for money, 44px touch targets on the checkout controls, no gradients or blur.
- Behaviour unchanged: POS handlers untouched; 23 `pos-*` and 18 checkout testids kept; only `className`/element swaps.
- Checks: `npm run build -w client` green (28 routes); `tests/pos` 19 passed / 1 pre-existing skip; `tests/smoke.spec.ts` 7 passed after reseed.
- Screenshots: `docs/ui/{dashboard,pos}-{before,after}.png` at 1366x768 (git-excluded like B0; rerun needs dev servers on :3000/:5000).
- Failing: nothing.
- Decisions needed: none.
- Next: Section C (Day 4, daily screens). Not started.

## Day 4 — daily screens (Section C)

| # | Task | State | Commit |
| --- | --- | --- | --- |
| C0 | Fix the Day 3 regressions seen against `docs/ui/pos-before.png`: Badge defaults to an 18px compact chip (11px, uppercase, `px-1`) with `size="md"` available for stand-alone use, so the POS header badges ("Parts + Labor", "0 lines") shrink too; POS product cards 138px tall vs 140px before with the category label full again and the status badge beside it; cabinet/bin chips stay on one line (10px, truncate + `title` tooltip); sidebar user block stacked (name + full email at 224px, role and compact Logout on their own row); after-shots retaken — category text and card height match before | done | c5c88ef |
| C1 | Products list + product detail on PageHeader/Card/Table/kit: pills and search as Button/Input, stock and category as compact Badge, sales + audit tabs as kit tables, 0 palette utilities left, all 3 testids kept (`products-add`, `products-search`, `product-row`, `product-row-stock`, `product-edit`); `npm run build -w client` green, screenshots 124 badges all 18px, 0 clipped badges, 0 clipped text | done | eec719d |
| C2 | Add/edit product modals moved onto the kit `Modal` (bordered grey header, scrolling body, footer actions), kit `Input`/`Select`/`Button`; shared `dialog.tsx` de-blurred and tokenised, `modal.tsx` gets header/footer borders; handlers and 18 testids unchanged; `npm run build -w client` green, 672px dialogs, 36px controls, 0 horizontal overflow | done | e90bc98 |
| C3 | Restock hub on tokens/kit: kit Select/Input/Button in the composer, product catalog rows use compact Badges with names wrapping (no ellipsis), batch table is the kit Table with a `lg` confirm button, 7/7 testids kept; `npm run build -w client` green, 126 badges all 18px, 0 clipped badges/text, 0 horizontal overflow | done | 11553aa |
| C4 | Inventory movement ledger on PageHeader/Card/Table: direction as success/danger/brand Badge, qty green/red only, location and notes truncate on one line with tooltips, no testids existed and none added; `npm run build -w client` green, 100 badges all 18px, 0 clipped badges/text | done | 674369f |
| C5 | Customers list + khata profile on the tokens/kit: PageHeader, metric Cards, kit Table (balance as danger/neutral Badge), ledger/orders tabs as Buttons + Badges, date stacked, description truncate+title so all 6 ledger columns fit at 1366px, statement/WhatsApp actions as secondary Buttons; 29+5 badges all 18px, 0 clipped badges, dashboard gate clean | done | c5342af |
| C6 | Customer + payment modals on the kit `Modal` (grey header, scrolling body, footer actions): NewCustomer, EditCustomer, RecordPayment. Kit Input/Select/Button, amount keeps Rs. prefix, `Pay in Full`, danger outstanding strip; testids `new-customer-*`, `record-payment-*` kept; 512px dialogs, controls 16/24/36, no overflow | done | f669dbd |
