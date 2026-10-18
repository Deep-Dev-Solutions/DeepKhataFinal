# Run: Phases 1-5 (unblock, bug bash, correctness, VPS artifacts, Lena/Dena, Stock finder)

Status: task graph confirmed by 4 scouts on 2026-10-11 (maps in `scouts-1-5.md`). Branch `phase-4-5-dues-stockfinder` from `final-fixes` (b350413).
Local stack for this worktree: Postgres on **5433** (host 5432 is taken by a non-docker Postgres), Mailpit 1025/8025, `apps/server/.env` local only. Never use the main checkout's `.env` (points at Supabase).

## Facts (verified; corrections to the draft marked ✱)

- Ledger: `LedgerService.createBalancedTransaction(dto)` ledger.service.ts:9-20, float sum, tolerance 0.001. Accounts: REVENUE, ASSET/CASH, CUSTOMER_AR (accountId=customerId), VENDOR_PAYABLE (accountId=vendorId), INVENTORY.
- Orders: newOrder :55-270, postDoubleEntrySequence :290, recordPayment :742, processReturn :864. ✱ Ledger postings run after the order tx (non-atomic); product lookup :115-117 has no businessId; header branchId trusted :161; count-then-update stock race.
- Vendor credit: no bill model; VENDOR_PURCHASE (vendors.service.ts:375) and VENDOR_PAYMENT (:424) written with prisma directly. ✱ `inventory.restock` posts no ledger at all (credit restock creates no payable). ✱ vendors and cash controllers have JwtAuthGuard only.
- Stock: getGlobalStock products.service.ts:406 (route `GET product/global-stock`). No transfer feature. ✱ No general product update endpoint (only `PATCH product/updateprice/:id`); import is a JSON body, no CSV parser.
- ✱ No command palette / Ctrl+K: Header.tsx `searchIndex` :42-132 (`{keywords,label,description,href,icon}`) is the palette. Bell :545-554 uses mock data.
- ✱ No branch-manager concept (User has no branchId). ✱ `@nestjs/schedule` not installed.
- ✱ ItemCondition exists only in the baseline migration and the client TS union, not in schema.prisma; no UI selects it.
- ✱ data-testid count in client: 0. apps/e2e has only fixtures/users.ts.
- ✱ Two customer balance definitions (getAllCustomers orders-minus-payments incl. CANCELLED vs posting-based).

## Design decisions (fixed for this run)

1. **Baseline**: `0000_baseline` is regenerated from the current `final-fixes` schema.prisma (assumed to be what production was `db push`ed from), then `0001_restore_item_condition` adds ItemCondition back (ProductInstance.condition default ORIGINAL_PULL, InventoryMovement.fromCondition?, toCondition default ORIGINAL_PULL). The user verifies Supabase matches before `migrate resolve --applied 0000_baseline`.
2. **One schema task (S1)** carries every model change for phases 1-5.
3. **Money**: Phase 2 runs before P4/P5 features, so all money is `Decimal(14,2)` and server code uses `src/common/money.ts`. API JSON emits money as **numbers rounded to 2 dp** (one `Prisma.Decimal.prototype.toJSON` override installed at bootstrap) so the client needs no rewrite now; strings deferred to Phase 9.
4. **Ledger** `createBalancedTransaction(dto, tx?)`: Decimal sum must be exactly 0; called inside the caller's `$transaction`.
5. **Tenancy**: global `TenantGuard` sets `req.tenant = {businessId, branchId}` from the JWT + validated `x-branch-id` (60 s cache). New modules use `@Tenant()`. Refactoring existing services off `requireBusinessId` is deferred (perf only).
6. **K7**: access tokens get a `jti`; logout writes `RevokedToken`; JwtAuthGuard rejects revoked jti.
7. **Notifications** fan out one row per recipient (`userId` required). "Managers of a branch" = all OWNER+MANAGER users of the business; `Notification.branchId` records the branch.
8. **Dues entities**: `entityType` ∈ `ORDER | KHATA_ENTRY | VENDOR_PURCHASE` (Transaction id). Vendor open amounts FIFO. Promise and snooze are `PromiseToPay` rows with `kind` PROMISE|SNOOZE. Manual reminders in `DueReminder`.
9. **KhataEntry postings** as in the draft (OTHER_AR / OTHER_AP accountId = entry id, BAD_DEBT_EXPENSE for write-off, `counterAccount` ASSET|REVENUE).
10. **Stock**: InstanceStatus gains `RESERVED` and `IN_TRANSIT`; existing AVAILABLE counts exclude them automatically. InventoryMovement gains `branchId?`. Transfers log OUT+IN movements with referenceType TRANSFER.
11. **Search**: `pg_trgm` via `postgresqlExtensions`; `Product.searchText` column kept by a DB trigger; GIN trigram indexes on searchText, name, sku.
12. **Scheduler** runs in-process (`@nestjs/schedule`); valid on the VPS, not on Vercel.
13. Out of scope (production): running deploys, R2, DNS, Cloudflare smoke Worker, Supabase rehearsal, deleting vercel.json/api/index.ts.

## Task graph

Agents: Q quick-implementer (haiku), I implementer (sonnet), T test-writer (sonnet), O orchestrator.

| Wave | Id | Task | Agent | Depends | Routing reason |
| --- | --- | --- | --- | --- | --- |
| 0a | W0.1 | Baseline regen + 0001_restore_item_condition | I | - | migration |
| 0a | W0.3 | Redis optional (no-op w/o REDIS_URL, lazyConnect, SCAN, try/catch) | I | - | error-handling logic |
| 0a | W0.5 | K1-K3: no JWT fallback (fail fast), onboarding auth + req.user, team invite from req.user, limit counts invites | I | - | auth/tenancy |
| 0b | W0.2 | seed.ts matches schema (conditions, category key) | I | W0.1 | data invariants in 1.2k-line script |
| 0b | F1 | K5 sync: per-item results, UPDATE_ORDER_STATUS, client per-item status | I | - | idempotency across client+server |
| 0b | W0.7 | Root CLAUDE.md, server AGENTS.md rewrite, ci.yml | Q | - | content pasted, no logic |
| 0c | W0.4 | apps/e2e workspace, config, helpers, smoke spec | T | W0.2 | test harness |
| 0c | W0.6 | API test harness on deepkhata_test | T | W0.2 | test harness |
| 0c | D1 | Dockerfiles x3, Next standalone, compose.prod, Caddyfile, deploy/.env.example | I | - | multi-stage build judgment |
| 1 | S1 | Schema+migrations for P1-P5 | I | W0.2 | migration (Opus reviews SQL) |
| 1 | TID1 | testids: login, Sidebar, Header, settings/team | Q | - | mechanical attrs |
| 1 | TID2 | testids: POS new order, CheckoutDrawer, invoice, orders list/returns | Q | - | mechanical attrs |
| 2 | M1 | money.ts, Decimal toJSON, ledger Decimal+tx, verify-ledger.ts | I | S1 | money |
| 2 | M1b | orders.service Decimal + atomic ledger + tenant/branch/race fixes | I | S1 (M1 interface) | money+tenancy |
| 2 | M2 | Decimal: vendors, cash, customers, inventory, products services | I | S1 | money |
| 2b | M3 | Decimal: dashboard, reports, agency, sync, leftovers | I | M1 | money |
| 2b | TID3 | testids: cash, customers, vendors | Q | - | mechanical |
| 2b | TID4 | testids: products, restock, cabinets, agency-admin | Q | - | mechanical |
| 3 | G1 | TenantGuard + @Tenant + branch cache + kill-switch cache + revoked jti | I | M* | auth/tenancy |
| 3 | F2 | K7 logout, K8 APP_NAME, K9 register, PermissionsGuard on vendors/cash | I | M* | auth |
| 3 | P25 | getProducts rewrite (paginated, groupBy, trigram, no cache) | I | M2 | query perf |
| 4 | A1 | NotificationsModule | I | S1,G1 | service+settings logic |
| 4 | A2 | KhataEntriesModule | I | M1,G1 | ledger postings |
| 4 | B1 | StockFinderModule | I | P25 | ranked search query |
| 5 | A3 | DuesModule (summary, list, FIFO, promise, reminded, wa link) | I | A1,A2 | money aggregation |
| 5 | A4 | RemindersJob scheduler | I | A1,A3 | scheduler/idempotency |
| 5 | B2 | Reservations + transfers (+ expiry job) | I | A1,B1 | stock state machine |
| 6 | E1 | orders: dueDate, reserved block/convert, minSalePrice guard | I | A3,B2 | money/auth |
| 6 | E2 | vendors purchase dueDate; credit restock posts VENDOR_PURCHASE | I | M2 | ledger |
| 6 | E3 | product fields in create/import, PATCH product/:id, instance photo/notes | I | M2 | DTO+service |
| 7 | C1 | /dues page | I | A3 | React state |
| 7 | C2 | QuickKhataModal | I | A2 | form logic |
| 7 | C3 | NotificationBell | I | A1 | polling state |
| 8 | C4 | Settings → Notifications | I | A1 | form state |
| 8 | C5 | /stock-finder + waiting view + reserve/request | I | B1,B2 | React state |
| 8 | C6 | Dashboard widgets: Aaj wasooli/dena, transfers inbox | I | A3,B2 | data widgets |
| 9 | C7 | Product form fields + EditProductModal | I | E3 | form state |
| 9 | C8 | Checkout due date + min-price error + reservation sell | I | E1 | checkout logic |
| 9 | D2 | bootstrap.sh, backup, deploy.yml, MIGRATION.md, CORS_ORIGINS/cookies | I | D1 | security config |
| 10 | T0 | API: security regressions (K1-K3,K7,K9, perms) | T | F2 | tests |
| 10 | T1 | API: P4 (aging, ledger, idempotency, promise, wa, isolation) | T | A4 | tests |
| 10 | T2 | API: P5 (ranking, no cost for STAFF, reservation, transfer, isolation) | T | B2,E1 | tests |
| 11 | T3 | API: P2 (rounding, verify-ledger, branch 403, products counts) | T | P25 | tests |
| 11 | T4 | E2E dues flow | T | C1-C3 | tests |
| 11 | T5 | E2E stock finder + min price | T | C5,C8 | tests |
| 12 | TE1 | E2E suites A auth/tenancy, I team, J agency | T | TID* | tests |
| 12 | TE2 | E2E suites B POS, C galla, F returns | T | TID* | tests |
| 12 | TE3 | E2E suites D khata, E inventory, G offline, H billing | T | TID* | tests |
| 13 | FIX* | Triage into BUGS.md, fix S1→S4 (tasks created from failures) | I | 12 | per bug |
| 13 | BENCH | seed --large, apps/bench k6 script, results | I | P25 | data gen + perf |
| 14 | CLOSE | full lint/build/API/E2E x3, STATUS.md | O+verifier | all | - |

Orchestrator-owned edits between waves: `app.module.ts`, `main.ts` bootstrap lines, `config/permissions.ts` (+ client `usePermissions.ts` mirror), `Header.tsx` (bell, quick-entry button, searchIndex keywords, Ctrl+K, F2), `Sidebar.tsx`, `apps/server/package.json` deps.

## Wave log

| Wave | Started | Result | Notes |
| --- | --- | --- | --- |
| 0a | 2026-10-11 | W0.1 cbcd7f8.. 1eab02c, W0.3 cbcd7f8, W0.5 1a9b0ce | Prisma AI guard blocks `migrate reset`; user consented in chat ("Yes, local 5433 only") to resets of local 5433 DBs; workers pass PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION at runtime only. Lockfile resynced 9aa9044. |
| 0b | 2026-10-11 | W0.2 4ecca1b, W0.7 416d067, F1 4933f79 | Seed: 2 businesses, 3 branches, 6 conditions. Sync idempotency scoped to business. Client re-sent failed items every 20 s before; now pending only. |
| 0c | 2026-10-11 | running: W0.4, W0.6, D1 | E2E uses its own DB deepkhata_e2e (E2E_DATABASE_URL) so API and E2E harnesses don't collide. unplugin-swc + @swc/core added to server devDeps for vitest. |
| 0c | 2026-10-11 | W0.6 a5da864, W0.4 c9cbfff, D1 c57e1e1 (+a94912f) | API harness on deepkhata_test, E2E on deepkhata_e2e (smoke 7/7). Server+admin images build; client image blocked by BUG: bad-merge duplicate declarations in components/reports (prod build broken on final-fixes) → FIX-CB. Removed glibc-only @tailwindcss/oxide pin. vite added as vitest peer. |
| 1 | 2026-10-11 | S1 b112f9c, TID1 12ea776, TID2a 7703627 | 6 migrations (0002-0007), zero drift, seed OK. pg_trgm extension emitted in 0002. Server tsc: 57 Decimal errors in cash, customers, orders, products, reports, vendors, seed.ts:298. |
| 2 | 2026-10-11 | running: M1, M1b, FIX-CB | M2 (vendors, cash, customers, inventory, products, seed) and M3 (reports, dashboard, agency) follow. |
| 2 | 2026-10-11 | M1 840c2bf, M1b 27aec24, M2 2c80119, M3 4075088, FIX-CB a043d92, bootstrap f933c18 | Server compiles on Decimal. Walk-in unpaid balances now post to OTHER_AR (were dropped / credited to fake 'REVENUE' customer). Customer list/detail share one balance. Client prod build fixed. Open: customer balance clamps negatives (overpayment) to 0 — check in khata E2E. settleMemo/processReturn/cancel still claim instances without status guard. |
| 3 | 2026-10-11 | G1 30bb234, F2 5e7eecd, P25 b363f4b, perms 5af6378 | Tenant context in JwtAuthGuard; K7/K8/K9/K10 fixed. Decision: products with branchId NULL are business-wide (listed in every branch). getProducts: 10 ms warm on seed. Known gap: removed staff keep a valid token until expiry (no per-user revocation). |
| 4 | 2026-10-11 | A1 0377e76; running A2, B1, C3 | |
| 4 | 2026-10-11 | A2 0757401, B1 5b8bccb, C3 3d03d72, schedule 7f90a55 | API suite 8/8 green after money+guard changes (run by orchestrator with user consent; haiku verifier declined second-hand consent, correctly). B1: fuzzy tier scans all products of a business (fine at 60; re-check at large seed). Seed has no partNumber/aliases and no vendor purchases → extend seed before T2/T5. |
| 5 | 2026-10-11 | A3 096aa18; running A4, B2, C1 | E2E dues flow must advance ≥10 days (default overdue offsets 3,7,14,30), not 8. |
| 5-6 | 2026-10-11 | B2 24c65d9, A4 d9a152f, E1 e7b9d2c, C1 a916e0e, E3 d99dad2, E2 4650c80, C2+nav 3dd9bba | Reservations/transfers, reminders cron (+ test-only POST /reminders/run behind ENABLE_TEST_ENDPOINTS), orders due date/reservation/min price, dues page, product fields + PATCH, vendor/restock payables, quick entry + Ctrl+K/F2/sidebar. Restock now posts VENDOR_PURCHASE per vendor. Photo upload hits Cloudinary before ownership check (orphan upload on 404) — minor, deferred. |
| 7-8 | 2026-10-11 | running: C5, C4, C6 | |
| 7-9 | 2026-10-11 | C5 47a4016, C6 d0a1bf9, C4 caa5692, TID3 3b7aac9, C8 be4affc, SEED45 e1d1310, C7 a741b1f | All client tasks done. Seed extended (catalog fixture). |
| 10 | 2026-10-11 | STOPPED (usage limit) | T0 + T1 test writers were stopped mid-task; any untracked files under apps/server/test/{security,sync,khata,dues,reminders}.e2e-spec.ts and test/helpers/ are partial — review or delete before resuming. |

## Resume here
Remaining: T0, T1 (rerun fresh), T2 (P5 API), T3 (P2 API), TID4 (products/restock/cabinets/agency-admin testids), D2 (bootstrap.sh, backup, deploy.yml, MIGRATION.md, CORS_ORIGINS env), T4/T5 (E2E dues + stock finder; advance clock ≥10 days; G5 keyboard at Hall Road also matches "840 keyboard"), TE1-TE3 (P1 suites A-J), FIX* + BUGS.md, BENCH (seed --large, k6; re-check stock-finder fuzzy scan), CLOSE (full verify ×3, STATUS.md).
| resume | 2026-10-18 | worktree recycled → nice-galileo-b02cae; baseline green (API 8/8, smoke 7/7, all builds) | Restored node_modules, .env, Postgres (same compose project/volume). Per-worker API DBs deepkhata_test_t0..t3; E2E harness parameterised (E2E_RUN_ID/ports/DB, E2E_SKIP_SERVER_BUILD) 26e63ee; CORS_ORIGINS env. |
| 10 | 2026-10-18 | T0 72bf8bc (19), K7 fix 889f710, T1 7fdeab9 (57), TID4 05137cf (client part) | BUG found by T0: logged-out token valid ~5 s (negative revocation cache) → fixed. TID4 agency-admin testids not done (turn limit). |
| 11 | 2026-10-18 | running: T2, T3, T4 | |
| 11 | 2026-10-18 | T2 0200b4e (57), T3 67c47e0 (47), T4 9dce4f1, T5 de0720d, fixes 50112cc + 54bb9cc | BUGS found+fixed: dues rows compared direction lowercase (WhatsApp never shown, T4); return refund ignored discount (S2, T3); 11-digit order search → 500 (T3); concurrent sales spurious 409 → SKIP LOCKED (T3); typo search similarity on whole string (T3). Test leak fixed (security spec vendor). E2E harness: optional agency-admin server, testid login, toast testid. |
| 12 | 2026-10-18 | running: TE2 (B,C,F), TID5, D2 | Remaining: TE1 (A,I,J; needs TID5 + E2E_WITH_ADMIN), TE3 (D,E,G,H), BENCH, CLOSE. |
| 12 | 2026-10-18 | TID5 55d7efa, TE1 a3f6fcd (83), D2 7bfc0d2, TE2 7ada3e6 (31), FIX-AUTH 6932238 | BUGS: managers blocked from /reports (S3), TeamTab role/revoke not wired (S3), role/removal only effective at token expiry (S1-ish) + deleted user 400 not 401, lockout IP spoofable via XFF, partial return marks whole order RETURNED (S3), cash refunds not in register expected cash (S2), close-register expense branch scope, walk-in name missing on invoice (S4). Fixed: auth set (6932238); running FIX-RET, FIX-CASH, FIX-UI. LESSON: concurrent `nest build` by several workers clobbers apps/server/dist → E2E API start fails; serialize builds. |
| 13 | 2026-10-18 | FIX-RET ecc8c55, FIX-CASH 6290b64, FIX-UI b61f2d1, markers ca908e9 + walk-in/TeamTab flip; E2E rerun p1a 83/83, p1b 29/30 (walk-in cold-compile timeout) | TE3 hit 40-turn limit at 131k ctx after khata.spec only → split into TE3b (khata+inventory, p1c) and TE3c (offline+billing, p1d). BENCH running (deepkhata_bench). BUGS.md written. Decision for user: refund on partly-paid return goes cash-first (kept existing policy). |
| 14 | 2026-10-18 | TE3b b23997e, TE3c 694efb1, PERF 55d7e15, UNIT 9bb917e, restock/import fix cd825f0, credit-sale leak fix 01a2f22; PR #1 opened | E2E 3 full runs: run 1 159 passed/1 failed (transfer-and-sell, flaky)/1 skipped; run 2 160/0/1; run 3 160/0/1; BENCH after PERF stock finder p95 46/68/240 ms |
