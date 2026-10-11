# Phase 2: Correctness and performance

**Goal:** money that can't drift, a single tenant/branch guard, and product queries that stay fast
at 5,000+ products per shop.

## Tasks

1. **Money to Decimal.**
   - Migrate every money field from `Float` to `Decimal @db.Decimal(14,2)`: `Product.basePrice`, `defaultCostPrice`, `ProductInstance.unitCost`, `Order.discount`, `totalAmount`, `OrderItem.price`, `Payment.amount`, `Posting.amount`, `Expense.amount`, all `CashRegisterSession` money fields, `Customer.creditLimit`, `AgencyBillingLog.amount`, and any others found.
   - Migration uses `ALTER COLUMN ... TYPE numeric(14,2) USING round(col::numeric, 2)`.
   - Add a small `money.ts` util (wrapping `Prisma.Decimal`): add, sub, mul, sum, `toApi()` (string with 2 decimals). API responses send money as strings; client parses for display only.
   - Write a script `scripts/verify-ledger.ts` that checks every transaction's postings sum to exactly 0 and reports drift. Run before and after the migration; record results in STATUS.md.
2. **TenantContext guard.**
   - A global guard/interceptor after `JwtAuthGuard` that sets `req.tenant = { businessId, branchId }`.
   - `branchId` from `x-branch-id` is validated to belong to the business (and not soft-deleted). Cache valid branch IDs per business in memory for 60 s.
   - A `@Tenant()` param decorator. Refactor services to accept `tenant` instead of re-querying the user (`requireBusinessId(userId)` does an extra DB call on every request).
3. **Kill-switch cost.** `JwtAuthGuard` queries business status on every request. Cache `{status, subscriptionExpiresAt}` per business in memory for 60 s; invalidate when the agency changes status.
4. **`updatedAt` and soft delete** on every model the client caches: Product, ProductInstance, Category, Cabinet, Customer, Vendor, Branch. Add `deletedAt` where missing (Customer, Vendor, Category, Cabinet). Index `(businessId, updatedAt)` on each. Needed for delta sync in Phase 9.
5. **Rewrite `getProducts`.**
   - Today it loads every available instance in the whole business on every call, then counts in JS.
   - Replace with: paginated products (`limit`, `cursor`), and per-branch stock counts via `groupBy(['productId','branchId'])` limited to the page's product IDs, or a single SQL query with `COUNT(*) FILTER`.
   - Search with Postgres `pg_trgm`: enable the extension in a migration; GIN trigram indexes on `Product.name` and `Product.sku`.
   - Drop the 1-hour Redis cache for this endpoint once it's fast without it (target under 80 ms p95 for a 5,000-product shop on the dev machine).
6. **Indexes.** Add missing indexes found via `EXPLAIN ANALYZE` on: orders by `(businessId, createdAt)`, `(businessId, customerId)`; instances by `(productId, status, branchId)`; postings by `(accountId, accountType)`; customers by `(businessId, phone)`.
7. **Benchmark baseline.** Add `apps/bench` with the k6 script from the infra doc (counter session: search, product, other-branch stock, customer lookup, checkout, payment). Run it against the `--large` seed locally; save results to `apps/bench/results/phase-2.md`.

## Tests

- API: money rounding (e.g. 3 × 33.33 + discount), ledger balance after every flow, branch header from another tenant → 403.
- E2E: full P0 suite stays green after the Decimal migration.
- `verify-ledger.ts` reports zero drift on the seed DB.

## Acceptance criteria

- [ ] No `Float` money fields remain in `schema.prisma`.
- [ ] Every service gets `businessId`/`branchId` from `@Tenant()`; grep finds no `body.businessId` or `query.businessId`.
- [ ] Product list p95 under 80 ms on the large seed (local); results file committed.
- [ ] P0 E2E suite green.
