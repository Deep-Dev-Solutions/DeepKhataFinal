# Run: Phases 4 + 5 (Lena/Dena reminders + Stock finder)

Status: DRAFT task graph prepared by Claude on 2026-10-11 from a code audit.
The orchestrator must confirm it against fresh scout maps, adjust, then ask the user once to approve.

## Facts already verified (paste into briefs; don't re-scout these)

- Branch: `final-fixes`. Server is NestJS 12 + Prisma 6 (Float money today). Client is Next 16 (read `node_modules/next/dist/docs/` before Next changes).
- Ledger: `LedgerService.createBalancedTransaction(dto)` in `apps/server/src/ledger/ledger.service.ts` (balance check `|sum| > 0.001` rejects). Account types in use: `REVENUE`, `ASSET` (cash/bank), `CUSTOMER_AR` (accountId = customerId), `VENDOR_PAYABLE` (accountId = vendorId), `INVENTORY`.
- Credit sales: `OrdersService.newOrder` (`orders.service.ts:55`), postings built in `postDoubleEntrySequence` (`:290`); customer payments in `recordPayment` (`:742`). Orders carry `paymentStatus` (UNPAID/PARTIAL/PAID) and `payments[]`.
- Vendor credit: there is **no bill model**. A purchase is a `Transaction` with `type: 'VENDOR_PURCHASE'` (`vendors.service.ts:353`); payments are `type: 'VENDOR_PAYMENT'` (`:402`). Vendor balance = sum of `VENDOR_PAYABLE` postings.
- Cross-branch stock today: `GET /products/global-stock` → `ProductsService.getGlobalStock` (`products.service.ts:406`), UI `components/modals/GlobalStockLookupModal.tsx`. No transfer feature exists (`/products/move-stock` is only for deleted branches).
- Command palette entries: array in `apps/client/src/components/dashboard/Header.tsx` (~lines 35-130, `keywords: string[]`). A `Bell` icon exists in Header (~line 550) but is static.
- Sidebar nav: `apps/client/src/components/dashboard/Sidebar.tsx` lines 33-59.
- Settings notifications placeholder: `apps/client/src/components/settings/NotificationsTab.tsx` (836 bytes, "coming soon").
- Module registry: `apps/server/src/app.module.ts`. Permissions: `apps/server/src/config/permissions.ts`.
- Seed users and tenants: `apps/e2e/fixtures/users.ts` (GM Traders with branches Hafeez Centre and Hall Road; Shahzaib Electronics for isolation).

## Design decisions (fixed for this run)

- Payables due dates: add `dueDate DateTime?` to `Transaction`, set only for `VENDOR_PURCHASE`. Open amount per vendor uses FIFO: payments settle the oldest purchases first. Aging uses each purchase's unsettled remainder.
- Receivables: `Order.dueDate`, open amount = `totalAmount - discount - sum(payments)`.
- KhataEntry postings:
  - RECEIVABLE create: Dr `CUSTOMER_AR` (customer) or `OTHER_AR` (accountId = entry id) / Cr `ASSET` (cash lent out).
  - PAYABLE create: Dr `ASSET` (cash received) / Cr `VENDOR_PAYABLE` (vendor) or `OTHER_AP`.
  - Settle receivable: Dr `ASSET` / Cr the AR account. Settle payable: Dr the AP account / Cr `ASSET`.
  - Write-off receivable: Dr `BAD_DEBT_EXPENSE` / Cr the AR account (owner only).
  - Flag for the user: if the informal entry was goods rather than cash, the counter-account differs. For now an optional `counterAccount` field (`ASSET` default, `REVENUE` allowed) handles it.
- New money columns are `Decimal @db.Decimal(14,2)` even though old ones are Float (Phase 2 migrates the rest). Convert at the ledger boundary with `Number(decimal.toFixed(2))` until Phase 2.
- Scheduler: `@nestjs/schedule`, every 15 minutes, Asia/Karachi. Idempotency: unique `NotificationLog(ruleKey, entityId, fireDate)`.
- Search: enable `pg_trgm`; a generated `search_text` column on Product (name, sku, partNumber, aliases, compatibleWith) with a GIN trigram index.
- Staff responses never include cost fields (`unitCost`, `defaultCostPrice`).

## Task graph (draft)

Legend: Q = quick-implementer (haiku), I = implementer (sonnet), T = test-writer (sonnet), O = orchestrator (opus).

### Wave 0: unblock (sequential)

| Id | Task | Agent | OWNS | Acceptance |
| --- | --- | --- | --- | --- |
| W0.1 | Reconcile schema with the baseline migration and seed per the user's item-condition decision; regenerate the baseline from the final `schema.prisma` and add a follow-up migration if needed | I | `apps/server/prisma/schema.prisma`, `prisma/migrations/**` | `npm run db:reset` then `npx prisma migrate status` clean |
| W0.2 | Make `seed.ts` match the schema and run green | I | `apps/server/prisma/seed.ts` | `npm run db:reset && npm run db:seed` exits 0 |
| W0.3 | Redis optional (no-op without `REDIS_URL`, `lazyConnect`, 500 ms timeout, `SCAN` instead of `KEYS`) | I | `apps/server/src/redis/redis.service.ts` | `REDIS_URL= npm run build -w server` + server boots without Redis |
| W0.4 | `apps/e2e` workspace: `package.json`, `playwright.config.ts` (setup project with storageState per role, chromium project, webServer for API + client on test DB), `helpers/api.ts`, `helpers/db.ts`, `helpers/ledger.ts`, `tests/smoke.spec.ts` (each role reaches the dashboard) | I | `apps/e2e/**` (except fixtures) | `npm run test:e2e -- tests/smoke.spec.ts` |
| W0.5 | Security K1-K3: remove JWT fallback secret (fail fast at boot); `/onboard/onboarding` requires auth and uses `req.user.id`; `/team/invite` takes businessId from `req.user` | I | `jwt.strategy.ts`, `onboarding.controller.ts`, `onboarding.service.ts`, `team.controller.ts`, `team.service.ts` | API test proving each hole is closed |

### Wave 1: one schema change for both phases

| Id | Task | Agent | OWNS | Acceptance |
| --- | --- | --- | --- | --- |
| S1 | Migration `p4_p5_dues_stockfinder`: `Order.dueDate`; `Transaction.dueDate`; `Business.defaultReceivableDays (7)`, `defaultPayableDays (15)`; `Customer.paymentTermsDays?`; models `KhataEntry`, `PromiseToPay`, `Notification`, `NotificationSetting`, `NotificationLog`; Product `partNumber`, `aliases String[]`, `compatibleWith String[]`, `minSalePrice Decimal?`, `lowStockThreshold Int?`, generated `search_text` + trigram index; ProductInstance `photoUrl`, `notes`; models `StockReservation`, `StockTransferRequest` + items; `pg_trgm` extension; all indexes on `(businessId, ...)` | I | `schema.prisma`, `prisma/migrations/**` | `npm run db:reset && npm run db:seed && npx prisma migrate status` |

### Wave 2: server core (3 parallel writers)

| Id | Task | Agent | OWNS | Depends |
| --- | --- | --- | --- | --- |
| A1 | `NotificationsModule`: service `notify({businessId, userId?, type, title, body, link, entityType?, entityId?})`, `GET /notifications`, `POST /notifications/read`, `GET/PUT /notification-settings` with defaults from the phase 4 rules table | I | `src/notifications/**` | S1 |
| A2 | `KhataEntriesModule`: create, update, settle (partial), write-off, using the posting rules above | I | `src/khata-entries/**` | S1 |
| B1 | `StockFinderModule`: `GET /stock/find?q=` ranked by exact partNumber > trigram similarity; per-branch counts; own-branch cabinet locations; last 5 sold prices; no cost fields for STAFF | I | `src/stock-finder/**` | S1 |

Orchestrator after the wave: register modules in `app.module.ts`; add `read:dues`, `manage:dues`, `read:stock-finder`, `manage:transfers` to `permissions.ts`.

### Wave 3: server features (3 parallel)

| Id | Task | Agent | OWNS | Depends |
| --- | --- | --- | --- | --- |
| A3 | `DuesModule`: `GET /dues/summary`, `GET /dues` (orders + VENDOR_PURCHASE FIFO + khata entries), promise endpoint, `reminded` endpoint, `whatsapp-link` builder with 03xx→923xx normalisation and Roman Urdu/English templates | I | `src/dues/**` | A1, A2 |
| A4 | Scheduler: install `@nestjs/schedule`, a `RemindersJob` evaluating every rule key, idempotent via NotificationLog, calling `NotificationsService.notify` | I | `src/reminders/**`, `apps/server/package.json` | A1 |
| B2 | Reservations (create, release, expiry job) and transfers (request, dispatch, receive moving instances, InventoryMovement rows, notify the other branch's managers via `NotificationsService.notify`) | I | `src/stock-transfers/**`, `src/reservations/**` | A1, S1 |

### Wave 4: touch existing services (sequential: same file)

| Id | Task | Agent | OWNS | Depends |
| --- | --- | --- | --- | --- |
| E1 | `orders.service.ts`: set `dueDate` on credit sales (from body or customer/business terms); block sale of reserved instances; block STAFF price below `minSalePrice` (owner/manager allowed with a `priceOverrideReason`) | I | `orders.service.ts`, order DTOs | A3, B2 |
| E2 | `vendors.service.ts recordPurchase`: accept and store `dueDate` (default business payable days) | Q | `vendors.service.ts`, its DTO | S1 |
| E3 | Product create/update and CSV import accept the new product fields | I | `products.service.ts`, product DTOs, `products.controller.ts` | S1 |

### Wave 5: client (3 parallel per batch, two batches)

| Id | Task | Agent | OWNS |
| --- | --- | --- | --- |
| C1 | `/dues` page (cards, Lena/Dena tabs, aging chips, row actions incl. WhatsApp, record payment, promise, snooze) | I | `app/(dashboard)/dues/**`, `components/dues/**` |
| C2 | Quick lena/dena modal (open from header button and palette) | I | `components/modals/QuickKhataModal.tsx` |
| C3 | Notification bell dropdown + polling (TanStack Query not yet in the repo: plain fetch with a 60 s interval) | I | `components/dashboard/NotificationBell.tsx` |
| C4 | Settings → Notifications (replace placeholder) | I | `components/settings/NotificationsTab.tsx` |
| C5 | `/stock-finder` page + customer-waiting view + reserve + request transfer | I | `app/(dashboard)/stock-finder/**`, `components/stock-finder/**` |
| C6 | Transfers inbox widget + dashboard "Aaj wasooli" and "Aaj dena hai" widgets | I | `components/dashboard/widgets/{Transfers,DuesToday}*.tsx` |
| C7 | Product form fields (partNumber, aliases, compatibleWith, minSalePrice, lowStockThreshold) mirroring existing inputs | Q | `components/modals/AddProductModal.tsx`, product edit page |
| C8 | Checkout: due-date field when a balance remains; min-price error display | I | `components/pos/CheckoutDrawer.tsx` |

Orchestrator between batches: mount `NotificationBell` and the quick-entry button in `Header.tsx`; add palette entries (lena, dena, wasooli, udhar, maal, stock, dhoondo) and sidebar links; add F2 hotkey.

### Wave 6: tests (3 parallel)

| Id | Task | Agent |
| --- | --- | --- |
| T1 | API tests: aging buckets with a fixed clock, KhataEntry ledger balance (create, settle, write-off), reminder idempotency, WhatsApp normalisation, isolation for every new `:id` route | T |
| T2 | E2E dues: quick entry Rs 2,000 "Rana Electronics" due in 7 days → listed → clock +8 days → overdue notification → WhatsApp URL correct → record payment → settled | T |
| T3 | E2E stock finder: staff at Hall Road finds "840 keyboard" at Hafeez Centre, no cost fields in the network response, requests transfer → manager dispatches → receive → sellable; staff below min price blocked | T |

### Wave 7: close

`verifier` on lint, build (server, client, admin), API tests, full E2E. Opus reviews money/tenancy hunks, updates STATUS.md, reports.

## Wave log

| Wave | Started | Result | Notes |
| --- | --- | --- | --- |
