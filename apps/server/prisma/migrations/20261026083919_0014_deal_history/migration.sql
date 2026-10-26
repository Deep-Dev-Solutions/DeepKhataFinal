-- AlterEnum
ALTER TYPE "BillingCycle" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "supportEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DealHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "old" JSONB,
    "new" JSONB,
    "notes" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealHistory_businessId_changedAt_idx" ON "DealHistory"("businessId", "changedAt");

-- AddForeignKey
ALTER TABLE "DealHistory" ADD CONSTRAINT "DealHistory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
