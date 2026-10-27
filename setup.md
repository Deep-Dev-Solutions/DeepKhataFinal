# Setup — DeepKhata

Everything you need to run DeepKhata locally: database, dev servers, builds,
tests, and the connection details for pgAdmin.

> **Never point `DATABASE_URL` at Supabase or a production database.** Prisma
> migrations and `db:reset` are destructive. All commands below assume the local
> Docker Postgres.

## What runs where

| Piece | URL / port | Notes |
| --- | --- | --- |
| API (NestJS) | http://localhost:5000 | health check: http://localhost:5000/health |
| Client (Next PWA, the shop app) | http://localhost:3000 | login page `/login` |
| Agency admin (Next) | http://localhost:3001 | super-admin console |
| Postgres 17 | `localhost:5432` (this machine: **5433**) | databases below |
| Mailpit SMTP | `localhost:1025` | catches every outgoing email |
| Mailpit UI | http://localhost:8025 | read the mails here, not in a real inbox |
| Redis (optional, off) | `localhost:6379` | only if you enable the profile |

## 1. Prerequisites

- **Node 22+** (24 is what this repo is tested on) and npm
- **Docker** with the compose plugin (`docker compose version`)
- **Git**

## 2. One-time setup

```bash
git clone <repo-url> DeepKhata
cd DeepKhata
npm install            # also runs `prisma generate` for the server
```

### Env files

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env.local
cp apps/agency-admin/.env.example apps/agency-admin/.env.local
```

In `apps/server/.env` check these:

- `BETTER_AUTH_SECRET` — **at least 32 characters or the API refuses to boot**:
  ```bash
  openssl rand -hex 32
  ```
- `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TEST`, `E2E_DATABASE_URL` — all four
  must use the same host port as the Postgres container (see §3).
- `BETTER_AUTH_URL=http://localhost:5000`, `FRONTEND_URL=http://localhost:3000`.
- Leave `SMTP_HOST` and `RESEND_API_KEY` **unset** so mail goes to Mailpit.
- `ENABLE_TEST_ENDPOINTS=false` except while running E2E.

`apps/client/.env.local` and `apps/agency-admin/.env.local` only need
`NEXT_PUBLIC_API_URL=http://localhost:5000` (the defaults work).

## 3. Database

### Start it

```bash
npm run db:up            # Postgres 17 + Mailpit, waits until healthy
```

If something already listens on **5432** (common on Linux), use 5433 and keep it
for the whole session:

```bash
export POSTGRES_PORT=5433
npm run db:up
```

Docker creates four databases on first start (from `docker/postgres/init`):

| Database | Used by |
| --- | --- |
| `deepkhata` | the dev app (`npm run dev`) |
| `deepkhata_test` | API tests (`npm run test:api`) |
| `deepkhata_e2e` | Playwright (`npm run test:e2e`) |
| `deepkhata_shadow` | Prisma's shadow database for `migrate dev` |

### Create the schema and seed

```bash
npm run db:migrate       # prisma migrate deploy
npm run db:seed          # tenants, products, orders, customers, users
```

### Reset (destructive — dev database only)

```bash
npm run db:reset         # drop + rebuild + migrate (no prompt — dev DB only)
npm run db:seed
```

### Stop it

```bash
npm run db:down          # keeps the data volume
```

### pgAdmin / DBeaver / TablePlus

Register a new server with:

| Field | Value |
| --- | --- |
| Host | `localhost` (or `127.0.0.1`) |
| Port | `5433` on this machine, otherwise `5432` |
| Maintenance database | `postgres` |
| Username | `deepkhata` |
| Password | `deepkhata` |
| Databases to browse | `deepkhata` (dev), `deepkhata_test`, `deepkhata_e2e`, `deepkhata_shadow` |

Connection strings (paste straight into pgAdmin's "Connection string" field or a
`.env`):

```
postgresql://deepkhata:deepkhata@localhost:5433/deepkhata?schema=public
postgresql://deepkhata:deepkhata@localhost:5433/deepkhata_test?schema=public
postgresql://deepkhata:deepkhata@localhost:5433/deepkhata_e2e?schema=public
postgresql://deepkhata:deepkhata@localhost:5433/deepkhata_shadow?schema=public
```

Replace `5433` with `5432` if you did not override `POSTGRES_PORT`.

Useful tables to poke at in `deepkhata` → `Schemas` → `public` → `Tables`:
`Business`, `Branch`, `Product`, `ProductInstance`, `Order`, `OrderItem`,
`Customer`, `Transaction`, `LedgerPosting` (`select count(*) from "Order";`).

### psql from the terminal

```bash
docker compose -f docker-compose.dev.yml exec postgres psql -U deepkhata -d deepkhata
# then: \l  (databases)   \dt  (tables)   \q  (quit)
```

### Optional Redis

```bash
docker compose -f docker-compose.dev.yml --profile redis up -d
# then set REDIS_URL=redis://localhost:6379 in apps/server/.env
```

## 4. Run it (development)

```bash
npm run dev              # API + client + admin together
```

- API http://localhost:5000 (`/health`)
- Client http://localhost:3000
- Admin http://localhost:3001
- Mailpit http://localhost:8025

Run one app on its own if you prefer:

```bash
npm run start:dev -w server
npm run dev -w client
npm run dev -w agency-admin
```

### Seeded logins (local only)

All use the password **`DeepKhata#Test1`**.

| Email | Role |
| --- | --- |
| `superadmin@deepkhata.test` | Super admin — agency console on :3001 |
| `owner@deepkhata.test` | Owner, tenant A |
| `manager@deepkhata.test` | Manager, tenant A |
| `staff@deepkhata.test` | Staff, tenant A |
| `ownerb@deepkhata.test` | Owner, tenant B (isolation checks) |

Big dataset for load testing (about 10k products / 100k orders — **resets the dev
database**, so run it only on a scratch DB):

```bash
npm exec -w server -- tsx prisma/seed.ts --large
```

## 5. Build

```bash
npm run build            # every workspace: server, client, admin, desktops
```

Or one at a time:

```bash
npm run build -w server
npm run build -w client
npm run build -w agency-admin
npm run build -w desktop
npm run build -w desktop-online
```

Serve a production build locally:

```bash
npm run start:prod -w server     # after `npm run build -w server`
npm run start -w client          # after `npm run build -w client`
npm run start -w agency-admin    # after `npm run build -w agency-admin`
```

## 6. Lint and tests

```bash
npm run lint             # every workspace (warnings are expected, 0 errors)
```

| Command | What it runs |
| --- | --- |
| `npm run test:api` | API suite (Vitest + Supertest) against `deepkhata_test`; **resets that DB** |
| `npm run test:e2e -w server -- test/<file>` | one API spec, e.g. `test/products-list.e2e-spec.ts` |
| `npm test -w server` | unit tests only (does **not** pick up `test/*.e2e-spec.ts`) |
| `npm test -w desktop` / `npm test -w desktop-online` | Electron shell unit tests |
| `npm run test:e2e` | Playwright: resets + seeds `deepkhata_e2e`, starts its own API and client |

Playwright details:

```bash
# full suite, including the agency console
CI=1 E2E_WITH_ADMIN=1 npm run test:e2e -- --reporter=line

# one folder / one file
npm run test:e2e -- tests/pos
npm run test:e2e -- tests/pos/walkin-cash.spec.ts

# open the last HTML report
npm run report -w e2e
```

- Stop the dev stack first (`Ctrl+C`) so the E2E servers can take 5000/3000.
- `E2E_SKIP_SERVER_BUILD=1` reuses an existing `apps/server/dist`.
- The E2E setup refuses to run against any host other than `localhost`/`127.0.0.1`.
- Automated agents must pass
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes` inline for the DB reset —
  never store that value in a file.

## 7. Desktop apps

Both are optional and only need this for packaging/testing:

```bash
# cloud shell (loads the hosted app, silent receipt printing + drawer kick)
npm run build -w desktop-online
npm test  -w desktop-online
CLOUD_URL=http://localhost:3000 npm run start -w desktop-online

# on-prem Shop Server (embedded Postgres + local API/client)
npm run build -w desktop
npm test  -w desktop
npm run start -w desktop
```

Windows installers are built **on Windows**:
`npm run dist -w desktop-online` / `npm run dist -w desktop` (see the READMEs in
each folder). Code signing and auto-update are not set up.

## 8. Full container stack (one laptop, production shape)

```bash
npm run stack:up         # postgres, mailpit, api, client, admin in containers
npm run stack:logs
npm run stack:down       # keeps data
```

This stack publishes Postgres on **5434** and Mailpit on **8027** so it can run
beside the dev compose (override with `STACK_*_PORT`). Its secrets are dev
defaults — never expose it.

## 9. Changing the schema

Schema changes go through a migration, inside `apps/server`:

```bash
cd apps/server
npx prisma migrate dev --name add_something     # creates + applies the migration
```

Rules: never `prisma db push`, never rename an applied migration folder, and every
migration must be safe on existing production data. Regenerate the client if you
edited the schema by hand:

```bash
npm run prisma:generate -w server
```

## 10. Common problems

| Symptom | Fix |
| --- | --- |
| Port 5432 already in use | `export POSTGRES_PORT=5433; npm run db:up`, then change the port in all four URLs in `apps/server/.env` |
| API exits at boot with a secret error | `BETTER_AUTH_SECRET` missing or shorter than 32 chars |
| Login works, then you get logged out | API and client must both be on `localhost`; `CORS_ORIGINS` must include the client origin |
| No email arrives | Check Mailpit at http://localhost:8025 |
| `npm install` says package.json is invalid JSON | `git checkout package.json` |
| Migration says "database is locked"/shadow error | `npm run db:reset` on the dev DB, or drop `deepkhata_shadow` and retry |
| E2E fails to start servers | Dev stack still running — stop it, then rerun |
| Prisma reset refuses without a TTY (agent/CI) | Prefix the one command with `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes` |

## 11. Cheat sheet

```bash
# first time
npm install
cp apps/server/.env.example apps/server/.env      # set BETTER_AUTH_SECRET
export POSTGRES_PORT=5433
npm run db:up && npm run db:migrate && npm run db:seed

# daily
npm run dev

# build / lint / test
npm run build
npm run lint
npm run test:api
CI=1 E2E_WITH_ADMIN=1 npm run test:e2e -- --reporter=line

# database
npm run db:up | db:down | db:migrate | db:seed | db:reset
docker compose -f docker-compose.dev.yml exec postgres psql -U deepkhata -d deepkhata
```
