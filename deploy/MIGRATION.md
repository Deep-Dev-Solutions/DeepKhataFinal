# Runbook: Supabase -> VPS Postgres

**You run every step below yourself.** Nothing in this repository executes it for you. Rehearse the whole
runbook on a throwaway VPS or local stack (see the checklist at the end) before doing it for real.

Placeholders: `SUPA_DIRECT` is the Supabase **direct** connection string (port 5432, host `db.<ref>.supabase.co`;
never the pooler on 6543, which breaks `pg_dump`). `VPS_DB` is the VPS database inside the compose network.

## 0. Preconditions
- VPS bootstrapped, stack up (`docker compose -f docker-compose.prod.yml up -d`), `/health` is green on a scratch DB.
- Backups are configured and one manual backup has reached R2.
- Pick a low-traffic window. Tell the shop owner the system will be read-only for the duration.

## 1. Freeze writes
Agency admin -> Tenants -> set every tenant to `READ_ONLY`. Confirm a write (for example creating a sale) is rejected.
Note the time.

## 2. Dump from Supabase
```bash
pg_dump -Fc --no-owner --no-privileges -d "$SUPA_DIRECT" -f supabase-$(date +%Y%m%d-%H%M).dump
pg_restore -l supabase-*.dump | head   # sanity check
```
Record row counts on Supabase for the comparison table in step 7:
```sql
select 'Business', count(*) from "Business" union all
select 'Order', count(*) from "Order" union all
select 'Transaction', count(*) from "Transaction" union all
select 'Posting', count(*) from "Posting" union all
select 'ProductInstance', count(*) from "ProductInstance";
```

## 3. Restore into the VPS Postgres
Copy the dump to the VPS (`scp`), then on the VPS in `/opt/deepkhata`:
```bash
docker compose -f docker-compose.prod.yml stop api        # nothing should write during restore
docker compose -f docker-compose.prod.yml cp supabase-*.dump postgres:/tmp/s.dump
docker compose -f docker-compose.prod.yml exec postgres sh -c \
  'pg_restore --no-owner --no-privileges --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/s.dump'
```
Supabase-managed schemas (`auth`, `storage`, ...) may produce harmless errors; the app tables live in `public`.

## 4. Reconcile Prisma migration history
The Supabase DB was created from the baseline, so its `_prisma_migrations` table may be missing or stale.
**Only mark the baseline as applied after proving the schema matches it.** Run from a machine with the repo and
network access to the VPS DB (for example via an SSH tunnel to port 5432 of the postgres container):
```bash
cd apps/server
npx prisma migrate diff \
  --from-url "$SUPA_DIRECT" \
  --to-migrations prisma/migrations \
  --shadow-database-url "$SHADOW_DB_URL" --script
```
Expected: the diff contains only the changes from migrations 0001-0007 (nothing contradicting 0000_baseline).
If it shows unexpected differences in baseline-era tables or columns, **stop** and reconcile by hand; do not resolve.
If it matches:
```bash
DATABASE_URL="$VPS_DB" DIRECT_URL="$VPS_DB" npx prisma migrate resolve --applied 0000_baseline
DATABASE_URL="$VPS_DB" DIRECT_URL="$VPS_DB" npx prisma migrate deploy      # applies 0001 ... 0007
```
(Starting the api container also runs `migrate deploy`; doing it manually first makes failures visible.)

## 5. Verify
```bash
DATABASE_URL="$VPS_DB" npm run verify:ledger -w server
```
Must report zero unbalanced transactions. Re-run the row-count query from step 2 on the VPS and fill in:

| Table | Supabase | VPS | Match |
|---|---|---|---|
| Business | | | |
| Order | | | |
| Transaction | | | |
| Posting | | | |
| ProductInstance | | | |

Any mismatch: stop, do not switch DNS.

## 6. Start the stack and smoke test
```bash
docker compose -f docker-compose.prod.yml up -d
curl -fsS https://api.<domain>/health
```
Log in as a tenant owner and as agency admin; open a recent order; check one customer balance.

## 7. Switch DNS
Cloudflare: point `app`, `api`, `admin` at the VPS IP with the proxy ON (orange cloud). SSL/TLS mode **Full (strict)**.
Lower the TTL a day earlier if records are not proxied. Wait for propagation, re-test login (cookie domain
`COOKIE_DOMAIN` must be the parent domain, for example `.example.com`).

## 8. Unfreeze
Agency admin -> Tenants -> set tenants back to `ACTIVE`. Do one real sale end to end. Watch `docker compose logs -f api`.

## Rollback
- Before DNS switch: nothing is live on the VPS; just unfreeze tenants on Supabase and stop.
- After DNS switch, within the first day: set tenants `READ_ONLY` on the VPS, note any writes made since the
  switch (they exist only on the VPS), point DNS back to the old host, unfreeze on Supabase, then replay the
  recorded VPS-only writes manually. Keep Supabase untouched (do not delete it) for at least 14 days.
- Bad app release (not data): redeploy the previous tag; the deploy workflow does this automatically if the health check fails.

## Rehearsal checklist
- [ ] Full run on a scratch VPS or local compose stack with a fresh Supabase dump
- [ ] `migrate diff` result reviewed and matches expectations
- [ ] `verify:ledger` clean and row counts match
- [ ] Restore test from an R2 backup succeeds (`restore-test.sh`)
- [ ] Login works on the new domain (cookie shared across app/api/admin)
- [ ] Rollback steps read through; Supabase retained
- [ ] Wall-clock time of the freeze window measured
