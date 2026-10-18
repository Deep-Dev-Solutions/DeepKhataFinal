-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AgencyPaymentMethod" AS ENUM ('BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('NEW', 'CONTACTED', 'FEEDBACK_RECEIVED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "AgencyTaskType" AS ENUM ('FOLLOW_UP', 'FEEDBACK_CALL', 'CONVERSION');

-- CreateEnum
CREATE TYPE "AgencyTaskStatus" AS ENUM ('OPEN', 'DONE');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "city" TEXT,
ADD COLUMN     "followUpNotes" TEXT,
ADD COLUMN     "followUpStatus" "FollowUpStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "market" TEXT,
ADD COLUMN     "onboardingChecklist" JSONB,
ADD COLUMN     "sampleDataLoaded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "branchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allBranches" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "banExpires" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN DEFAULT false,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "displayUsername" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "activeBranchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranch" (
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" DECIMAL(14,2),
    "priceYearly" DECIMAL(14,2),
    "maxBranches" INTEGER,
    "maxUsers" INTEGER,
    "maxProducts" INTEGER,
    "trialDays" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "customLimits" JSONB,
    "priceOverride" DECIMAL(14,2),
    "graceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "publicToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyInvoiceSequence" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgencyInvoiceSequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "AgencyPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "businessId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "AgencyPaymentMethod" NOT NULL,
    "reference" TEXT,
    "proofUrl" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyTask" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "AgencyTaskType" NOT NULL,
    "status" "AgencyTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "AgencyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleMessage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDailyUsage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "gmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "returnsCount" INTEGER NOT NULL DEFAULT 0,
    "paymentsReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "newProducts" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "logins" INTEGER NOT NULL DEFAULT 0,
    "offlineSyncedOrders" INTEGER NOT NULL DEFAULT 0,
    "duesOpenReceivable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "duesOpenPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAccessLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" BIGSERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseIssue" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "EmailLog_status_nextAttemptAt_idx" ON "EmailLog"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_businessId_key" ON "Subscription"("businessId");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyInvoice_number_key" ON "AgencyInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyInvoice_publicToken_key" ON "AgencyInvoice"("publicToken");

-- CreateIndex
CREATE INDEX "AgencyInvoice_businessId_status_idx" ON "AgencyInvoice"("businessId", "status");

-- CreateIndex
CREATE INDEX "AgencyPayment_businessId_idx" ON "AgencyPayment"("businessId");

-- CreateIndex
CREATE INDEX "AgencyTask_status_dueAt_idx" ON "AgencyTask"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleMessage_businessId_key_key" ON "LifecycleMessage"("businessId", "key");

-- CreateIndex
CREATE INDEX "TenantDailyUsage_date_idx" ON "TenantDailyUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDailyUsage_businessId_date_key" ON "TenantDailyUsage"("businessId", "date");

-- CreateIndex
CREATE INDEX "AdminAccessLog_businessId_createdAt_idx" ON "AdminAccessLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_pushedAt_id_idx" ON "OutboxEvent"("pushedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "Device_businessId_idx" ON "Device"("businessId");

-- CreateIndex
CREATE INDEX "LicenseIssue_businessId_idx" ON "LicenseIssue"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvoice" ADD CONSTRAINT "AgencyInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvoice" ADD CONSTRAINT "AgencyInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyPayment" ADD CONSTRAINT "AgencyPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyPayment" ADD CONSTRAINT "AgencyPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "AgencyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyTask" ADD CONSTRAINT "AgencyTask_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleMessage" ADD CONSTRAINT "LifecycleMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDailyUsage" ADD CONSTRAINT "TenantDailyUsage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseIssue" ADD CONSTRAINT "LicenseIssue_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- Hand-written data backfills (idempotent, additive, no drops).
-- Business.slug and Business.phone already exist (slug is NOT NULL UNIQUE since
-- the baseline), so no slug backfill is needed.
-- ===========================================================================

-- Phase 6: existing users are trusted, mark verified.
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;

-- Phase 6: one credential Account per user, reusing the existing bcrypt hash.
INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", 'credential', u."id", u."password", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."password" IS NOT NULL
  AND u."password" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "Account" a WHERE a."userId" = u."id" AND a."providerId" = 'credential'
  );

-- Phase 7: seed plans (null max = unlimited).
INSERT INTO "Plan" ("id", "code", "name", "priceMonthly", "priceYearly", "maxBranches", "maxUsers", "maxProducts", "trialDays", "features", "isPublic", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'TRIAL',    'Free Trial', 0,    0,     1,    2,    100,  30,   '{}', true,  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'STARTER',  'Starter',    3000, 30000, 1,    3,    NULL, NULL, '{}', true,  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BUSINESS', 'Business',   NULL, NULL,  3,    10,   NULL, NULL, '{}', true,  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CUSTOM',   'Custom',     NULL, NULL,  NULL, NULL, NULL, NULL, '{}', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Phase 7: one Subscription per existing Business on the CUSTOM plan, mirroring Business.status.
INSERT INTO "Subscription" ("id", "businessId", "planId", "status", "currentPeriodStart", "currentPeriodEnd", "billingCycle", "customLimits", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  b."id",
  (SELECT p."id" FROM "Plan" p WHERE p."code" = 'CUSTOM'),
  CASE b."status"
    WHEN 'READ_ONLY' THEN 'READ_ONLY'::"SubscriptionStatus"
    WHEN 'SUSPENDED' THEN 'SUSPENDED'::"SubscriptionStatus"
    ELSE 'ACTIVE'::"SubscriptionStatus"
  END,
  b."createdAt",
  b."subscriptionExpiresAt",
  'MONTHLY',
  '{"maxBranches":2,"maxUsers":5,"maxProducts":null}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Business" b
WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."businessId" = b."id");

-- Phase 7: copy legacy AgencyBillingLog rows into AgencyPayment (log table is kept, deprecated).
-- Deterministic id keeps the copy idempotent.
INSERT INTO "AgencyPayment" ("id", "invoiceId", "businessId", "amount", "method", "reference", "receivedAt", "legacy", "createdAt")
SELECT 'legacy-' || l."id", NULL, l."businessId", l."amount", 'OTHER', l."notes", l."paymentDate", true, l."createdAt"
FROM "AgencyBillingLog" l
WHERE NOT EXISTS (SELECT 1 FROM "AgencyPayment" ap WHERE ap."id" = 'legacy-' || l."id");
