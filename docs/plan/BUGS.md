# Bug log: phases 1-10

Severity: S1 = data loss or security, S2 = wrong money or stock, S3 = broken feature, S4 = cosmetic.
Each fixed bug has a regression test (API spec in apps/server/test or Playwright spec in apps/e2e).

## Fixed

| # | Sev | Bug | Fix commit | Regression test |
|---|-----|-----|-----------|-----------------|
| 1 | S1 | K1-K3 security holes (tenant spoofing via body/header, unchecked x-branch-id, unauthenticated paths) | 1a9b0ce, 30bb234 | test/security.e2e-spec.ts |
| 2 | S1 | Logged-out token still accepted for up to 30 s (negative revocation cache, K7) | 889f710 | test/security.e2e-spec.ts |
| 3 | S1 | Role change and member removal only took effect at token expiry; a deleted user's token got 400 instead of 401 | 6932238 | tests/team/invite-flow.spec.ts, tests/auth/role-matrix.spec.ts |
| 4 | S1 | Login lockout keyed on a spoofable X-Forwarded-For | 6932238 | tests/auth/lockout.spec.ts |
| 5 | S2 | Return refund ignored the order discount (refunded gross) | 54bb9cc | test/money-ledger.e2e-spec.ts |
| 6 | S2 | Expected drawer cash ignored cash refunds; close-register not scoped to a branch | 6290b64 | tests/cash/register.spec.ts |
| 7 | S2 | Concurrent sales of the same stock got spurious 409s (no SKIP LOCKED) | 54bb9cc | test/orders-rules.e2e-spec.ts |
| 8 | S2 | Test-only leak: security spec paid a seeded vendor and broke dues FIFO | 0200b4e | test/dues.e2e-spec.ts |
| 9 | S3 | A partial return set the whole order RETURNED, blocking the remaining units | ecc8c55 | tests/returns/returns.spec.ts |
| 10 | S3 | Dues direction casing mismatch hid the WhatsApp and pay buttons | 50112cc | tests/dues/*.spec.ts |
| 11 | S3 | Managers got 403 on reports | 6932238 | tests/auth/role-matrix.spec.ts |
| 12 | S3 | 11-digit order search caused a 500 (int overflow) | 54bb9cc | test/orders-rules.e2e-spec.ts |
| 13 | S3 | Typo search found nothing (similarity instead of word_similarity) | 54bb9cc | test/stock-finder.e2e-spec.ts |
| 14 | S3 | TeamTab role select and Revoke button not wired | b61f2d1 | tests/team/invite-flow.spec.ts |
| 15 | S3 | Client production build broken by duplicate code in reports tabs after a bad merge | a043d92 | npm run build -w client |
| 16 | S3 | Schema/migration/seed mismatch; Redis required to boot | 1eab02c, 4ecca1b, cbcd7f8 | CI, test:api |
| 17 | S4 | Logout cookie clear options differed from set options (cookie not cleared on some hosts) | 7bfc0d2 | tests/auth/login-logout.spec.ts |
| 18 | S4 | Walk-in name typed at checkout missing on invoice and order page | b61f2d1 | tests/pos/walkin-cash.spec.ts |
| 19 | S2 | Every vendor restock with a unit cost returned 500 (selected Vendor.name; field is businessName) | cd825f0 | tests/inventory/inventory.spec.ts |
| 20 | S3 | CSV import skipped blank-name rows silently; a non-numeric price gave a 500 | cd825f0 | tests/inventory/inventory.spec.ts |
| 21 | S3 | Server unit suite could not run (no SWC in vitest unit config; scaffold specs had no providers) | 9bb917e | npm test -w server |

## Open / deferred

| # | Sev | Bug or gap | Why deferred |
|---|-----|-----------|--------------|
| D1 | S3 | POS has no item-condition picker; instances are picked automatically | Feature gap, needs product decision (tests/pos/condition-select.spec.ts is test.fixme) |
| D2 | S2 | Return refund goes to cash first, then reduces receivable, for a partly-paid order | Existing policy kept; owner decision (see STATUS decisions) |
| D3 | S3 | Customer balance clamps overpayment to 0 (no customer credit) | Needs a credit/advance design |
| D4 | S4 | Photo upload leaves an orphan Cloudinary file when the product 404s | Low impact |
| D5 | S3 | Login lockout is per IP, so one shop's shared IP can lock everyone out | Needs per-account + IP design |
| D6 | S3 | logExpense picks the open session without a branch when branchId is absent | Low risk; client always sends branch |
| D7 | S3 | Close register falls back to body branchId only (no x-branch-id fallback) | One-line controller change; client sends body |
| D8 | S4 | MANAGER sees an enabled Revoke button but the server allows OWNER only (403 toast) | UI polish |
| D10 | S3 | No CSV import UI in the client (API only); no item-condition input at product creation or restock (PATCH instance only) | Feature gap |
| D11 | S4 | settings.service inviteStaff alias counts members only, not pending invites (team.service counts both); no UI calls it | Low risk; remove alias or align |
| D9 | - | API emits money as JSON numbers, not strings | Contract change; all clients would need updating |

## Phases 6-10 items (carried from the phase-6-10 worktree, 2026-10-21)

| # | Sev | Item | Status |
|---|-----|------|--------|
| N1 | S3 | `offlineSyncedOrders` is always 0 in TenantDailyUsage: orders created via `/sync/batch` carry no `isOfflineSync` flag | Open; fix is task 4 of the close run (column via migration plus the sync path) |
| N2 | - | Trial lifecycle emails (days 3, 7, 25) fire when 0-2 days past the threshold; the daily cron tolerates a missed day without duplicates | Working as designed |
| N3 | S3 | Branch-restricted staff without `x-branch-id`: now default to their only branch, or 400 when they have several | Fixed in addf497 |
| N4 | S3 | `User.updatedAt` was missing, so delta sync could not track user changes | Fixed by migration `0011_user_updated_at` |

## Truth run (final-fixes close, 2026-10-21)

Failures found by the truth run are logged here as T1, T2, ... with the app fix and the test that guards it.
