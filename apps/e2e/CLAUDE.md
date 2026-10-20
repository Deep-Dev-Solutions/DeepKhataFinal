# apps/e2e

- Selectors: `data-testid` only (accessible selectors allowed until testids exist in the app).
- One spec per flow, under `tests/<suite>/`. No `waitForTimeout`; use web-first assertions or `expect.poll`.
- Never weaken an assertion to make a test pass; a failing spec can mean the app is wrong.
- Traces/screenshots are kept on failure (`playwright-report/`, `test-results/`).
- Setup data via `helpers/api.ts` (`apiAs`); assert outcomes via `helpers/db.ts` (`db`) and `helpers/ledger.ts`.
- Auth: `test.use({ storageState: storage('staffA') })` (`helpers/auth.ts`); state is written by `tests/auth.setup.ts`.
- DB: `E2E_DATABASE_URL` (fallback `DATABASE_URL_TEST`), localhost only. Global setup resets and seeds it, so the reset needs
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` when run by an AI agent. Never write that value into a file.
- Run: `npm run test:e2e -- tests/smoke.spec.ts` from the repo root.
