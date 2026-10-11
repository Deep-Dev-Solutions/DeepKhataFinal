# Phase 0: Foundation

**Goal:** a reproducible local stack, real migration history, realistic seed data and an E2E harness,
so every later phase can be tested the same way.

## Context

- Monorepo: `apps/server` (NestJS 12, Prisma 6), `apps/client` (Next 16 PWA, Dexie, Serwist), `apps/agency-admin` (Next).
- Schema is currently applied with `prisma db push`; there is no `prisma/migrations` folder.
- `apps/server/AGENTS.md` still describes Vercel serverless constraints. Those go away in Phase 3.
- Mailer already falls back to Mailpit on `127.0.0.1:1025` in dev (`apps/server/src/utils/mailer.ts`).

## Tasks

1. **Root `CLAUDE.md`.** Create it with: repo map, how to run the stack, the Global rules from `docs/plan/README.md` (multi-tenancy, money, database, tests), and the command list below. Keep it under 120 lines.
2. **Docker Compose for dev** (`docker-compose.dev.yml` at root):
   - `postgres:17` on port 5432 (dev DB `deepkhata`) and a second database `deepkhata_test` for E2E.
   - `mailpit` (SMTP 1025, UI 8025).
   - `redis:7` is **optional** behind a compose profile `redis`. The app must start without it (see task 6).
3. **Root scripts** (root `package.json`, npm workspaces): `dev` (server + client + admin concurrently), `db:up`, `db:migrate`, `db:seed`, `db:reset`, `test:api`, `test:e2e`.
4. **Migration baseline.**
   - Generate `prisma/migrations/0000_baseline` from the current schema with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
   - Document in `docs/plan/STATUS.md` the one-time command to mark it applied on the existing Supabase DB: `prisma migrate resolve --applied 0000_baseline`. **Do not run it against production yourself.**
   - Replace `prisma:push` script with `prisma:migrate` (`prisma migrate deploy`).
5. **Seed script** `apps/server/prisma/seed.ts` (idempotent, deterministic IDs):
   - Super admin (agency).
   - Tenant A "GM Traders": branches "Hafeez Centre" and "Hall Road", users owner/manager/staff, 3 cabinets per branch with rack/shelf/bin, 60 products (laptop parts) with mixed conditions, stock split across branches (including items only at the other branch), 20 customers (some with udhar), 6 vendors, 30 historical orders, one open register.
   - Tenant B "Shahzaib Electronics": 1 branch, 20 products, 5 customers. Used for isolation tests.
   - A `--large` flag that generates the benchmark dataset (5,000 products, 15,000 instances, 2,000 customers, 50,000 orders per tenant) for k6 later.
   - Fixed test credentials exported from `apps/e2e/fixtures/users.ts`.
6. **Make Redis optional.** `RedisService` becomes a no-op cache when `REDIS_URL` is unset (get returns null, set/delete do nothing). Replace `KEYS` in `deleteByPattern` with `SCAN` + batched `DEL`. Set `lazyConnect`, `maxRetriesPerRequest: 1` and a 500 ms command timeout so a dead Redis never hangs a request.
7. **E2E harness** `apps/e2e`:
   - `@playwright/test`, `playwright.config.ts` with projects: `setup` (logs in each role, saves `storageState` to `.auth/<role>.json`), `chromium` (depends on setup).
   - `webServer` entries that start the API (port 5000) and client (port 3000) against `deepkhata_test`; `globalSetup` runs `prisma migrate reset --force` + seed on the test DB.
   - Helpers: `api.ts` (typed request helper using a role's token), `db.ts` (direct Prisma client on the test DB for assertions), `ledger.ts` (asserts every transaction's postings sum to 0).
   - Install Playwright agent CLI skills: `npx playwright-cli install --skills` (adds `.claude/skills/playwright-cli`).
   - `apps/e2e/CLAUDE.md` with rules: `data-testid` selectors only, one spec per flow, no `waitForTimeout`, never weaken assertions, traces on failure.
8. **API test harness.** Confirm `vitest.config.e2e.ts` in `apps/server` runs against `deepkhata_test` with a fresh seed; add a sample test for `GET /` health.
9. **CI skeleton** `.github/workflows/ci.yml`: on PR → install, lint, build all apps, start Postgres service, migrate + seed, run API tests and the E2E suite (Chromium). Upload Playwright traces and HTML report as artifacts on failure.
10. **Health endpoint.** `GET /health` returns `{ status, db: 'up'|'down', version, uptime }` (checks `SELECT 1`). Used by Docker, Caddy and the Cloudflare smoke Worker later.

## Acceptance criteria

- [ ] Fresh clone → `npm i && npm run db:up && npm run db:migrate && npm run db:seed && npm run dev` works with no Supabase or Redis.
- [ ] `prisma migrate status` reports the baseline migration applied on the dev DB.
- [ ] `npm run test:e2e` runs a placeholder spec that logs in as each role via stored state.
- [ ] CI workflow runs green on a PR.
- [ ] App runs with `REDIS_URL` unset and no request takes longer because of it.
