# Phase 3: Production on the VPS

**Goal:** move API, client, agency admin and database off Vercel and Supabase onto one Hostinger
KVM 2 VPS (2 vCPU, 8 GB, Ubuntu 24.04), with backups, monitoring and one-command deploys.
GM Traders goes live on this.

## Context

- The VPS also hosts the school ERP later, as a **separate** compose project and separate database. Do not mix their code or env.
- Vercel entry `apps/server/api/index.ts` and `vercel.json` become dead once this ships.
- Claude Code cannot SSH into the server unless the user gives it access. Produce scripts and docs; the user runs the server-side steps.

## Tasks

1. **Dockerfiles** (multi-stage, Node 22 alpine, non-root user):
   - `apps/server/Dockerfile`: build Nest, `prisma generate`, run `node dist/main`. Entrypoint runs `prisma migrate deploy` then starts.
   - `apps/client/Dockerfile` and `apps/agency-admin/Dockerfile`: Next `output: 'standalone'`.
2. **`deploy/docker-compose.prod.yml`** with:
   - `postgres:17` (volume, `shared_buffers=2GB`, `effective_cache_size=5GB`, `max_connections=100`, healthcheck). Not exposed publicly.
   - `api`, `client`, `admin` with memory limits (api 768 MB, client 512 MB, admin 384 MB) and `restart: unless-stopped`.
   - `caddy` (ports 80/443, automatic TLS) with `deploy/Caddyfile`: `app.<domain>` → client, `api.<domain>` → api, `admin.<domain>` → admin; gzip/zstd; security headers.
   - `backup`: cron container running nightly `pg_dump -Fc` → upload to Cloudflare R2 with `rclone`; retention 14 daily + 8 weekly; weekly restore test into a scratch DB that logs row counts.
   - No Redis (Phase 0 made it optional).
3. **Server bootstrap script** `deploy/bootstrap.sh` (for the user to run once as root): create `deploy` user with SSH key, disable password and root SSH login, `ufw` allow 22/80/443, `fail2ban`, `unattended-upgrades`, install Docker, set timezone `Asia/Karachi`, 2 GB swap file, Docker log rotation.
4. **Environment.** `deploy/.env.example` listing every variable (DB URL, secrets, `APP_NAME`, `FRONTEND_URL`, `API_URL`, R2 keys, Cloudinary, mail). Secrets generated with `openssl rand -hex 32`.
5. **CORS and cookies.** Replace hardcoded Vercel origins in `main.ts` with `CORS_ORIGINS` env. Cookies `SameSite=Lax`, `Secure`, `Domain=.<domain>` since all apps share a parent domain.
6. **Remove serverless leftovers.** Delete `apps/server/api/index.ts` and `vercel.json` (after cutover), drop the `VERCEL` branch in `main.ts`, and rewrite `apps/server/AGENTS.md` (the stateless/pgbouncer rules no longer apply; the server is a long-running process, so scheduled jobs are allowed via `@nestjs/schedule`).
7. **CI deploy** `.github/workflows/deploy.yml`: on tag `v*` → build images → push to GHCR → SSH (secret key) → `docker compose pull && docker compose up -d` → curl `/health` → roll back to the previous tag if unhealthy.
8. **Data migration runbook** `deploy/MIGRATION.md`: freeze writes (set tenants `READ_ONLY` via agency admin), `pg_dump` from Supabase (direct port 5432), restore to VPS, run `verify-ledger.ts` and row-count comparison, switch DNS, unfreeze. Include rollback steps.
9. **Monitoring.**
   - Uptime Kuma container (or healthchecks.io) pinging `/health` every minute, alerts by email.
   - Cloudflare smoke Worker (`apps/smoke-worker`, use the Cloudflare skills plugin: `/plugin marketplace add cloudflare/skills`, `/plugin install cloudflare@cloudflare`): a cron Worker with a Browser Run binding and `@cloudflare/playwright` that logs into a demo tenant every 2 hours, searches a product, asserts the POS loads in under 3 s, and emails on failure.
10. **Cloudflare in front.** DNS on Cloudflare, proxied records for app/api/admin, SSL mode Full (strict).

## Acceptance criteria

- [ ] `docker compose -f deploy/docker-compose.prod.yml up` works on a clean Ubuntu 24.04 VM (test on a local VM or the VPS).
- [ ] A backup appears in R2 nightly and the weekly restore test passes.
- [ ] Tag push deploys with zero manual steps and auto-rolls back on a failed health check.
- [ ] Smoke Worker runs on schedule and alerts when the app is down.
- [ ] Migration runbook rehearsed once against a copy of production data, with ledger verify passing.
