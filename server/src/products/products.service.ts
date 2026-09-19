import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private async requireBusinessId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });
    if (!user?.businessId)
      throw new BadRequestException(
        'User does not have an associated business',
      );
    return user.businessId;
  }

  private sanitizeCondition(condition: string): string {
    return VALID_CONDITIONS.includes(condition) ? condition : 'ORIGINAL_PULL';
  }

  // Resolve the branch a physical unit should live in: explicit branchId,
  // otherwise the business default (main) branch.
  private async resolveBranchId(
    tx: any,
    businessId: string,
    branchId?: string,
  ): Promise<string> {
    if (branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, businessId },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch not found');
      return branch.id;
    }
    const branch = await tx.branch.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!branch)
      throw new BadRequestException(
        'Business has no branch. Create a branch before adding inventory.',
      );
    return branch.id;
  }

  // Resolve or create a cabinet for a given branch.
  private async resolveCabinetId(
    tx: any,
    businessId: string,
    branchId: string,
    data: any,
  ): Promise<string> {
    if (data.cabinetId) {
      const cabinet = await tx.cabinet.findFirst({
        where: { id: data.cabinetId, businessId, branchId },
        select: { id: true },
      });
      if (!cabinet)
        throw new BadRequestException(
          'Cabinet not found in the selected branch',
        );
      return cabinet.id;
    }

    const parts = [
      data.rack ? `Rack ${data.rack}` : null,
      data.shelf ? `Shelf ${data.shelf}` : null,
      data.bin ? `Bin ${data.bin}` : null,
    ].filter(Boolean);

    if (parts.length) {
      const cabinet = await tx.cabinet.create({
        data: {
          name: parts.join(' / '),
          location: parts.join(' -> '),
          rack: data.rack?.trim() || null,
          shelf: data.shelf?.trim() || null,
          bin: data.bin?.trim() || null,
          businessId,
          branchId,
        },
      });
      return cabinet.id;
    }

    // Fall back to a shared 'General' cabinet for the branch.
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
    return general.id;
  }

  async addProduct(userId: string, data: any) {
    const {
      name,
      price,
      category,
      sku,
      costPrice,
      // Spatial Inventory Fields
      branchId,
      cabinetId,
      rack,
      shelf,
      bin,
      condition = 'ORIGINAL_PULL',
      quantity = 1,
      vendorId,
    } = data;

    const businessId = await this.requireBusinessId(userId);

    if (!name || !name.trim())
      throw new BadRequestException('Product name is required');

    const categoryExists = await this.prisma.category.findFirst({
      where: { name: category, businessId },
      select: { id: true },
    });
    if (!categoryExists)
      throw new BadRequestException('Category does not exist');

    const parsedPrice = Number(price) || 0;
    if (parsedPrice <= 0) {
      throw new BadRequestException('Product price must be greater than 0');
    }
    const instanceQty = Math.max(1, Number(quantity) || 1);
    const sanitizedCondition = this.sanitizeCondition(condition);

    const result = await this.prisma.$transaction(async (tx) => {
      const branch = await this.resolveBranchId(tx, businessId, branchId);
      const targetCabinetId = await this.resolveCabinetId(
        tx,
        businessId,
        branch,
        { cabinetId, rack, shelf, bin },
      );

      // Master catalog entry. No branch / condition / physical stock lives here.
      const product = await tx.product.create({
        data: {
          name: name.trim(),
          basePrice: parsedPrice,
          costPrice: costPrice ? Number(costPrice) : null,
          categoryId: categoryExists.id,
          sku:
            sku?.trim() ||
            `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
          businessId,
        },
      });

      // Discrete physical units placed in a spatial cabinet under a branch.
      const instancesData = Array.from({ length: instanceQty }).map(
        (_, index) => ({
          productId: product.id,
          cabinetId: targetCabinetId,
          branchId: branch,
          vendorId: vendorId || null,
          condition: sanitizedCondition as any,
          status: 'AVAILABLE' as any,
          serialNumber: sku ? `${sku}-${index + 1}` : null,
        }),
      );

      await tx.productInstance.createMany({
        data: instancesData,
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          cabinetId: targetCabinetId,
          fromCondition: null,
          toCondition: sanitizedCondition as any,
          quantity: instanceQty,
          direction: 'IN',
          referenceType: 'INITIAL_STOCK',
          referenceId: product.id,
          notes: 'Initial stock during product creation',
          userId,
          businessId,
          vendorId: vendorId || null,
        },
      });

      const fullProduct = await tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          instances: { include: { cabinet: true } },
        },
      });

      return fullProduct;
    });

    return {
      message: 'Product & Spatial Instances Created Successfully',
      product: result,
    };
  }

  async getProducts(userId: string, query: any) {
    const { search, category, stock, branchId } = query;
    const businessId = await this.requireBusinessId(userId);

    const queryConditions: any = { businessId };

    if (search) {
      queryConditions.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category && category !== 'All') {
      queryConditions.category = { name: category };
    }

    const products = await this.prisma.product.findMany({
      where: queryConditions,
      include: {
        category: true,
        instances: {
          where: {
            status: 'AVAILABLE',
            ...(branchId ? { branchId } : {}),
          },
          include: { cabinet: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { id: 'desc' },
    });

    // Master catalog records that hold physical units anywhere (for branch
    // filtering we still want to surface globally out-of-stock products).
    const businessWideAvailable = new Set<string>();
    if (branchId) {
      const grouped = await this.prisma.productInstance.groupBy({
        by: ['productId'],
        where: { status: 'AVAILABLE' },
        _count: { _all: true },
      });
      grouped.forEach((g) => {
        if (g._count._all > 0) businessWideAvailable.add(g.productId);
      });
    }

    return {
      success: true,
      products: products
        .map((p) => ({ ...p, stock: p.instances.length }))
        .filter((p) => {
          if (stock === 'out') return p.stock === 0;
          if (stock === 'low') return p.stock > 0 && p.stock <= 5;
          if (branchId) {
            return (
              p.stock > 0 ||
              !businessWideAvailable.has(p.id)
            );
          }
          return true;
        }),
    };
  }

  async updatePrice(userId: string, productId: string, price: number) {
    const businessId = await this.requireBusinessId(userId);

    if (price <= 0) {
      throw new BadRequestException('Price must be greater than zero');
    }

    const existing = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!existing) throw new NotFoundException('Product not found');

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { basePrice: price },
    });

    return { success: true, product };
  }

  async getBranches(userId: string) {
    const businessId = await this.requireBusinessId(userId);

    const branches = await this.prisma.branch.findMany({
      where: { businessId },
      include: { cabinets: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, branches };
  }

  async addBranch(userId: string, data: any) {
    const { name, location } = data;
    const businessId = await this.requireBusinessId(userId);

    if (!name || !name.trim())
      throw new BadRequestException('Branch name is required');

    const branch = await this.prisma.branch.create({
      data: {
        name: name.trim(),
        location: location?.trim() || null,
        businessId,
      },
    });

    return { success: true, branch };
  }

  async bulkRestock(userId: string, data: any) {
    const { productId, branchId, cabinetId, condition, quantity, vendorId } =
      data;
    const businessId = await this.requireBusinessId(userId);

    const qty = Math.max(1, Number(quantity) || 1);
    const sanitizedCondition = this.sanitizeCondition(condition);

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, businessId },
      });
      if (!product) throw new BadRequestException('Product not found');

      const branch = await this.resolveBranchId(tx, businessId, branchId);
      const targetCabinetId = await this.resolveCabinetId(
        tx,
        businessId,
        branch,
        { cabinetId },
      );

      await tx.productInstance.createMany({
        data: Array.from({ length: qty }).map(() => ({
          productId: product.id,
          cabinetId: targetCabinetId,
          branchId: branch,
          vendorId: vendorId || null,
          condition: sanitizedCondition as any,
          status: 'AVAILABLE' as any,
        })),
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          cabinetId: targetCabinetId,
          fromCondition: null,
          toCondition: sanitizedCondition as any,
          quantity: qty,
          direction: 'IN',
          referenceType: 'RESTOCK',
          notes: 'Bulk restock',
          userId,
          businessId,
          vendorId: vendorId || null,
        },
      });

      const fullProduct = await tx.product.findUnique({
        where: { id: product.id },
        include: { category: true },
      });
      return fullProduct;
    });

    return { success: true, product: result };
  }

  async importProducts(userId: string, productsData: any[]) {
    const businessId = await this.requireBusinessId(userId);

    if (!Array.isArray(productsData) || productsData.length === 0) {
      throw new BadRequestException('No products provided for import');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let importedCount = 0;

      const categoriesCache = new Map<string, string>();
      const existingCategories = await tx.category.findMany({
        where: { businessId },
      });
      existingCategories.forEach((c) =>
        categoriesCache.set(c.name.toLowerCase(), c.id),
      );

      const branch = await this.resolveBranchId(tx, businessId);
      const generalCabinet = await this.resolveCabinetId(
        tx,
        businessId,
        branch,
        {},
      );

      for (const item of productsData) {
        const name = item.name || item.Name;
        if (!name || !name.trim()) continue;

        let categoryId;
        const catName =
          (item.category || item.Category)?.trim() || 'Uncategorized';
        const catKey = catName.toLowerCase();

        if (categoriesCache.has(catKey)) {
          categoryId = categoriesCache.get(catKey);
        } else {
          const newCat = await tx.category.create({
            data: { name: catName, businessId },
          });
          categoryId = newCat.id;
          categoriesCache.set(catKey, newCat.id);
        }

        const parsedPrice = Number(item.price || item.Price) || 0;
        const instanceQty = Math.max(
          1,
          Number(item.quantity || item.Quantity) || 1,
        );
        const sku =
          item.sku?.trim() ||
          item.SKU?.trim() ||
          `SKU-${Math.floor(1000 + Math.random() * 9000)}`;

        const inputCondition = item.condition || item.Condition;
        const sanitizedCondition = this.sanitizeCondition(inputCondition);

        const product = await tx.product.create({
          data: {
            name: name.trim(),
            basePrice: parsedPrice,
            costPrice: item.costPrice
              ? Number(item.costPrice)
              : null,
            categoryId,
            sku,
            businessId,
          },
        });

        await tx.productInstance.createMany({
          data: Array.from({ length: instanceQty }).map((_, index) => ({
            productId: product.id,
            cabinetId: generalCabinet,
            branchId: branch,
            vendorId: item.vendorId || null,
            condition: sanitizedCondition as any,
            status: 'AVAILABLE' as any,
            serialNumber: `${sku}-${index + 1}`,
          })),
        });

        importedCount++;
      }
      return importedCount;
    });

    return {
      success: true,
      message: `Successfully imported ${result} products.`,
      count: result,
    };
  }
}