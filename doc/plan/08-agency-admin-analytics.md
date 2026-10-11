# Phase 8: Agency admin analytics

**Goal:** the agency sees each shop's real usage and sales volume, so pricing conversations are
based on data ("you recorded Rs 4.2M in sales and 1,100 invoices last month") and unhealthy
accounts are spotted early.

## Transparency rule (do this first)

Shops will not be told what we can see unless we tell them. Before shipping analytics:
- Add a Terms of Service / privacy page stating that the provider can view usage and aggregate sales metrics for billing, support and plan enforcement, and never shares them with third parties.
- Show the link at signup (checkbox) and in Settings.
- Log every super-admin access to tenant data (`AdminAccessLog`: admin, tenant, action, route, timestamp) and show tenants an "Access log" in Settings. This builds trust and protects us in disputes.

## Data model

1. `TenantDailyUsage` (computed nightly at 02:00 Asia/Karachi for the previous day, plus backfill for history): `businessId`, `date`, `ordersCount`, `gmv` (Decimal), `itemsSold`, `returnsCount`, `paymentsReceived`, `newCustomers`, `newProducts`, `activeUsers`, `logins`, `offlineSyncedOrders`, `duesOpenReceivable`, `duesOpenPayable`. Unique `(businessId, date)`.
2. `lastActiveAt` on User and Business (updated at most once per 5 minutes per user, from the session guard).
3. `AdminAccessLog` as above.

## Agency admin UI (`apps/agency-admin`)

1. **Tenants list:** name, plan, status, trial days left, last active, 30-day orders and GMV, active users / plan users, products / plan products, health score, plan-fit flag. Filters: trialing, expiring in 7 days, past due, inactive 7+ days, over plan limits. Sort by GMV and by last active. CSV export.
2. **Health score (0–100):** active days in last 30 (40%), orders trend vs previous 30 days (30%), feature breadth (POS, khata, dues, stock finder used in the last 14 days, 30%). Shown as a number plus a short reason.
3. **Plan-fit flag:** usage above the plan (users, branches, products) or GMV above a threshold set per plan → "Upgrade candidate". Below 10% of the plan for 30 days → "Churn risk".
4. **Tenant detail page:**
   - Charts: daily orders and GMV for the last 90 days, hour-of-day activity heatmap, top 10 products by revenue, branch split.
   - Users: role, branches, last login, sessions.
   - Limits usage meters; subscription history; invoices and payments (Phase 7).
   - Follow-up notes and status (from Phase 7 leads).
   - **"Usage statement" PDF** for a period: orders, GMV, invoices printed, staff active, dues tracked. This is the document to show a shop that says "your software doesn't help" or asks for a lower price.
5. **Read-only "View as tenant"** using Better Auth impersonation: opens the client app in a read-only mode with a red banner "Viewing as <tenant> (read-only)"; all writes blocked server-side during impersonation; every view logged in `AdminAccessLog`.
6. **Overview dashboard:** MRR (from active subscriptions), trials started this month, trial→paid conversion, churned tenants, total GMV processed, signups by city and market.

## Backend

- `AgencyAnalyticsModule` with endpoints under `/agency/analytics/*`, `SUPER_ADMIN` only.
- Aggregations come from `TenantDailyUsage`, not live scans of orders, so the admin stays fast as data grows.
- Nightly job is idempotent (upsert per day) and has a backfill command: `npm run usage:backfill -- --from 2026-01-01`.

## Tests

- API: daily usage numbers match direct SQL counts on the seed; backfill idempotent; non-super-admin gets 403 on every analytics route; impersonation blocks writes and logs access.
- E2E: agency admin opens GM Traders detail → charts render → generates usage statement PDF → "View as tenant" shows banner and a disabled checkout button → tenant sees the access in Settings → Access log.

## Acceptance criteria

- [ ] Tenants list loads in under 1 second with 200 seeded tenants.
- [ ] Usage statement PDF numbers match the tenant's own reports for the same period.
- [ ] Every super-admin view of tenant data is logged and visible to the tenant.
