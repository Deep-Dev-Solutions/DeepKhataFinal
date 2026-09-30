import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async restock(userId: string, data: any) {
    const { items } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Restock batch is empty');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException(
        'User does not have an associated business',
      );
    const businessId = currentUser.businessId;

    const result = await this.prisma.$transaction(async (tx) => {
      const createdMovements: any[] = [];
      let totalUnits = 0;

      for (const item of items) {
        const {
          productId,
          cabinetId,
          branchId,
          quantity,
          notes,
          vendorId,
          unitCost,
        } = item;

        if (!productId)
          throw new BadRequestException('Each restock line needs a productId');

        const qty = Math.max(1, Number(quantity) || 1);

        const product = await tx.product.findFirst({
          where: { id: productId, businessId, deletedAt: null },
        });
        if (!product) throw new BadRequestException('Product not found');

        // Every physical unit must be tied to a branch.
        if (!branchId)
          throw new BadRequestException(
            `Restock line for ${product.name} requires a branchId`,
          );
        const branch = await tx.branch.findFirst({
          where: { id: branchId, businessId, deletedAt: null },
        });
        if (!branch) throw new BadRequestException('Branch not found');

        // Resolve the spatial cabinet: explicit cabinet (must be in branch) or
        // shared 'General' cabinet for the branch.
        let finalCabinetId = cabinetId;
        if (finalCabinetId) {
          const cabinet = await tx.cabinet.findFirst({
            where: { id: finalCabinetId, businessId, branchId },
          });
          if (!cabinet)
            throw new BadRequestException(
              'Cabinet not found in the selected branch',
            );
        } else {
          let general = await tx.cabinet.findFirst({
            where: { branchId, name: 'General' },
            select: { id: true },
          });
          if (!general) {
            general = await tx.cabinet.create({
              data: {
                name: 'General',
                location: 'General Storage',
                businessId,
                branchId,
              },
            });
          }
          finalCabinetId = general.id;
        }

        await tx.productInstance.createMany({
          data: Array.from({ length: qty }).map(() => ({
            productId: product.id,
            cabinetId: finalCabinetId,
            branchId,
            vendorId: vendorId || null,
            unitCost: unitCost ? Number(unitCost) : null,
            status: 'AVAILABLE' as any,
          })),
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            cabinetId: finalCabinetId,
            quantity: qty,
            direction: 'IN',
            referenceType: 'RESTOCK',
            referenceId: item.referenceId || null,
            notes: notes || null,
            userId,
            businessId,
            vendorId: vendorId || null,
          },
        });

        createdMovements.push(movement);
        totalUnits += qty;
      }

      return {
        movements: createdMovements,
        totalUnits,
        lineCount: items.length,
      };
    });

    // Invalidate caches across Restock, Products, Cabinets, and Dashboard
    await Promise.all([
      this.redis.deleteByPattern(`restock:${businessId}:*`),
      this.redis.deleteByPattern(`products:${businessId}:*`),
      this.redis.deleteByPattern(`cabinets:${businessId}:*`),
      this.redis.deleteByPattern(`dashboard:${businessId}*`),
    ]);

    return {
      success: true,
      message: `Restocked ${result.totalUnits} units across ${result.lineCount} line(s).`,
      movements: result.movements,
    };
  }

  async getLowStock(userId: string, query: any = {}) {
    const { branchId, threshold = 5 } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const businessId = currentUser.businessId;
    const cacheKey = branchId
      ? `restock:${businessId}:branch:${branchId}:low-stock`
      : `restock:${businessId}:low-stock`;

    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        deletedAt: null,
      },
      include: {
        category: { select: { name: true } },
        instances: {
          where: {
            status: 'AVAILABLE',
            ...(branchId ? { branchId } : {}),
          },
          include: {
            cabinet: { select: { name: true } },
          },
        },
      },
    });

    const lowStockProducts = products
      .map((p) => {
        const availableStock = p.instances.length;
        const cabinetName = p.instances[0]?.cabinet?.name || null;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category?.name || 'Uncategorized',
          cabinet: cabinetName,
          availableStock,
          price: p.basePrice,
          costPrice: p.defaultCostPrice,
        };
      })
      .filter((p) => p.availableStock <= Number(threshold));

    const result = { success: true, count: lowStockProducts.length, products: lowStockProducts };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async getRestockHistory(userId: string, query: any = {}) {
    const { branchId, limit = 50, page = 1 } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const businessId = currentUser.businessId;
    const parsedLimit = Math.min(parseInt(String(limit)) || 50, 200);
    const parsedPage = Math.max(parseInt(String(page)) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const cacheKey = branchId
      ? `restock:${businessId}:branch:${branchId}:history:p${parsedPage}:l${parsedLimit}`
      : `restock:${businessId}:history:p${parsedPage}:l${parsedLimit}`;

    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const history = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        referenceType: 'RESTOCK',
        direction: 'IN',
        ...(branchId ? { cabinet: { branchId } } : {}),
      },
      include: {
        product: { select: { name: true, sku: true } },
        cabinet: { select: { name: true, location: true, branchId: true } },
        user: { select: { name: true } },
        vendor: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parsedLimit,
    });

    const result = { success: true, history };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async getMovements(userId: string, query: any) {
    const { productId, branchId, limit = 50, page = 1 } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const businessId = currentUser.businessId;
    const parsedLimit = Math.min(parseInt(String(limit)) || 50, 200);
    const parsedPage = Math.max(parseInt(String(page)) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const cacheKey = branchId
      ? `restock:${businessId}:branch:${branchId}:movements:${productId || 'all'}:p${parsedPage}:l${parsedLimit}`
      : `restock:${businessId}:movements:${productId || 'all'}:p${parsedPage}:l${parsedLimit}`;

    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        ...(productId ? { productId } : {}),
        ...(branchId ? { cabinet: { branchId } } : {}),
      },
      include: {
        product: { select: { name: true, sku: true } },
        cabinet: { select: { name: true, location: true } },
        user: { select: { name: true } },
        vendor: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parsedLimit,
    });

    const result = { success: true, movements };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }
}
