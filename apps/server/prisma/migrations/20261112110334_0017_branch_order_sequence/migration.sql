/*
  Warnings:

  - A unique constraint covering the columns `[businessId,branchId,orderNumber]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientRef" TEXT;

-- CreateTable
CREATE TABLE "OrderNumberSequence" (
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("businessId","branchId")
);

-- Backfill a human branch code from the name's initials (2-4 letters).
UPDATE "Branch" AS b
SET "code" = LEFT(
  COALESCE(
    NULLIF(
      (
        SELECT UPPER(STRING_AGG(LEFT(w, 1), ''))
        FROM REGEXP_SPLIT_TO_TABLE(TRIM(b."name"), '\s+') AS w
        WHERE w <> ''
      ),
      ''
    ),
    'BR'
  ),
  4
)
WHERE b."code" IS NULL;

UPDATE "Branch"
SET "code" = UPPER(LEFT(REGEXP_REPLACE("name", '[^A-Za-z]', '', 'g') || 'BR', 2))
WHERE "code" IS NULL OR LENGTH("code") < 2;

-- Every order must belong to a branch before numbers become per-branch.
UPDATE "Order" AS o
SET "branchId" = b.id
FROM (
  SELECT DISTINCT ON ("businessId") id, "businessId"
  FROM "Branch"
  ORDER BY "businessId", "createdAt" ASC, id ASC
) AS b
WHERE o."branchId" IS NULL AND o."businessId" = b."businessId";

-- Seed each branch counter at the business's current max so old receipts keep
-- their numbers and the next sale in every branch starts at max + 1.
INSERT INTO "OrderNumberSequence" ("businessId", "branchId", "last")
SELECT b."businessId", b.id,
       COALESCE((SELECT MAX(o."orderNumber") FROM "Order" o WHERE o."businessId" = b."businessId"), 0)
FROM "Branch" b
ON CONFLICT ("businessId", "branchId") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_branchId_orderNumber_key" ON "Order"("businessId", "branchId", "orderNumber");
