-- Index-only migration (no data rewrite). Plain CREATE INDEX takes a SHARE lock
-- on the table for the build; these tables are small enough that this is brief.

-- CreateIndex: recent sold prices lookup in stock finder
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

-- Exact SKU / part number lookups (case-insensitive), tenant scoped (hand-written, expression indexes)
CREATE INDEX IF NOT EXISTS "Product_businessId_lower_sku_idx" ON "Product"("businessId", lower("sku"));
CREATE INDEX IF NOT EXISTS "Product_businessId_lower_partNumber_idx" ON "Product"("businessId", lower("partNumber"));

-- Exact serial number lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS "ProductInstance_lower_serialNumber_idx" ON "ProductInstance"(lower("serialNumber"));
