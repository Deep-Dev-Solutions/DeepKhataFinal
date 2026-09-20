import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Backfill Product.basePrice from legacy price column
  const nullBasePrice = await prisma.product.findMany({
    where: { basePrice: null },
    select: { id: true, price: true },
  });
  for (const p of nullBasePrice) {
    if (p.price == null) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { basePrice: p.price },
    });
  }
  console.log(`Backfilled basePrice for ${nullBasePrice.length} products.`);

  // 2. Backfill Cabinet.branchId to the business main branch (oldest branch)
  const branchlessCabinets = await prisma.cabinet.findMany({
    where: { branchId: null },
    select: { id: true, businessId: true },
  });
  for (const cab of branchlessCabinets) {
    const branch = await prisma.branch.findFirst({
      where: { businessId: cab.businessId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!branch) continue;
    await prisma.cabinet.update({
      where: { id: cab.id },
      data: { branchId: branch.id },
    });
  }
  console.log(`Assigned ${branchlessCabinets.length} branchless cabinets to main branch.`);

  // 3. Create a 'General' cabinet per branch for unlocated instances
  const nullCabinetInstances = await prisma.productInstance.findMany({
    where: { cabinetId: null },
    select: { id: true, product: { select: { businessId: true } } },
  });

  const branchForInstance = new Map<string, string>();
  const generalCabinetCache = new Map<string, string>(); // branchId -> general cabinet id

  async function resolveBranchForBusiness(businessId: string): Promise<string | null> {
    const existing = branchForInstance.get(businessId);
    if (existing) return existing;
    const branch = await prisma.branch.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (branch) branchForInstance.set(businessId, branch.id);
    return branch?.id ?? null;
  }

  async function resolveGeneralCabinet(branchId: string, businessId: string): Promise<string> {
    const cached = generalCabinetCache.get(branchId);
    if (cached) return cached;
    let cabinet = await prisma.cabinet.findFirst({
      where: { branchId, name: 'General' },
      select: { id: true },
    });
    if (!cabinet) {
      cabinet = await prisma.cabinet.create({
        data: {
          name: 'General',
          location: 'General Storage',
          businessId,
          branchId,
        },
      });
    }
    generalCabinetCache.set(branchId, cabinet.id);
    return cabinet.id;
  }

  for (const inst of nullCabinetInstances) {
    const businessId = inst.product.businessId;
    const branchId = await resolveBranchForBusiness(businessId);
    if (!branchId) continue;
    const cabinetId = await resolveGeneralCabinet(branchId, businessId);
    await prisma.productInstance.update({
      where: { id: inst.id },
      data: { cabinetId, branchId },
    });
  }
  console.log(`Located ${nullCabinetInstances.length} instances in 'General' cabinets.`);

  // 4. Backfill any remaining ProductInstance.branchId from its cabinet
  const branchlessInstances = await prisma.productInstance.findMany({
    where: { branchId: null },
    select: { id: true, cabinet: { select: { branchId: true } } },
  });
  for (const inst of branchlessInstances) {
    if (!inst.cabinet?.branchId) continue;
    await prisma.productInstance.update({
      where: { id: inst.id },
      data: { branchId: inst.cabinet.branchId },
    });
  }
  console.log(`Backfilled branchId on ${branchlessInstances.length} instances from cabinet.`);

  // 5. Backfill Product.categoryId to a 'General' category per business
  const uncategorized = await prisma.product.findMany({
    where: { categoryId: null },
    select: { id: true, businessId: true },
  });
  const categoryCache = new Map<string, string>(); // businessId -> category id
  for (const prod of uncategorized) {
    let categoryId = categoryCache.get(prod.businessId);
    if (!categoryId) {
      const existing = await prisma.category.findFirst({
        where: { businessId: prod.businessId, name: 'General' },
        select: { id: true },
      });
      categoryId = existing?.id ?? (
        await prisma.category.create({
          data: { name: 'General', businessId: prod.businessId },
        })
      ).id;
      categoryCache.set(prod.businessId, categoryId);
    }
    await prisma.product.update({
      where: { id: prod.id },
      data: { categoryId },
    });
  }
  console.log(`Assigned category to ${uncategorized.length} products.`);

  // 6. Ensure every product has a SKU (required in final schema)
  const skuless = await prisma.product.findMany({
    where: { OR: [{ sku: null }, { sku: '' }] },
    select: { id: true },
  });
  for (const prod of skuless) {
    await prisma.product.update({
      where: { id: prod.id },
      data: { sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}` },
    });
  }
  console.log(`Assigned SKUs to ${skuless.length} products.`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });