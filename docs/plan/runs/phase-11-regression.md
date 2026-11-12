# Phase 11 — T21 full regression

Date: 2026-11-12
Branch: `fix/phase-11`, HEAD after T01–T20 plus `fix(T21)` (close adjustments).
Compared against `docs/plan/runs/phase-11-baseline.md` (commit `525a845`).
Environment: Node v24.19.0, npm 11.17.0, Postgres 17 on :5434, Mailpit SMTP
:1026 / HTTP :8026.

The baseline rule was: only *new* logic failures count, because the baseline's
red tests were all environmental (Mailpit port, agency app port, killed
processes).

## Result

| Check | Baseline (T00) | Now | Verdict |
| --- | --- | --- | --- |
| `npm run lint` | 0 errors, 204 warnings | **0 errors, 211 warnings** | pass |
| `npm run build` (all workspaces) | pass | **pass** | pass |
| `npm run test:api` | 4 failed / 441 passed / 9 skipped, 2 files red | **4 failed / 504 passed / 9 skipped, 2 files red** (43 files, up from 30) | pass, same 4 environmental tests |
| Playwright (all 225 tests, `E2E_WITH_ADMIN=1`) | not obtainable in this working copy | **202 passed, 1 skipped, 5 failed, 17 downstream did not run** | pass, no logic failures |

`test:api` totals went from 454 to 517 tests (+63) and Playwright from 200 to 225
(+25) as the Phase 11 tickets added coverage.

## The 4 API failures are still the same Mailpit ones

`mail.e2e-spec.ts` (whole file) and 4 tests in `accounts.e2e-spec.ts` fail with
`connect ECONNREFUSED 127.0.0.1:8025`: this working copy publishes Mailpit on
**8026/1026**, while the specs default to 8025/1025.

Verified green on the local ports:

```
cd apps/server && MAILPIT_URL=http://127.0.0.1:8026 \
  npx vitest run --config ./vitest.config.e2e.ts \
  test/mail.e2e-spec.ts test/accounts.e2e-spec.ts
→ Test Files 2 passed, Tests 34 passed
```

`mail.e2e-spec.ts` no longer pins `SMTP_PORT=1025`; it keeps whatever the
environment provides, so the same command works for CI (defaults unchanged) and
for a local stack on other ports.

## The 5 Playwright failures

| Spec:line | Cause |
| --- | --- |
| `accounts/accounts.spec.ts:98`, `:144` | Mailpit on 8025 vs 8026. |
| `billing/trial-to-paid.spec.ts:119` | Mailpit on 8025 vs 8026 (agency invoice email). |
| `team/invite-flow.spec.ts:23` | Mailpit on 8025 vs 8026 (invite email). |
| `accounts/accounts.spec.ts:263` | One-off `socket hang up (ECONNRESET)` against :5000; later API tests in the same run passed. |

The 17 `did not run` rows are the rest of those four files' serial chains, not
independently red.

Re-ran just those three files with the local Mailpit port:

```
cd apps/e2e && MAILPIT_URL=http://127.0.0.1:8026 E2E_WITH_ADMIN=1 \
  E2E_SKIP_SERVER_BUILD=1 npx playwright test \
  tests/accounts tests/billing/trial-to-paid.spec.ts tests/team/invite-flow.spec.ts
→ 32 passed (2.5m)
```

That includes the ECONNRESET test, which passes on a clean run.

Note: the baseline could not run the agency specs at all because
`E2E_WITH_ADMIN` was unset (no app on :3001). This run set it, so
`tests/agency/*` executed for the first time and passed.

## Regressions found and fixed during T21

The first full `test:api` after T01–T20 had 11 failures in 6 files. Eight were
caused by new specs assuming an empty database while every file shares one
seeded DB (`fileParallelism: false`, reset once per run), and one was a real bug:

1. **Close register ignored adjustments (real bug).** `closeRegister` computed
   expected cash without `cashAdjustments`, while `getRegisterStatus` and the
   Z-report include them. Closing a galla after an earlier galla's voucher was
   voided therefore stored a wrong expected cash, reported a variance and
   demanded a note. Fixed in `apps/server/src/cash/cash.service.ts`
   (`reconciliation.cashAdjustments` added) with a new test in
   `close-register-variance.e2e-spec.ts`.
2. **Expense-day totals were absolute.** Earlier specs leave vouchers in the same
   branch and day; `cash-expenses-daily.e2e-spec.ts` now works from a snapshot
   and asserts deltas, and voids the voucher it created instead of "the first
   row".
3. **Per-branch counter test depended on file order.** `order-numbers.e2e-spec.ts`
   now resets a branch's counter to the business max (the state a fresh seed
   leaves) before asserting, and reads the counter for the 20-concurrent case.
4. **RBAC fixture collided with the new unique index.** `rbac-escalation.e2e-spec.ts`
   created an order through Prisma without a number, so the global
   `autoincrement()` default could hand out a number the branch counter had
   already issued (T19 added `@@unique([businessId, branchId, orderNumber])`).
   The fixture now allocates through `nextOrderNumber`, the same allocator the
   POS uses.

After those fixes the full API suite is 504 passed / 4 environmental failures,
and the six affected files pass together in one run (44 tests).

## Not covered here

- Production/Supabase was never touched; all runs used the local docker Postgres
  and the dedicated `deepkhata_test` database.
- Full-suite Playwright runs remain sensitive to this working copy: an unrelated
  agent process is active here and has previously removed `node_modules` and
  killed the API mid-run. The single ECONNRESET above is that class of noise.
