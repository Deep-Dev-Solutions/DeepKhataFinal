-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Branch" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Cabinet" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Cabinet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Customer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Vendor" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Branch_businessId_updatedAt_idx" ON "Branch"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "Cabinet_businessId_updatedAt_idx" ON "Cabinet"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "Category_businessId_updatedAt_idx" ON "Category"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "Customer_businessId_updatedAt_idx" ON "Customer"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "Customer_businessId_phone_idx" ON "Customer"("businessId", "phone");

-- CreateIndex
CREATE INDEX "Order_businessId_createdAt_idx" ON "Order"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_businessId_customerId_idx" ON "Order"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Posting_accountId_accountType_idx" ON "Posting"("accountId", "accountType");

-- CreateIndex
CREATE INDEX "Posting_transactionId_idx" ON "Posting"("transactionId");

-- CreateIndex
CREATE INDEX "Product_businessId_updatedAt_idx" ON "Product"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProductInstance_productId_status_branchId_idx" ON "ProductInstance"("productId", "status", "branchId");

-- CreateIndex
CREATE INDEX "ProductInstance_branchId_updatedAt_idx" ON "ProductInstance"("branchId", "updatedAt");

-- CreateIndex
CREATE INDEX "Transaction_businessId_type_createdAt_idx" ON "Transaction"("businessId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Vendor_businessId_updatedAt_idx" ON "Vendor"("businessId", "updatedAt");

