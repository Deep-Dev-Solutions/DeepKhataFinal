# Bench results: stock finder and product list at scale

Date: 2026-10-18. Local only (Postgres on localhost:5433, database `deepkhata_bench`). Nothing was run against Supabase or production.

## Setup

- Machine: 12 logical CPUs, 15 GB RAM, Linux. Postgres, the API (`node apps/server/dist/main.js`, port 5199, REDIS unset) and the load generator all share this one box, so absolute numbers are pessimistic for the DB and API, and the generator competes for CPU.
- Dataset (`seed.ts --large`, took ~2 min; no seed changes needed): 10,082 products (5,062 tenant A, 5,020 tenant B), 30,259 product instances across branches, 4,027 customers, 100,039 orders, 200,095 order items, 200,086 postings. The load runs as tenant A owner.
- Load: Node fallback runner `apps/bench/run.mjs` (k6 is not installed; equivalent script in `apps/bench/k6/stock-finder.js`, not executed). 10 virtual users, 60 s per scenario, scenarios run one after another, 5 warm-up requests per scenario not counted. Every request carries a unique `X-Forwarded-For` (the API trusts loopback proxies) so the 100 requests/min per-IP throttler does not turn the run into 429s. Zero errors in every scenario.
- Target: p95 < 300 ms.

## Results (10 VUs, 60 s each)

| Scenario | Requests | rps | p50 ms | p95 ms | p99 ms | p95 < 300 ms |
|---|---|---|---|---|---|---|
| stock-finder exact SKU (`/stock/find?q=A-LSKU-02518`) | 1067 | 17.8 | 563.7 | 759.0 | 895.7 | FAIL |
| stock-finder prefix (`q=a-lsku-025`) | 1046 | 17.4 | 573.5 | 779.8 | 855.9 | FAIL |
| stock-finder typo / fuzzy (`q=bench part a-2158`) | 1067 | 17.8 | 565.4 | 795.1 | 907.5 | FAIL |
| `GET /product/getproducts?limit=50` page 1 | 4946 | 82.4 | 116.2 | 175.3 | 213.8 | PASS |
| `GET /product/getproducts?limit=50&search=<sku>` | 1518 | 25.3 | 399.8 | 521.7 | 603.1 | FAIL |

Single-VU baseline (5 s each, same box): stock-finder p50 ~256-304 ms (p95 ~420 ms) for all three queries, getproducts page 1 p50 46 ms, getproducts search p50 117 ms. So stock finder already misses the target with no concurrency; concurrency just queues the same CPU-bound work (~18 rps ceiling).

## Findings

1. Stock finder latency is the same for exact, prefix and fuzzy queries. The exact and prefix queries are not faster because `rankedProductIds` always takes the full-scan path. It selects every product of the tenant, computes a CASE rank plus `word_similarity` and `similarity` for each row, and only then filters on `rank < 2 OR wsim > 0.3 OR sim > 0.2`. The wrapping subquery means the GIN trigram indexes (`Product_searchText_idx`, `Product_sku_idx`) are never used. EXPLAIN ANALYZE (tenant A, 5,000 rows): index scan on `Product_businessId_partNumber_idx` returning 5,000 rows, filter evaluates the similarity functions per row, ~117 ms to scan, 171 ms total, of which ~30 ms is JIT compilation (the high estimated cost of ~140k triggers JIT; `show jit` = on). The cost grows linearly with products per tenant.
2. Second hot spot, `recentSoldPrices`: `OrderItem` has no index on `productId` (only the primary key), so the per-result sold-price lookup does a Seq Scan over all 200k order items (~77 ms in EXPLAIN ANALYZE). With a temporary `CREATE INDEX ... ON "OrderItem" ("productId")` (rolled back, not kept) the same query dropped to ~4.5 ms. This accounts for roughly 75 of the ~260 ms single-user latency.
3. The serial-number EXISTS in the rank CASE is a hashed subplan that Seq Scans `ProductInstance` (30k rows, ~3-5 ms) because there is no index on `lower("serialNumber")`. Small today, but it grows with instances.
4. `getproducts` page 1 passes (p95 175 ms at 10 VUs). The `search=` variant fails (p95 522 ms); it was not EXPLAINed, but the Seq Scan on `OrderItem` is not involved, so the search predicate in `findProductIdPage` is the place to look (likely `ILIKE`/`contains` over several columns rather than the `searchText` trigram index).
5. Dataset caveat: all bench product names share the prefix "Bench Part A-", so the fuzzy tier matches nearly all 5,000 rows (the `<%` operator returned every row), which makes the fuzzy path worst-case compared with a real catalogue with varied names.

## Recommendations (server code not changed in this task)

- `OrderItem`: add `@@index([productId])` (migration `CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId")`). Largest single win, ~70 ms per request. Consider `(productId, orderId)`.
- `rankedProductIds`: split into tiers instead of scoring every row. Tier 0: exact match through indexed lookups (`CREATE INDEX ON "Product" ("businessId", lower(sku))`, same for `lower("partNumber")`, a GIN on `aliases`, and `CREATE INDEX ON "ProductInstance" (lower("serialNumber")) WHERE "serialNumber" IS NOT NULL`). Tier 1: token ILIKE on `searchText` (served by the existing GIN trigram index) with `LIMIT`. Run the fuzzy tier (`q <% "searchText"`, `similarity` via the `%` operator, which can use the GIN index) only when tiers 0 and 1 return fewer than `limit` rows. A prototype of exact + `<%` fuzzy with `SET LOCAL jit = off` ran in ~82 ms on this deliberately worst-case data (versus 171 ms), and exact-only hits end in about 1 ms.
- Turn JIT off for these queries (`SET LOCAL jit = off` or `jit = off` on the role/database); it costs ~30 ms on a query that runs in ~100 ms.
- Rerun this bench after those changes; expected: exact and prefix well under 100 ms p95.
- Reproduce: seed `deepkhata_bench` with `tsx prisma/seed.ts --large`, start the API from `apps/server/dist` with `DATABASE_URL` pointed at it and `PORT=5199`, then `BASE_URL=http://localhost:5199 node apps/bench/run.mjs` (options `--duration=60 --vus=10 --only=<name>`).
