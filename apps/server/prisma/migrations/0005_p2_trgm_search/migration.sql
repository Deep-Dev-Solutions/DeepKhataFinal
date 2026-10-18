-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "compatibleWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lowStockThreshold" INTEGER,
ADD COLUMN     "minSalePrice" DECIMAL(14,2),
ADD COLUMN     "partNumber" TEXT,
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ProductInstance" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "photoUrl" TEXT;

-- CreateIndex
CREATE INDEX "Product_searchText_idx" ON "Product" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_businessId_partNumber_idx" ON "Product"("businessId", "partNumber");


-- Keep "searchText" in sync (hand-written)
CREATE OR REPLACE FUNCTION product_search_text() RETURNS trigger AS $$
BEGIN
  NEW."searchText" := lower(concat_ws(' ', NEW.name, NEW.sku, NEW."partNumber", array_to_string(NEW.aliases, ' '), array_to_string(NEW."compatibleWith", ' ')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_text_trg
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_search_text();

-- Backfill existing rows
UPDATE "Product" SET "searchText" = lower(concat_ws(' ', name, sku, "partNumber", array_to_string(aliases,' '), array_to_string("compatibleWith",' ')));
