-- AlterTable
ALTER TABLE "AgencyBillingLog" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "CashRegisterSession" ALTER COLUMN "openingBalance" TYPE DECIMAL(14,2) USING round("openingBalance"::numeric, 2),
ALTER COLUMN "cashSales" TYPE DECIMAL(14,2) USING round("cashSales"::numeric, 2),
ALTER COLUMN "cashExpenses" TYPE DECIMAL(14,2) USING round("cashExpenses"::numeric, 2),
ALTER COLUMN "expectedCash" TYPE DECIMAL(14,2) USING round("expectedCash"::numeric, 2),
ALTER COLUMN "actualCash" TYPE DECIMAL(14,2) USING round("actualCash"::numeric, 2),
ALTER COLUMN "difference" TYPE DECIMAL(14,2) USING round("difference"::numeric, 2);

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "creditLimit" TYPE DECIMAL(14,2) USING round("creditLimit"::numeric, 2);

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "discount" TYPE DECIMAL(14,2) USING round("discount"::numeric, 2),
ALTER COLUMN "totalAmount" TYPE DECIMAL(14,2) USING round("totalAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "price" TYPE DECIMAL(14,2) USING round("price"::numeric, 2);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Posting" ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "basePrice" TYPE DECIMAL(14,2) USING round("basePrice"::numeric, 2),
ALTER COLUMN "defaultCostPrice" TYPE DECIMAL(14,2) USING round("defaultCostPrice"::numeric, 2);

-- AlterTable
ALTER TABLE "ProductInstance" ALTER COLUMN "unitCost" TYPE DECIMAL(14,2) USING round("unitCost"::numeric, 2);

