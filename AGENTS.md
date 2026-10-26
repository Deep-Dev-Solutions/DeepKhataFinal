# DeepKhata

## Repo map

- `apps/server`: NestJS 11 API, Prisma 6, Postgres.
- `apps/client`: Next 16 PWA with Dexie and Serwist. Read `apps/client/AGENTS.md` before Next changes.
- `apps/agency-admin`: Next super-admin app.
- `apps/e2e`: Playwright specs.
- `docker/`: dev Postgres init.
- `docs/plan`: build plan. Git-excluded, except `docs/plan/runs` and `claude-setup`.

## Run the stack

1. `npm i`
2. `npm run db:up` starts Postgres 17 and Mailpit.
   - Redis is optional: `docker compose -f docker-compose.dev.yml --profile redis up -d`.
   - If host port 5432 is taken, `export POSTGRES_PORT=5433` and update `apps/server/.env` to match.
3. `npm run db:migrate`
4. `npm run db:seed`
5. `npm run dev` starts the api on :5000, client on :3000, admin on :3001.

Mailpit UI: http://localhost:8025

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start api (:5000), client (:3000) and admin (:3001) together. |
| `npm run db:up` | Start dev Postgres and Mailpit via docker compose, waiting until healthy. |
| `npm run db:down` | Stop the dev docker compose stack. |
| `npm run db:migrate` | Apply server Prisma migrations. |
| `npm run db:seed` | Seed the dev database via the Prisma seed script. |
| `npm run db:reset` | Force-reset the dev database with `prisma migrate reset`. |
| `npm run test:api` | Run the server API tests. |
| `npm run test:e2e` | Run the Playwright specs in `apps/e2e`. |
| `npm run lint` | Run lint in every workspace that defines it. |
| `npm run build` | Build every workspace that defines it. |

## Global rules

- Multi-tenancy: businessId always comes from the authenticated session (req.user / @Tenant()), never from body, query or headers. x-branch-id must be validated as belonging to the business. Every new endpoint with an :id gets a cross-tenant isolation test (tenant B → 404).
- Money: Decimal(14,2) in Prisma, Prisma.Decimal / src/common/money.ts in code, no JS number arithmetic on money. Ledger postings always balance (sum = 0) and are written in the same $transaction as the business change.
- Database: schema changes only via `prisma migrate dev --name <change>`; `prisma db push` is banned. Migration folders keep the `<timestamp>_<seq>_<name>` form Prisma generates (e.g. `20261026083919_0014_deal_history`); never rename an applied migration. Every migration must be safe on existing production data.
- Tests: every feature ships with API tests (Vitest + Supertest, apps/server/test, *.e2e-spec.ts) and a Playwright spec in apps/e2e. Never weaken, skip or delete an assertion to make a test pass. Use data-testid selectors.
- Code: NestJS module per domain; class-validator DTOs for every body; no `any` in new DTOs. User copy in English with Roman Urdu shop terms (udhar, galla, khata, lena, dena, maal). Product name comes from APP_NAME env; remove "BizFlow" where touched.
- Secrets: never commit .env files; add new variables to .env.example. ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be at least 32 chars or the server refuses to boot.
- Production: never run commands against Supabase or production; production steps are documented for the user.
