# Phase 11 — T00 baseline

Date: 2026-11-12
Branch: `fix/phase-11` (created from `admin-audit` at `008aed2`)
Node v24.19.0, npm 11.17.0, Postgres 17 on :5434, Mailpit SMTP :1026 / UI :8026.

Command results before any Phase 11 fix (homepage work excepted, see note at the end):

| Check | Result | Notes |
| --- | --- | --- |
| `npm run lint` | pass (exit 0) | 204 warnings, 0 errors. Warnings are pre-existing (`any`, unused vars, `set-state-in-effect`). |
| `npm run build` | pass (exit 0) | Every workspace, including `server`, `client`, `agency-admin`, desktop apps. |
| `npm run test:api` | **fail** | 2 files failed, 28 passed; 4 tests failed, 441 passed, 9 skipped. |
| `npm run test:e2e` | **not green** | Environmental, see below. Run 3 reached 85 passed before the API client dependency vanished. Run 5 reached 21 passed / 40 not run before the API process died. |

## API test failures (all Mailpit, not logic)

Mailpit is published on **127.0.0.1:8026** by `docker-compose.dev.yml` in this
working copy, but the specs hardcode port 8025:

- `apps/server/test/mail.e2e-spec.ts` — whole file fails in `beforeAll`
  (`Mailpit must be reachable on 127.0.0.1:8025`); 9 tests skipped.
- `apps/server/test/accounts.e2e-spec.ts` — 4 tests:
  - `registers, mails a verify link (EmailLog + Mailpit) and verifies`
  - `resends verification for an unverified user only`
  - `lets an unverified owner log in but blocks team creation with EMAIL_NOT_VERIFIED`
  - `resets with the mailed link, revokes sessions, and does not enumerate emails`
  — cause `connect ECONNREFUSED 127.0.0.1:8025`.

These pass unchanged when Mailpit is reachable on 8025 (for example by setting
`MAILPIT_URL` for specs that read it; `mail.e2e-spec.ts` also pins
`SMTP_PORT=1025`).

## E2E failures

The suite could not produce a clean full baseline in this environment. Observed
test-level failures, with their causes:

| Spec:line | Cause |
| --- | --- |
| `accounts/accounts.spec.ts:98`, `:144` | Mailpit port mismatch (8025 vs 8026). |
| `agency/agency-console.spec.ts:17,24,30,35,51`, `agency/deals.spec.ts:21`, `agency/plans.spec.ts:48`, `agency/session-switch.spec.ts:184,229,263`, `agency/view-as.spec.ts:58` | Fail in ~200 ms; the agency admin app is not listening on :3001 in this run (`webServer` only starts the API and the client). |
| `auth/lockout.spec.ts:10` | Runs immediately before the API becomes unreachable (see next row). |
| Everything after `auth/login-logout.spec.ts:16` | `TypeError: Failed to fetch` from `apiFetch`/AuthContext — the API process on :5000 disappeared mid-run. No Nest crash was logged, so it was killed externally. |
| `accounts/accounts.spec.ts:127/167/188/198`, many `role-matrix`/`tenant-isolation` API rows | Skipped (`did not run`) because of the two failures above in the same file/worker, not independently red. |

Environment notes:

- An unrelated agent process (`/home/jb/.gemini/bin/agy --hub … --add-dir=/home/jb/Projects/DeepKhata`) was active in this working copy during the runs. Earlier it coincided with the root `node_modules` directory disappearing and with a wedged `next dev` on :3000. This makes long e2e runs unreliable here.
- `apps/e2e/playwright.config.ts` uses `reuseExistingServer: !process.env.CI`, so a stale/wedged dev server on :3000 is reused. Kill it before a fresh run.
- The e2e global setup resets a dedicated test database via `prisma migrate reset --force --skip-seed` + `prisma db seed`; this is expected and does not touch the dev database.

## Baseline verdict

Known-red at HEAD: the 4 Mailpit API tests, the Mailpit E2E accounts tests,
the agency E2E specs that need :3001, and any spec that ran after the API was
killed. None of these are logic failures in the code Phase 11 touches. T21 must
compare against this list and treat only *new* failures as regressions.

Note: the marketing homepage rewrite (`apps/client/src/app/page.tsx`,
`home.module.css`, smooth-scroll rule in `globals.css`) was requested separately
and is not part of the Phase 11 ticket list. It landed after these measurements;
`npm run lint -w client` and `npm run build` were re-run on it and stay green.
