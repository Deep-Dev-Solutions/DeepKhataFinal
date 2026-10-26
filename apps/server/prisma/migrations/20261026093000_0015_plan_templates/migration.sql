-- Phase 8: re-seed plan templates (Day 2 custom deals).
-- TRIAL (30d, 1/2/100) and CUSTOM (unlimited) already exist from migration 0009.
-- Add BASIC (1 branch, 5 users) and STANDARD (2 branches, 10 users).
-- Retire STARTER and BUSINESS so existing tenants keep their current limits;
-- new tenants are offered TRIAL / BASIC / STANDARD / CUSTOM instead.
INSERT INTO "Plan" ("id", "code", "name", "priceMonthly", "priceYearly", "maxBranches", "maxUsers", "maxProducts", "trialDays", "features", "isPublic", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'BASIC',   'Basic',    3000, 30000,  1,  5,  NULL, NULL, '{}', true,  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'STANDARD','Standard', 7000, 70000,  2, 10,  NULL, NULL, '{}', true,  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Retire legacy STARTER / BUSINESS: existing tenants on these plans keep their
-- limits (their Subscription.customLimits are untouched), but they are no
-- longer offered to new tenants.
UPDATE "Plan" SET active = false, "isPublic" = false WHERE code IN ('STARTER', 'BUSINESS');
