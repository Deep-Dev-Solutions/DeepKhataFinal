-- CreateEnum
CREATE TYPE "KhataDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "KhataPartyType" AS ENUM ('CUSTOMER', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "KhataStatus" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "defaultPayableDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "defaultReceivableDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "priceOverrideReason" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KhataEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "direction" "KhataDirection" NOT NULL,
    "partyType" "KhataPartyType" NOT NULL,
    "customerId" TEXT,
    "vendorId" TEXT,
    "partyName" TEXT NOT NULL,
    "partyPhone" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "settledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "counterAccount" TEXT NOT NULL DEFAULT 'ASSET',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "KhataStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KhataEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseToPay" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PROMISE',
    "promisedDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueReminder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DueReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "rules" JSONB NOT NULL,
    "digestTime" TEXT NOT NULL DEFAULT '10:00',
    "recipients" TEXT NOT NULL DEFAULT 'OWNER_AND_MANAGERS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fireDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KhataEntry_businessId_direction_status_dueDate_idx" ON "KhataEntry"("businessId", "direction", "status", "dueDate");

-- CreateIndex
CREATE INDEX "PromiseToPay_businessId_entityType_entityId_idx" ON "PromiseToPay"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "DueReminder_businessId_entityType_entityId_idx" ON "DueReminder"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_businessId_userId_readAt_idx" ON "Notification"("businessId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_businessId_userId_key" ON "NotificationSetting"("businessId", "userId");

-- CreateIndex
CREATE INDEX "NotificationLog_businessId_idx" ON "NotificationLog"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_ruleKey_entityId_fireDate_key" ON "NotificationLog"("ruleKey", "entityId", "fireDate");

-- AddForeignKey
ALTER TABLE "KhataEntry" ADD CONSTRAINT "KhataEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KhataEntry" ADD CONSTRAINT "KhataEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KhataEntry" ADD CONSTRAINT "KhataEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KhataEntry" ADD CONSTRAINT "KhataEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

