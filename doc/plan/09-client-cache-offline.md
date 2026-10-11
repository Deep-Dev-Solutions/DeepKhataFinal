# Phase 9: Client caching and offline

**Goal:** product, customer and vendor lookups cost zero network requests; the POS keeps selling
through internet drops; every queued write either syncs, fails visibly or is flagged as a conflict.

## Context

- Client already has Dexie (`src/lib/db.ts`: products, customers, syncQueue) and a flush loop (`src/lib/sync.ts`) posting to `/sync/batch`. Serwist caches the app shell.
- Phase 2 added `updatedAt` / `deletedAt` and indexes; Phase 1 fixed per-item sync results.

## Tasks

1. **Delta pull endpoint** `GET /sync/pull?since=<ISO>&entities=products,instances,customers,vendors,categories,cabinets,branches`:
   - Returns rows with `updatedAt > since` for the tenant (and branches the user can access), plus tombstones (`deletedAt` set), plus a new `cursor` (server time). Paged at 1,000 rows per entity.
   - Instance stock is summarised per product × branch × condition for other branches (no per-instance rows for other branches).
   - STAFF never receives cost fields.
2. **Dexie schema v2:** tables for products (with search fields from Phase 5), stockSummary, customers, vendors, categories, cabinets, branches, meta (cursors), syncQueue (v2 with per-item status and `attempts`). Write a Dexie upgrade from v1.
3. **Sync engine** (`src/lib/sync/`):
   - Pull on app open, every 60 s while visible, after every successful local write and on `online`.
   - Push queue first, then pull.
   - Exponential backoff, max attempts 10, then `failed` with a visible "Needs attention" list.
4. **Local search:** POS search, customer picker and stock finder query Dexie first (MiniSearch index built in a web worker for fuzzy matching across name, SKU, part number, aliases, compatibility), showing results in under 100 ms; the server is only queried when the local cache is empty or stale (> 10 min).
5. **TanStack Query** for everything not in Dexie (reports, dashboards, dues lists, notifications): `staleTime` 30 s for dues/notifications, 5 min for reports; invalidate on related mutations.
6. **Offline writes** extended beyond orders: record payment, khata entry (Phase 4), customer create/edit, expense. Each gets a client UUID; the server handlers are idempotent by that ID.
7. **Conflicts:** server rejects selling an instance already sold or reserved; client shows the conflict with options (pick another instance, cancel line, convert to estimate). Never drop a queued sale silently.
8. **Status UI:** header indicator (online / offline / syncing N / needs attention), last synced time, "Sync now" button.

## Tests

- E2E: load app online → go offline → search finds products and customers → make 2 sales and 1 payment → reload page while offline (app shell loads) → go online → all 3 synced, no duplicates.
- E2E: conflict scenario from Phase 1 suite G still passes with the new engine.
- Network assertion: typing a product search while online makes zero `/products` requests once the cache is warm.
- Unit: delta merge applies updates and tombstones correctly; Dexie v1 → v2 upgrade keeps queued items.

## Acceptance criteria

- [ ] Product, customer and vendor search make no network calls with a warm cache.
- [ ] POS works fully offline for sales, payments, khata entries and new customers.
- [ ] Every queued item ends `synced`, `failed` (visible) or `conflict` (visible). None stuck.
