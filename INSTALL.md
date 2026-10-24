# DeepKhata: install and run (dev and production)

This is the hands-on guide. `README.md` explains what the product is; `CLAUDE.md` holds the engineering rules; `deploy/README.md` and `deploy/MIGRATION.md` are the production runbooks this guide summarises.

## What runs where

| Piece | Port | What it is |
| --- | --- | --- |
| API | 5000 | NestJS 11, Prisma 6, Postgres, Better Auth cookie sessions |
| Client | 3000 | Next.js PWA (the shop app) |
| Agency admin | 3001 | Next.js super-admin console |
| Postgres 17 | 5432 (5433 if 5432 is taken) | The database |
| Mailpit | 8025 UI, 1025 SMTP | Catches all outgoing email in dev |
| Redis | 6379 | Optional, off by default |

Also in the repo: `apps/desktop` (Electron shell, embedded Postgres), `apps/e2e` (Playwright), `apps/bench` (k6 and a Node load runner).

## 1. Development (Linux, Pop!_OS)

### Prerequisites
- Node 22 or newer (24 is what this repo was tested on)
- Docker with the compose plugin (`docker compose version`)
- Git

### First-time setup
```bash
git clone <repo-url> DeepKhata && cd DeepKhata
npm install
```

1. **Create the API env file.** `cp apps/server/.env.example apps/server/.env`, then check these values:
   - `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TEST`, `E2E_DATABASE_URL`: the example points at `localhost:5432` with user and password `deepkhata`. If you set `POSTGRES_PORT=5433` below, change the port in all four.
   - `BETTER_AUTH_SECRET`: at least 32 characters, or the API refuses to boot. Generate one with `openssl rand -hex 32`.
   - `BETTER_AUTH_URL=http://localhost:5000`, `FRONTEND_URL=http://localhost:3000`.
   - Leave `SMTP_HOST` and `RESEND_API_KEY` unset: mail then goes to Mailpit.
   - `ENABLE_TEST_ENDPOINTS=true` is only for E2E; keep it `false` otherwise.
   - **Never point `DATABASE_URL` at Supabase or any production database while developing.** Nothing in the test setup will protect your dev database from a migration.
2. **Client and admin env** (optional, defaults already work): `cp apps/client/.env.example apps/client/.env.local` and `cp apps/agency-admin/.env.example apps/agency-admin/.env.local`. They only set `NEXT_PUBLIC_API_URL=http://localhost:5000` and the other app's URL.
3. **Start Postgres and Mailpit.**
   ```bash
   export POSTGRES_PORT=5433   # only if something already listens on 5432
   npm run db:up
   ```
   The compose file creates the databases `deepkhata`, `deepkhata_test`, `deepkhata_e2e` and `deepkhata_shadow` on first start. Redis is optional: `docker compose -f docker-compose.dev.yml --profile redis up -d`, then set `REDIS_URL`.
4. **Create the schema and seed data.**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
5. **Run everything.**
   ```bash
   npm run dev
   ```
   API http://localhost:5000 (health at `/health`), client http://localhost:3000, admin http://localhost:3001, Mailpit http://localhost:8025.

### Seeded logins (local only)
All use the password `DeepKhata#Test1`.

| Email | Role |
| --- | --- |
| `superadmin@deepkhata.test` | Super admin (agency console on :3001) |
| `owner@deepkhata.test` | Owner, tenant A |
| `manager@deepkhata.test` | Manager, tenant A |
| `staff@deepkhata.test` | Staff, tenant A |
| `ownerb@deepkhata.test` | Owner, tenant B (isolation tests) |

For a large dataset (about 10,000 products and 100,000 orders, used by the benchmarks), run `npm run seed -w server -- --large`. It resets and refills the dev database, so use it on a scratch database only.

### Everyday commands
| Command | What it does |
| --- | --- |
| `npm run dev` | API, client and admin together |
| `npm run build` | Build every workspace |
| `npm run lint` | Lint every workspace |
| `npm run test:api` | API tests (Vitest and Supertest) against `deepkhata_test`; resets that database |
| `npm test -w server` / `npm test -w desktop` | Unit tests |
| `npm run test:e2e` | Playwright suite against `deepkhata_e2e`; resets and seeds it, then starts its own API and client |
| `npm run db:down` | Stop Postgres and Mailpit |
| `npm run db:reset` | Drop and rebuild the dev database (destructive) |
| `npm run stack:up` | Build and start the full container stack (postgres, mailpit, api, client, admin) |
| `npm run stack:down` | Stop the full stack (keeps its data) |
| `npm run stack:logs` | Follow the full stack logs |

Notes for the two test commands:
- Admin console specs need `E2E_WITH_ADMIN=1`, for example `E2E_WITH_ADMIN=1 npm run test:e2e`.
- Run one folder with `npm run test:e2e -- tests/team`.
- The Playwright and API test setup refuse to run against any host except `localhost` or `127.0.0.1`.
- When an AI agent runs them, the database reset needs `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` set inline for that one command. Never write that value into a file.

### Database changes
Schema changes only through `npx prisma migrate dev --name <change>` inside `apps/server`. `prisma db push` is banned. Migration folders are numbered (`0000_`, `0001_`, ...) and must be safe on existing production data.

### Checking the local database

```bash
docker compose -f docker-compose.dev.yml exec postgres psql -U deepkhata -d deepkhata
```
Useful: `\l` (databases), `\dt` (tables), `select count(*) from "Order";`. Any GUI works with host `localhost`, your port, user `deepkhata`, the password from `apps/server/.env`.

### Full container stack (the staging shape on one laptop)

Same pieces as the VPS, all containers: `npm run stack:up`. It publishes Postgres on **5434** and Mailpit on **8027** by default so it can run next to the dev compose; override with `STACK_*_PORT` envs (see `docker-compose.yml`). One-time warning: secrets in that file are dev defaults — replace `BETTER_AUTH_SECRET` for anything that is not a local laptop. Staging itself uses `deploy/docker-compose.prod.yml`.

### Common problems
- **`npm install` says package.json is invalid JSON.** Something was typed into the file. Run `git checkout package.json`.
- **Port 5432 already in use.** Use `POSTGRES_PORT=5433` and update the four URLs in `apps/server/.env`.
- **API exits at boot with a secret error.** `BETTER_AUTH_SECRET` is missing or shorter than 32 characters.
- **Login works but the browser keeps logging you out.** The API and client must be on the same site (`localhost`) and `CORS_ORIGINS` must list the client origin; cookies are session cookies, not tokens in storage.
- **No email arrives.** Look in Mailpit (http://localhost:8025), not in a real inbox.

## 2. Production (single VPS, Docker)

Everything below is run by you on purpose; nothing in this repo deploys itself. Target: Ubuntu 24.04, Cloudflare in front, images built by GitHub Actions and pulled from GHCR. The stack is Postgres, API, client, admin, Caddy (HTTPS) and a nightly backup job.

### One-time server preparation
1. Point a domain at the VPS and add three DNS records, `app.<domain>`, `api.<domain>` and `admin.<domain>`, proxied through Cloudflare. Set Cloudflare SSL mode to **Full (strict)**.
2. Bootstrap the server as root, once:
   ```bash
   sudo bash deploy/bootstrap.sh "ssh-ed25519 AAAA... you@laptop"
   ```
   It installs Docker, creates a `deploy` user with your key, disables root and password SSH, enables ufw (22, 80, 443) and fail2ban, sets the timezone to Asia/Karachi, adds 2 GB swap and Docker log rotation. Open a second terminal and confirm `ssh deploy@<server>` works before closing the root session.
3. Copy `docker-compose.prod.yml`, `Caddyfile`, `backup/` and `.env.example` from `deploy/` to `/opt/deepkhata` on the server.

### Configure
In `/opt/deepkhata`: `cp .env.example .env && chmod 600 .env`, then fill in:

| Variable | Notes |
| --- | --- |
| `DOMAIN` | `example.com`; Caddy serves `app.`, `api.`, `admin.` of it |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32`; use the same value inside `DATABASE_URL` and `DIRECT_URL` |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` (32+ characters or the API will not start) |
| `BETTER_AUTH_URL` | `https://api.<domain>` |
| `FRONTEND_URL`, `CORS_ORIGINS` | `https://app.<domain>` and the admin origin |
| `COOKIE_DOMAIN` | `.<domain>` so the session cookie is shared by app, api and admin |
| `TRUST_PROXY` | `172.16.0.0/12` (the compose network where Caddy runs) |
| `SMTP_*` or `RESEND_API_KEY`, `MAIL_FROM` | Real email delivery; see `deploy/EMAIL.md` |
| `CLOUDINARY_*` | Product photos |
| `R2_*` | Cloudflare R2 bucket for nightly backups |
| `GHCR_OWNER`, `IMAGE_TAG` | Lowercase GitHub owner; the deploy job sets the tag |
| `AGENCY_*` | Business details on invoices and alert emails |
| `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` | Captcha; see "Captcha: Cloudflare Turnstile" below |
| `DISPOSABLE_EMAIL_EXTRA`, `DISPOSABLE_EMAIL_ALLOW` | Optional comma lists of email domains to block or to let through |

Never commit `.env`. Keep `ENABLE_TEST_ENDPOINTS` unset or `false` in production.

### Captcha: Cloudflare Turnstile
Sign-up, forgot-password, resend-verification and sign-in (only after 3 failed attempts) are protected by Cloudflare Turnstile. Throwaway email domains are also refused at sign-up (built-in list, extend with `DISPOSABLE_EMAIL_EXTRA`, override with `DISPOSABLE_EMAIL_ALLOW`).
1. In the Cloudflare dashboard open Turnstile, add a widget for `app.<domain>` (managed mode) and copy the site key and secret key.
2. Server: set `TURNSTILE_SECRET_KEY` in `/opt/deepkhata/.env`. With the key unset the captcha is off and the API logs a loud warning at boot when `NODE_ENV=production`.
3. Client: the site key is public and baked into the client image at build time. Add the GitHub Actions secret `PUBLIC_TURNSTILE_SITE_KEY` (used by `deploy.yml` as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and set the same value as `TURNSTILE_SITE_KEY` in `.env` for local `docker compose build`. Without it the widgets render nothing and the API will answer `CAPTCHA_REQUIRED`, so set the site key and the secret together.
4. Staging: Cloudflare publishes always-pass test keys. Site key `1x00000000000000000000AA`, secret key `1x0000000000000000000000000000000AA`. Use them (or leave `TURNSTILE_SECRET_KEY` unset) on staging and in load tests.
5. Dev, tests, E2E and the desktop build run with the key unset: no captcha anywhere.
The agency console login (`apps/agency-admin`) has no widget yet: if a super admin fails 3 times, sign in once through the client app login page (it shows the widget) or wait for the IP counter to clear (a successful login resets it).

### Start
```bash
cd /opt/deepkhata
docker compose -f docker-compose.prod.yml up -d
curl -fsS https://api.<domain>/health
```
The API container runs `prisma migrate deploy` before it starts, so schema changes apply on every deploy. Check logs with `docker compose logs -f api`.

### Deploy by tag (CI)
Add GitHub secrets: `PUBLIC_API_URL` (`https://api.<domain>`, baked into the client and admin builds), `PUBLIC_TURNSTILE_SITE_KEY` (Turnstile site key, baked into the client build), `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Then:
```bash
git tag v1.0.0 && git push origin v1.0.0
```
`.github/workflows/deploy.yml` builds and pushes the images, updates `IMAGE_TAG` on the server, health-checks `https://api.<domain>/health` and rolls back to the previous tag if the check fails.

### Moving the existing Supabase data
Follow `deploy/MIGRATION.md` step by step and rehearse it on a scratch server first. The short version: freeze tenants to READ_ONLY, `pg_dump` from the Supabase direct connection, `pg_restore` into the VPS Postgres, prove the schema matches the baseline with `prisma migrate diff` before running `prisma migrate resolve --applied 0000_baseline`, run `migrate deploy`, run `npm run verify:ledger -w server` (must report zero unbalanced transactions), compare row counts, switch DNS, unfreeze. Keep Supabase untouched for at least 14 days as the rollback.

### Backups
The `backup` service dumps the database to R2 every night at 02:30 (PKT) and runs a restore test on Sundays at 04:00. After the first night, confirm objects exist in the R2 bucket and `docker compose logs backup` shows no errors. A backup you have never restored is not a backup: run `restore-test.sh` once by hand.

### Operating checklist
- `docker compose ps` shows api, client, admin, caddy, postgres and backup running.
- `https://api.<domain>/health` returns OK; log in as an owner and as the agency super admin.
- Create the real super admin and change every seeded password; the `*.deepkhata.test` accounts are for local use only.
- Updates: tag a release. Rollback: redeploy the previous tag.

## 3. Desktop build (optional)
`apps/desktop` is the Electron shell with an embedded Postgres, a licence check and an offline sync client. Linux builds and its unit tests (`npm test -w desktop`) work here. The Windows installer, code signing and the Windows-runner test suite are not done yet; see `docs/plan/STATUS.md`.

## 4. Load testing
k6 scenarios live in `apps/bench/k6/` with their own `README.md`. Run them against a staging URL only, never production.
