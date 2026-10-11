import { createHash } from "crypto";

/**
 * Deterministic ids for the Phase 4/5 seed records (GM Traders, tenant A).
 * Uses the exact same algorithm as `detId` in apps/server/prisma/seed.ts, and
 * the seed imports this file, so specs and seed can never drift apart.
 */
export function detId(...parts: string[]): string {
  const data = parts.join(":");
  const h = createHash("sha1").update(data).digest("hex");
  return `${h.substring(0, 8)}-${h.substring(8, 12)}-4${h.substring(13, 16)}-8${h.substring(17, 20)}-${h.substring(20, 32)}`;
}

const keyboardProductId = detId("product-A-kb840g3");
const screenProductId = detId("product-A-screen-minprice");

export const catalog = {
  keyboard840: {
    productId: keyboardProductId,
    name: "HP EliteBook 840 G3 Keyboard (US, Backlit)",
    sku: "KB-840G3-US",
    partNumber: "821177-001",
    aliases: ["840 keyboard", "840 g3 keyboard"],
    compatibleWith: ["HP EliteBook 840 G3", "HP EliteBook 840 G4"],
    basePrice: 4500,
    minSalePrice: 3800,
    unitCost: 2500,
    // Stocked only at Hafeez Centre (Cabinet 1): ORIGINAL_PULL x2, MINOR_SCRATCHES x1.
    hafeezCentreInstanceIds: [
      detId("instance-kb840g3-hafeez-0"),
      detId("instance-kb840g3-hafeez-1"),
      detId("instance-kb840g3-hafeez-2"),
    ],
    hallRoadCount: 0,
  },
  minPriceScreen: {
    productId: screenProductId,
    name: 'Lenovo ThinkPad T480 14" FHD Screen',
    sku: "SCR-T480-FHD",
    basePrice: 9000,
    minSalePrice: 8000,
    unitCost: 6500,
    lowStockThreshold: 3,
    // ORIGINAL_PULL: 2 at Hall Road, 2 at Hafeez Centre.
    hallRoadInstanceIds: [
      detId("instance-screen-minprice-hallroad-0"),
      detId("instance-screen-minprice-hallroad-1"),
    ],
    hafeezCentreInstanceIds: [
      detId("instance-screen-minprice-hafeez-0"),
      detId("instance-screen-minprice-hafeez-1"),
    ],
  },
  vendorPurchases: {
    // Same vendor as the seeded tenant-A vendor #0 (TechWorld Distributors).
    vendorId: detId("vendor-A-0"),
    // Purchase B: Rs 12,000, created 3 days ago, due in 12 days, fully unpaid.
    openPurchaseId: detId("vendor-purchase-A-open"),
    openPurchaseAmount: 12000,
    // Purchase A: Rs 20,000, created 20 days ago, due 5 days ago (overdue),
    // partly settled (FIFO) by the Rs 5,000 payment below.
    partlyPaidPurchaseId: detId("vendor-purchase-A-partly-paid"),
    partlyPaidPurchaseAmount: 20000,
    paymentId: detId("vendor-payment-A-0"),
    paymentAmount: 5000,
  },
  khataOther: {
    entryId: detId("khata-entry-A-malik-mobile"),
    transactionId: detId("transaction-khata-entry-A-malik-mobile"),
    partyName: "Malik Mobile",
    partyPhone: "0300-1112233",
    amount: 5000,
  },
  creditOrder: {
    orderId: detId("order-A-credit-partial"),
    customerId: detId("customer-A-0"),
    total: 6000,
    paid: 1000,
  },
} as const;
