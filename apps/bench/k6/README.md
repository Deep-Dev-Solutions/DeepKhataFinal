# DeepKhata k6 load scenarios

Staging only. Never point these at production. They write data (customers, orders, payments, khata entries, expenses, sessions) and deliberately trip rate limits.

The older Node runner `apps/bench/run.mjs` and `stock-finder.js` (local latency bench, see `docs/plan/runs/bench-results.md`) are unchanged.

## Install k6

- Linux (Debian/Ubuntu): follow https://grafana.com/docs/k6/latest/set-up/install-k6/ (apt repo or release tarball).
- macOS: `brew install k6`. Docker: `docker run --rm -i grafana/k6 run - <script.js` (scripts import `./lib/common.js`, so mount the folder instead).
- Needs k6 0.45 or newer (`k6/execution`).

## Files

| File | What it does |
| --- | --- |
| `lib/common.js` | `BASE_URL` (required), login, auth headers, think time, session setup shared by all scenarios |
| `counters.js` | Steady load on the cheap reads the shell polls on every page |
| `spike.js` | 0 to 200 VUs in 30 s, hold 1 min, drop |
| `soak.js` | 30 VUs for `SOAK_DURATION` (default 30m), reads plus a few writes |
| `offline-burst.js` | Many devices flush a 20-50 item offline queue to `POST /sync/batch`, then replay it |
| `login-storm.js` | 100 to 300 VUs logging in |
| `stock-finder.js` | Existing per-endpoint latency bench (uses `TOKEN` and `BRANCH_ID`) |

## Environment variables

Pass with `k6 run -e NAME=value`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | none, required | API root, e.g. `https://api-staging.example.com`. The script aborts if it is missing. |
| `USERS_JSON` | unset | `'[{"email":"a@x.com","password":"pw"}]'`. Overrides the two below. VUs share sessions round-robin. |
| `USER_EMAIL`, `USER_PASSWORD` | `owner@deepkhata.test`, `DeepKhata#Test1` | Seeded e2e owner (`apps/e2e/fixtures/users.ts`). Staging will have its own users. |
| `BRANCH_ID` | first branch of `GET /product/getbranches` | Sent as `x-branch-id` |
| `SPOOF_XFF` | `1` | Sends a unique `X-Forwarded-For` per request so the 100 req/min per-IP throttler does not dominate. `0` to disable. Only effective if the API trusts the proxy hop that adds it (`TRUST_PROXY`); behind Cloudflare or a load balancer that overwrites XFF every request shares one IP, so use an allowlisted runner IP or raise the throttle on staging. |
| `PRODUCTION_HOSTS` | unset | Comma list of hostnames the run must refuse, e.g. `api.deepkhata.com`. Cheap guard against a typo. |
| `VUS`, `DURATION` | 20, `5m` | `counters.js` |
| `PEAK_VUS` | 200 | `spike.js` |
| `SOAK_DURATION`, `VUS`, `WRITE_RATIO` | `30m`, 30, `0.03` | `soak.js`. Writes are about 3% of iterations. |
| `VUS`, `ITERATIONS`, `MIN_ITEMS`, `MAX_ITEMS` | 50, 3, 20, 50 | `offline-burst.js` |
| `LOGIN_PATH`, `HOLD` | `/auth/login`, `1m` | `login-storm.js`. Use `/api/auth/sign-in/email` to hit Better Auth directly. |
| `SEARCH_PREFIX` | `A-LSKU-` | SKU prefix for stock-finder queries (matches the `--large` seed) |

## Data and seeding

The default users and the stock-finder queries assume the seeded dataset. For a realistic catalogue (about 5,000 products per tenant) seed the staging database from `apps/server`:

```
npm run seed -- --large
```

(`prisma/seed.ts` reads `--large`; the seed uses the fixed users and the password `DeepKhata#Test1`.) Run it only against a database you own. If staging has its own users, pass them with `USERS_JSON` and set `SEARCH_PREFIX` to a SKU prefix that exists there.

## Safety rules

- Staging only. Set `PRODUCTION_HOSTS` and double-check `BASE_URL` before every run. Never run against Supabase or production data.
- `login-storm.js` and `offline-burst.js` create data and thousands of sessions. `soak.js` creates a few customers and service sales.
- The API throttles every route at 100 requests/min per IP and locks an IP or an account for 3 hours after 10 failed logins. The scripts send only valid passwords so they never trigger the lockout. Run from an allowlisted IP, or leave `SPOOF_XFF=1` if staging trusts the proxy header. Otherwise most of the storm will return 429.
- This repo has no Cloudflare Turnstile integration in the server or client code (searched `apps/server/src` and `apps/client/src`). If staging sits behind a Cloudflare WAF, Bot Fight or Turnstile challenge, `POST /auth/login` from k6 will be challenged. Use a WAF skip rule for the runner IP or a custom header rule, and for any Turnstile widget use Cloudflare's documented test keys (site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` always pass; `2x...` always fail) on staging only. Do not weaken the real site key.
- Offline items use service line items, so stock is never decremented, but money rows are written (orders, payments, khata, expenses).

## Scenarios

All commands run from the repo root. The first run of each is a smoke test: add `-e VUS=2 -e DURATION=20s` (or `-e PEAK_VUS=10`, `-e SOAK_DURATION=1m`) first.

### counters.js

```
k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/counters.js
```

Per iteration it fetches: `GET /notifications?limit=1` (unread badge, polled every 60 s by `useUnreadCount`), `GET /dues/summary`, `GET /businessinfo`, `GET /user/me`, `GET /product/getbranches`, plus public `GET /health`. Thresholds: overall and per-endpoint p95 under 300 ms, `http_req_failed` under 1%, checks over 99%. A failing `http_req_duration{name:X}` points at the slow endpoint.

### spike.js

```
k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/spike.js
```

Ramp to 200 VUs over 30 s, hold 1 min, ramp down. Reads only: product list (40%), stock finder (40%), counters (20%). Thresholds: p95 under 800 ms, failed under 2%. If failures are 429, you hit the throttler (see safety rules), not a capacity limit. If they are 5xx or timeouts, check the DB pool size and CPU.

### soak.js

```
k6 run -e BASE_URL=https://staging.example.com -e SOAK_DURATION=30m apps/bench/k6/soak.js
```

30 constant VUs mixing counters, product list, stock finder, customer and order lists, plus about 3% writes (`POST /customer/newcustomer`, `POST /order/neworder` with a service line). Thresholds: p95 under 500 ms overall and in each third of the run (`window:early|mid|late`, a rising late p95 means latency drift), failed under 1%, fewer than 5 failed writes, `health_restarts == 0`.

Memory drift: the API has no memory endpoint. `GET /health` returns only `{status, db, version, uptime}`. VU 1 polls it every 30 s; the script records `health_uptime_s` and counts `health_restarts` whenever uptime goes backwards, which catches an OOM kill or redeploy during the soak. To see memory growth itself, watch RSS/heap of the API process from the host during the run (`docker stats`, `pm2 monit`, or your Prometheus/cAdvisor dashboard) and compare the start and end values. Latency creeping up between the early and late windows while the process stays up is the usual signature of a leak.

### offline-burst.js

```
k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/offline-burst.js
```

50 VUs, 3 iterations each. Every iteration builds one batch of 20-50 queue items (`UPSERT_CUSTOMER`, `CREATE_ORDER`, `RECORD_PAYMENT`, `CREATE_KHATA_ENTRY`, `CREATE_EXPENSE`, each with a client-generated UUID, grouped so payments reference an order in the same batch), POSTs it to `/sync/batch`, then POSTs the identical body again. Thresholds: `sync_batch_duration` and `sync_replay_duration` p95 under 2 s, `sync_5xx == 0`, `sync_replay_all_synced` rate of 1 (every replayed item must come back `synced`), `sync_first_pass_all_synced` over 95%. The script logs the first non-synced item (with the server's `reason`) for the first three VUs. Duplicates are not directly observable from the API, so the proof of idempotency is that the replay reports everything `synced`; also compare row counts before and after (see cleanup).

### login-storm.js

```
k6 run -e BASE_URL=https://staging.example.com apps/bench/k6/login-storm.js
```

Ramp 0 to 100 VUs (30 s), hold, ramp to 300 (1 min), hold, ramp down, each VU looping `POST /auth/login` with valid credentials and a unique XFF. Expected responses are 200 and 429. Thresholds: `login_duration` (200s only) p95 under 1500 ms, `http_req_failed` under 1% with 429 excluded, `login_5xx == 0`, `login_unauthorized == 0`, `login_ok > 0`. `login_rate_limited` counts the 429s (informational; if it is most of the traffic, the run measured the throttler, not the hash cost). `login_unauthorized > 0` means the seeded password is wrong. Pass `-e USERS_JSON=...` with several staging users to avoid per-account lockout interplay.

## Reading the output

- A failed threshold prints a red cross and exits with code 99. `http_req_duration{name:...}` lines identify the endpoint; `checks` lists the failed check name.
- `http_req_failed` counts any non-2xx/3xx as failed (except 429 in the login storm).
- For a JSON summary: `k6 run --summary-export=out.json ...`.

## Cleanup

After offline-burst, login-storm and soak, clean up staging with SQL (table names are Prisma defaults; review before running, never on production):

```sql
DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email IN ('owner@deepkhata.test')) AND "createdAt" > now() - interval '1 day';
DELETE FROM "Customer" WHERE name LIKE 'K6 Burst %' OR name LIKE 'K6 Soak %';
DELETE FROM "KhataEntry" WHERE "partyName" = 'k6 burst';
DELETE FROM "Expense" WHERE description = 'k6 burst';
```

Orders created by the scripts have `walkInName = 'k6-soak'` (soak) or a `K6 Burst` customer (burst). Orders, payments and ledger rows are append-only and linked, so for a clean slate prefer restoring the staging database from a snapshot or re-seeding (`npm run seed -- --large`) rather than hand-deleting them.
