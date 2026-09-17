import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async addCategory(userId: string, data: any) {
    const { name } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException(
        'User does not have an associated business',
      );

    if (!name || !name.trim())
      throw new BadRequestException('Category name is required');
    const categoryName = name.trim();

    const existingCategory = await this.prisma.category.findFirst({
      where: {
        businessId: currentUser.businessId,
        name: { equals: categoryName, mode: 'insensitive' },
      },
    });
    if (existingCategory)
      throw new ConflictException('Category already exists');

    const category = await this.prisma.category.create({
      data: { name: categoryName, businessId: currentUser.businessId },
    });

    return { message: 'Category Created Successfully', category };
  }

  async getCategories(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const categories = await this.prisma.category.findMany({
      where: { businessId: currentUser.businessId },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, categories };
  }

  async updateCategory(userId: string, id: string, data: any) {
    const { name } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const category = await this.prisma.category.findFirst({
      where: { id, businessId: currentUser.businessId },
    });
    if (!category) throw new BadRequestException('Category not found');

    const newName = (name?.trim && name.trim()) || category.name;

    const duplicate = await this.prisma.category.findFirst({
      where: {
        businessId: currentUser.businessId,
        name: { equals: newName, mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (duplicate) throw new ConflictException('Category already exists');

    const updated = await this.prisma.category.update({
      where: { id },
      data: { name: newName },
    });

    return {
      success: true,
      message: 'Category updated successfully',
      category: updated,
    };
  }

  async deleteCategory(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const category = await this.prisma.category.findFirst({
      where: { id, businessId: currentUser.businessId },
    });
    if (!category) throw new BadRequestException('Category not found');

    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.delete({ where: { id } }),
    ]);

    return { success: true, message: 'Category deleted successfully' };
  }

  async getCabinets(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const cabinets = await this.prisma.cabinet.findMany({
      where: { businessId: currentUser.businessId },
      include: {
        _count: { select: { instances: true } },
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, cabinets };
  }

  async addCabinet(userId: string, data: any) {
    const { name, rack, shelf, bin } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const locationParts = [
      rack ? `Rack ${rack}` : null,
      shelf ? `Shelf ${shelf}` : null,
      bin ? `Bin ${bin}` : null,
    ].filter(Boolean);

    const locationStr = locationParts.join(' -> ');
    const cabinetName =
      name ||
      (locationParts.length ? locationParts.join(' / ') : 'General Cabinet');

    const cabinet = await this.prisma.cabinet.create({
      data: {
        name: cabinetName,
        location: locationStr || 'Shop Storage',
        businessId: currentUser.businessId,
      },
    });

    return { success: true, cabinet };
  }

  async updateCabinet(userId: string, id: string, data: any) {
    const { name, rack, shelf, bin } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id, businessId: currentUser.businessId },
    });
    if (!cabinet) throw new BadRequestException('Cabinet not found');

    const locationParts = [
      rack ? `Rack ${rack}` : null,
      shelf ? `Shelf ${shelf}` : null,
      bin ? `Bin ${bin}` : null,
    ].filter(Boolean);
    const locationStr = locationParts.length
      ? locationParts.join(' -> ')
      : cabinet.location;
    const newName =
      (name?.trim && name.trim()) ||
      (locationParts.length ? locationParts.join(' / ') : cabinet.name);

    const updated = await this.prisma.cabinet.update({
      where: { id },
      data: {
        name: newName,
        location: locationStr || 'Shop Storage',
      },
    });

    return {
      success: true,
      message: 'Cabinet updated successfully',
      cabinet: updated,
    };
  }

  async deleteCabinet(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id, businessId: currentUser.businessId },
    });
    if (!cabinet) throw new BadRequestException('Cabinet not found');

    await this.prisma.$transaction([
      this.prisma.productInstance.updateMany({
        where: { cabinetId: id },
        data: { cabinetId: null },
      }),
      this.prisma.inventoryMovement.updateMany({
        where: { cabinetId: id },
        data: { cabinetId: null },
      }),
      this.prisma.cabinet.delete({ where: { id } }),
    ]);

    return { success: true, message: 'Cabinet deleted successfully' };
  }

  async addProduct(userId: string, data: any) {
    const {
      name,
      price,
      category,
      sku,
      // Spatial Inventory Fields
      cabinetId,
      rack,
      shelf,
      bin,
      condition = 'ORIGINAL_PULL',
      quantity = 1,
      vendorId,
    } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException(
        'User does not have an associated business',
      );

    const categoryExists = await this.prisma.category.findFirst({
      where: { name: category, businessId: currentUser.businessId },
      select: { id: true },
    });

    if (!categoryExists)
      throw new BadRequestException('Category does not exist');

    const parsedPrice = Number(price) || 0;
    const instanceQty = Math.max(1, Number(quantity) || 1);

    // Map allowed condition values safely
    const validConditions = [
      'ORIGINAL_PULL',
      'COPY',
      'MINOR_SCRATCHES',
      'WORKING',
      'DEAD_DONOR',
      'DEFECTIVE',
    ];
    const sanitizedCondition = validConditions.includes(condition)
      ? condition
      : 'ORIGINAL_PULL';

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Resolve or create Spatial Cabinet
      let targetCabinetId = cabinetId;
      if (!targetCabinetId && (rack || shelf || bin)) {
        const locationParts = [
          rack ? `Rack ${rack}` : null,
          shelf ? `Shelf ${shelf}` : null,
          bin ? `Bin ${bin}` : null,
        ].filter(Boolean);
        const locationStr = locationParts.join(' -> ');
        const cabName = locationParts.join(' / ') || 'Cabinet Location';

        const newCabinet = await tx.cabinet.create({
          data: {
            name: cabName,
            location: locationStr,
            businessId: currentUser.businessId,
          },
        });
        targetCabinetId = newCabinet.id;
      }

      // 2. Create the master Product record with stock synced to instance count
      const product = await tx.product.create({
        data: {
          name,
          price: parsedPrice,
          categoryId: categoryExists.id,
          stock: instanceQty,
          sku: sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
          businessId: currentUser.businessId,
        },
      });

      // 3. Create discrete ProductInstance records tied to the physical Cabinet
      const instancesData = Array.from({ length: instanceQty }).map(
        (_, index) => ({
          productId: product.id,
          cabinetId: targetCabinetId || null,
          vendorId: vendorId || null,
          condition: sanitizedCondition as any,
          status: 'AVAILABLE' as any,
          serialNumber: sku ? `${sku}-${index + 1}` : null,
        }),
      );

      await tx.productInstance.createMany({
        data: instancesData,
      });

      if (instanceQty > 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            cabinetId: targetCabinetId || null,
            fromCondition: null,
            toCondition: sanitizedCondition as any,
            quantity: instanceQty,
            direction: 'IN',
            referenceType: 'INITIAL_STOCK',
            referenceId: product.id,
            notes: 'Initial stock during product creation',
            userId,
            businessId: currentUser.businessId,
            vendorId: vendorId || null,
          },
        });
      }

      const fullProduct = await tx.product.findUnique({
        where: { id: product.id },
        include: {
          category: true,
          instances: {
            include: { cabinet: true },
          },
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
    const { search, category, stock } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    let queryConditions: any = { businessId: currentUser.businessId };

    if (search) {
      queryConditions.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category && category !== 'All') {
      queryConditions.category = { name: category };
    }
    if (stock === 'out') {
      queryConditions.stock = 0;
    } else if (stock === 'low') {
      queryConditions.stock = { gt: 0, lte: 5 };
    }

    const products = await this.prisma.product.findMany({
      where: queryConditions,
      include: {
        category: true,
        instances: {
          include: { cabinet: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { id: 'desc' },
    });

    return { success: true, products };
  }

  async updatePrice(userId: string, productId: string, price: number) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId) {
      throw new BadRequestException('No business found.');
    }

    if (price < 0) {
      throw new BadRequestException('Price cannot be negative');
    }

    const product = await this.prisma.product.update({
      where: { id: productId, businessId: currentUser.businessId },
      data: { price },
    });

    return { success: true, product };
  }
  async getBranches(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const branches = await this.prisma.branch.findMany({
      where: { businessId: currentUser.businessId },
      include: { cabinets: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, branches };
  }

  async addBranch(userId: string, data: any) {
    const { name, location } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const branch = await this.prisma.branch.create({
      data: {
        name,
        location,
        businessId: currentUser.businessId,
      },
    });

    return { success: true, branch };
  }

  async bulkRestock(userId: string, data: any) {
    const { productId, branchId, cabinetId, condition, quantity } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const qty = Math.max(1, Number(quantity) || 1);

    const validConditions = [
      'ORIGINAL_PULL',
      'COPY',
      'MINOR_SCRATCHES',
      'WORKING',
      'DEAD_DONOR',
      'DEFECTIVE',
    ];
    const sanitizedCondition = validConditions.includes(condition)
      ? condition
      : 'ORIGINAL_PULL';

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, businessId: currentUser.businessId },
      });
      if (!product) throw new BadRequestException('Product not found');

      let finalCabinetId = cabinetId;
      if (finalCabinetId) {
        const cab = await tx.cabinet.findFirst({
          where: { id: finalCabinetId, businessId: currentUser.businessId },
        });
        if (!cab) throw new BadRequestException('Cabinet not found');
      }

      const instancesData = Array.from({ length: qty }).map(() => ({
        productId: product.id,
        cabinetId: finalCabinetId || null,
        condition: sanitizedCondition as any,
        status: 'AVAILABLE' as any,
      }));

      await tx.productInstance.createMany({
        data: instancesData,
      });

      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: { stock: { increment: qty } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          cabinetId: finalCabinetId || null,
          fromCondition: null,
          toCondition: sanitizedCondition as any,
          quantity: qty,
          direction: 'IN',
          referenceType: 'RESTOCK',
          notes: 'Bulk restock',
          userId,
          businessId: currentUser.businessId,
        },
      });

      return updatedProduct;
    });

    return { success: true, product: result };
  }

  async importProducts(userId: string, productsData: any[]) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId) {
      throw new BadRequestException(
        'User does not have an associated business',
      );
    }

    if (!Array.isArray(productsData) || productsData.length === 0) {
      throw new BadRequestException('No products provided for import');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let importedCount = 0;

      // Cache categories
      const categoriesCache = new Map<string, string>();
      const existingCategories = await tx.category.findMany({
        where: { businessId: currentUser.businessId },
      });
      existingCategories.forEach((c) =>
        categoriesCache.set(c.name.toLowerCase(), c.id),
      );

      for (const item of productsData) {
        const name = item.name || item.Name;
        if (!name || !name.trim()) continue;

        // Resolve or create Category
        let categoryId;
        const catName =
          (item.category || item.Category)?.trim() || 'Uncategorized';
        const catKey = catName.toLowerCase();

        if (categoriesCache.has(catKey)) {
          categoryId = categoriesCache.get(catKey);
        } else {
          const newCat = await tx.category.create({
            data: { name: catName, businessId: currentUser.businessId },
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
          item.sku ||
          item.SKU ||
          `SKU-${Math.floor(1000 + Math.random() * 9000)}`;

        const validConditions = [
          'ORIGINAL_PULL',
          'COPY',
          'MINOR_SCRATCHES',
          'WORKING',
          'DEAD_DONOR',
          'DEFECTIVE',
        ];
        const inputCondition = item.condition || item.Condition;
        const sanitizedCondition = validConditions.includes(inputCondition)
          ? inputCondition
          : 'ORIGINAL_PULL';

        const product = await tx.product.create({
          data: {
            name: name.trim(),
            price: parsedPrice,
            categoryId: categoryId,
            stock: instanceQty,
            sku: sku,
            businessId: currentUser.businessId,
          },
        });

        const instancesData = Array.from({ length: instanceQty }).map(
          (_, index) => ({
            productId: product.id,
            cabinetId: null,
            condition: sanitizedCondition as any,
            status: 'AVAILABLE' as any,
            serialNumber: sku ? `${sku}-${index + 1}` : null,
          }),
        );

        await tx.productInstance.createMany({
          data: instancesData,
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
