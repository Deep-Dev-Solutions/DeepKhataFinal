import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const VALID_CONDITIONS = [
  'ORIGINAL_PULL',
  'COPY',
  'MINOR_SCRATCHES',
  'WORKING',
  'DEAD_DONOR',
  'DEFECTIVE',
];

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

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
          condition,
          quantity,
          notes,
          vendorId,
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

        const sanitizedCondition = VALID_CONDITIONS.includes(condition)
          ? condition
          : 'ORIGINAL_PULL';

        await tx.productInstance.createMany({
          data: Array.from({ length: qty }).map(() => ({
            productId: product.id,
            cabinetId: finalCabinetId,
            branchId,
            vendorId: vendorId || null,
            condition: sanitizedCondition as any,
            status: 'AVAILABLE' as any,
          })),
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            cabinetId: finalCabinetId,
            fromCondition: null,
            toCondition: sanitizedCondition as any,
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

    return {
      success: true,
      message: `Restocked ${result.totalUnits} units across ${result.lineCount} line(s).`,
      movements: result.movements,
    };
  }

  async getMovements(userId: string, query: any) {
    const { productId, limit = 50 } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId: currentUser.businessId,
        ...(productId ? { productId } : {}),
      },
      include: {
        product: { select: { name: true, sku: true } },
        cabinet: { select: { name: true, location: true } },
        user: { select: { name: true } },
        vendor: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(String(limit)) || 50, 200),
    });

    return { success: true, movements };
  }
}