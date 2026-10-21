# DeepKhata production deploy (single Hostinger VPS, Ubuntu 24.04)

Everything here is run by you; nothing deploys itself. Order of operations:

1. **Bootstrap (once, as root):** `sudo bash bootstrap.sh "<your ssh public key>"`. Creates the `deploy`
   user, hardens SSH, enables ufw/fail2ban/unattended-upgrades, installs Docker, sets swap and log rotation.
   Verify `ssh deploy@<server>` works in a second terminal before closing the root session.
2. **Copy files:** put `docker-compose.prod.yml`, `Caddyfile`, `backup/` and `.env.example` into `/opt/deepkhata`.
3. **Configure:** `cp .env.example .env`, fill in DOMAIN, secrets, `COOKIE_DOMAIN`, `GHCR_OWNER`, `R2_*`; `chmod 600 .env`.
4. **Start:** `docker compose -f docker-compose.prod.yml up -d` (the API runs `prisma migrate deploy` on boot).
5. **Data:** follow `MIGRATION.md` to move the Supabase database over (rehearse first).
6. **Backups:** the `backup` service dumps nightly at 02:30 PKT to R2 and runs a restore test on Sundays at 04:00.
   Check `docker compose logs backup` and confirm objects appear in the R2 bucket.
7. **CI deploy:** push a tag (`git tag v1.0.0 && git push origin v1.0.0`). `.github/workflows/deploy.yml` builds images
   to GHCR, updates `IMAGE_TAG`, health-checks `https://api.$DOMAIN/health` and rolls back on failure.

Required GitHub secrets: `PUBLIC_API_URL`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
Cloudflare: proxied DNS for app/api/admin, SSL mode Full (strict).

Real client IP and rate limits: Caddy trusts `CF-Connecting-IP` only from Cloudflare edge ranges (global options block in
`Caddyfile`; verify the list against https://www.cloudflare.com/ips/ before each deploy) and forwards the visitor as
`X-Forwarded-For` / `X-Real-IP`. The API trusts that header only from the compose network (`TRUST_PROXY=172.16.0.0/12`),
so throttling, lockouts and session IPs see the real visitor. Rate limits are tunable with the `THROTTLE_*` variables in `.env`.
