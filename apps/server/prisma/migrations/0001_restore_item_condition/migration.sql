-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('ORIGINAL_PULL', 'COPY', 'MINOR_SCRATCHES', 'WORKING', 'DEAD_DONOR', 'DEFECTIVE');

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "fromCondition" "ItemCondition",
ADD COLUMN     "toCondition" "ItemCondition" NOT NULL DEFAULT 'ORIGINAL_PULL';

-- AlterTable
ALTER TABLE "ProductInstance" ADD COLUMN     "condition" "ItemCondition" NOT NULL DEFAULT 'ORIGINAL_PULL';

