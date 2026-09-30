import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private async invalidateProducts(businessId: string): Promise<void> {
    await this.redis.deleteByPattern(`products:${businessId}:*`);
  }

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

  // Resolve the branch a physical unit should live in: explicit branchId,
  // otherwise the business default (main) branch.
  private async resolveBranchId(
    tx: any,
    businessId: string,
    branchId?: string,
  ): Promise<string> {
    if (branchId) {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, businessId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch not found');
      return branch.id;
    }
    const branch = await tx.branch.findFirst({
      where: { businessId, deletedAt: null },
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
      defaultCostPrice,
      // Spatial Inventory Fields
      branchId,
      cabinetId,
      rack,
      shelf,
      bin,
      quantity = 1,
      vendorId,
    } = data;

    const businessId = await this.requireBusinessId(userId);

    if (!name || !name.trim())
      throw new BadRequestException('Product name is required');

    const categoryExists = await this.prisma.category.findFirst({
      where: {
        name: category,
        businessId,
        OR: [{ branchId }, { branchId: null }],
      },
      select: { id: true },
    });
    if (!categoryExists)
      throw new BadRequestException('Category does not exist');

    const parsedPrice = Number(price) || 0;
    if (parsedPrice <= 0) {
      throw new BadRequestException('Product price must be greater than 0');
    }
    const instanceQty = Math.max(1, Number(quantity) || 1);

    const result = await this.prisma.$transaction(async (tx) => {
      const branch = await this.resolveBranchId(tx, businessId, branchId);
      const targetCabinetId = await this.resolveCabinetId(
        tx,
        businessId,
        branch,
        { cabinetId, rack, shelf, bin },
      );

      // Master catalog entry. No branch / physical stock lives here.
      const product = await tx.product.create({
        data: {
          name: name.trim(),
          basePrice: parsedPrice,
          defaultCostPrice: defaultCostPrice ? Number(defaultCostPrice) : null,
          categoryId: categoryExists.id,
          branchId: branch,
          sku: sku?.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
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
          unitCost: defaultCostPrice ? Number(defaultCostPrice) : null,
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

      if (vendorId && defaultCostPrice) {
        const totalCost = Number(defaultCostPrice) * instanceQty;
        if (totalCost > 0) {
          await tx.transaction.create({
            data: {
              businessId,
              type: 'VENDOR_PURCHASE',
              description: `Initial stock of ${instanceQty}x ${name.trim()}`,
              postings: {
                create: [
                  {
                    accountId: 'INVENTORY_ACCOUNT',
                    accountType: 'INVENTORY',
                    amount: totalCost,
                  },
                  {
                    accountId: vendorId,
                    accountType: 'VENDOR_PAYABLE',
                    amount: -totalCost,
                  },
                ],
              },
            },
          });
        }
      }

      return product.id;
    }, {
      maxWait: 10000,
      timeout: 15000,
    });

    const fullProduct = await this.prisma.product.findUnique({
      where: { id: result },
      include: {
        category: true,
        instances: { include: { cabinet: true } },
      },
    });

    await this.invalidateProducts(businessId);

    return {
      message: 'Product & Spatial Instances Created Successfully',
      product: fullProduct,
    };
  }

  async getProducts(userId: string, query: any) {
    const { search, category, stock, branchId } = query;
    const businessId = await this.requireBusinessId(userId);

    if (!branchId) {
      throw new BadRequestException('x-branch-id header is required');
    }

    // Dynamic cache key strictly scoped to business and branch
    const cacheKey = `products:${businessId}:branch:${branchId}:search=${encodeURIComponent(search || '')}:category=${encodeURIComponent(category || 'All')}:stock=${encodeURIComponent(stock || 'all')}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (
      cached &&
      (!cached.products ||
        cached.products.length === 0 ||
        cached.products[0].cabinet !== undefined)
    ) {
      return cached;
    }

    // Strictly filter products by the requested branchId
    const queryConditions: any = {
      businessId,
      deletedAt: null,
      branchId,
    };

    if (search) {
      queryConditions.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ],
        },
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
            branchId,
          },
          include: {
            cabinet: true,
            branch: { select: { id: true, name: true, deletedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { id: 'desc' },
    });

    // Master catalog records that hold physical units anywhere (for branch
    // filtering we still want to surface globally out-of-stock products).
    const businessWideAvailable = new Set<string>();
    const branchStockMap = new Map<
      string,
      { total: number; branchNames: string[] }
    >();

    if (branchId) {
      const allAvailable = await this.prisma.productInstance.findMany({
        where: {
          product: { businessId, deletedAt: null },
          status: 'AVAILABLE',
        },
        select: {
          productId: true,
          branch: { select: { id: true, name: true } },
        },
      });

      for (const inst of allAvailable) {
        businessWideAvailable.add(inst.productId);
        const entry = branchStockMap.get(inst.productId) || {
          total: 0,
          branchNames: [],
        };
        entry.total += 1;
        if (
          inst.branch?.name &&
          !entry.branchNames.includes(inst.branch.name)
        ) {
          entry.branchNames.push(inst.branch.name);
        }
        branchStockMap.set(inst.productId, entry);
      }
    }

    let currentBranchName = '';
    if (branchId) {
      const b = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { name: true },
      });
      if (b) currentBranchName = b.name;
    }

    const result = {
      success: true,
      products: products
        .map((p) => {
          const branchEntry = branchStockMap.get(p.id);
          const otherBranches = branchEntry
            ? branchEntry.branchNames.filter(
                (name) => name !== currentBranchName,
              )
            : [];
          const primaryCabinet = p.instances?.[0]?.cabinet || null;
          return {
            ...p,
            cabinet: primaryCabinet
              ? {
                  id: primaryCabinet.id,
                  name: primaryCabinet.name,
                  location: primaryCabinet.location,
                  rack: primaryCabinet.rack,
                  shelf: primaryCabinet.shelf,
                  bin: primaryCabinet.bin,
                }
              : null,
            price: p.basePrice ?? 0,
            stock: p.instances.length,
            totalBusinessStock: branchEntry?.total ?? p.instances.length,
            otherBranchesWithStock: otherBranches,
            hasDeletedBranchStock: p.instances.some((i) => i.branch?.deletedAt),
          };
        })
        .filter((p) => {
          if (stock === 'out') return p.stock === 0;
          if (stock === 'low') return p.stock > 0 && p.stock <= 5;
          return true;
        }),
    };

      await this.redis.set(cacheKey, result, 3600);
      return result;
  }

    async getGlobalStock(userId: string, search: string) {
      const businessId = await this.requireBusinessId(userId);
      const normalizedSearch = search?.trim();

      if (!normalizedSearch) {
        return [];
      }

      const [products, branches] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            businessId,
            deletedAt: null,
            name: { contains: normalizedSearch, mode: 'insensitive' },
          },
          select: {
            id: true,
            name: true,
            basePrice: true,
            instances: {
              where: { status: 'AVAILABLE' },
              select: { branchId: true },
            },
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.branch.findMany({
          where: { businessId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      return products.flatMap((product) => {
        const stockByBranch = new Map<string, number>();
        for (const instance of product.instances) {
          stockByBranch.set(
            instance.branchId,
            (stockByBranch.get(instance.branchId) || 0) + 1,
          );
        }

        return branches.map((branch) => ({
          branchName: branch.name,
          productName: product.name,
          stock: stockByBranch.get(branch.id) || 0,
          price: product.basePrice,
        }));
      });
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
      data: { basePrice: Number(price) },
    });

    await this.invalidateProducts(businessId);

    return {
      success: true,
      message: 'Product price updated successfully',
      product,
    };
  }

  async getBranches(userId: string) {
    const businessId = await this.requireBusinessId(userId);

    const branches = await this.prisma.branch.findMany({
      where: { businessId, deletedAt: null },
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
    const {
      productId,
      branchId,
      cabinetId,
      quantity,
      vendorId,
      unitCost,
    } = data;
    const businessId = await this.requireBusinessId(userId);

    const qty = Math.max(1, Number(quantity) || 1);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const branch = await this.resolveBranchId(
      this.prisma as any,
      businessId,
      branchId,
    );
    const targetCabinetId = await this.resolveCabinetId(
      this.prisma as any,
      businessId,
      branch,
      { cabinetId },
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const instancesData = Array.from({ length: qty }).map(() => ({
        productId,
        cabinetId: targetCabinetId,
        branchId: branch,
        vendorId: vendorId || null,
        unitCost:
          unitCost !== undefined && unitCost !== null
            ? Number(unitCost)
            : (product.defaultCostPrice ?? null),
        status: 'AVAILABLE' as any,
      }));

      await tx.productInstance.createMany({
        data: instancesData,
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          cabinetId: targetCabinetId,
          quantity: qty,
          direction: 'IN',
          referenceType: 'RESTOCK',
          notes: 'Bulk restock',
          userId,
          businessId,
          vendorId: vendorId || null,
        },
      });

      if (vendorId) {
        const actualCost =
          unitCost !== undefined && unitCost !== null
            ? Number(unitCost)
            : (product.defaultCostPrice ?? 0);

        const totalCost = actualCost * qty;
        if (totalCost > 0) {
          await tx.transaction.create({
            data: {
              businessId,
              type: 'VENDOR_PURCHASE',
              description: `Bulk restock of ${qty}x ${product.name}`,
              postings: {
                create: [
                  {
                    accountId: 'INVENTORY_ACCOUNT',
                    accountType: 'INVENTORY',
                    amount: totalCost,
                  },
                  {
                    accountId: vendorId,
                    accountType: 'VENDOR_PAYABLE',
                    amount: -totalCost,
                  },
                ],
              },
            },
          });
        }
      }

      const fullProduct = await tx.product.findUnique({
        where: { id: product.id },
        include: { category: true },
      });
      return fullProduct;
    });

    await Promise.all([
      this.invalidateProducts(businessId),
      this.redis.deleteByPattern(`restock:${businessId}:*`),
      this.redis.deleteByPattern(`cabinets:${businessId}:*`),
      this.redis.deleteByPattern(`dashboard:${businessId}*`),
    ]);

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

        let categoryId: string | null = null;
        const catName = (item.category || item.Category)?.trim();
        if (catName) {
          const catKey = catName.toLowerCase();

          if (categoriesCache.has(catKey)) {
            categoryId = categoriesCache.get(catKey)!;
          } else {
            const newCat = await tx.category.create({
              data: { name: catName, businessId },
            });
            categoryId = newCat.id;
            categoriesCache.set(catKey, newCat.id);
          }
        }

        const sku =
          item.sku ||
          item.SKU ||
          `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
        const parsedPrice = Math.max(
          0,
          Number(item.basePrice || item.price || 0),
        );
        const instanceQty = Math.max(
          0,
          Number(item.stock || item.quantity || 0),
        );

        const newProd = await tx.product.create({
          data: {
            name: name.trim(),
            basePrice: parsedPrice,
            defaultCostPrice: item.defaultCostPrice
              ? Number(item.defaultCostPrice)
              : null,
            categoryId,
            sku,
            businessId,
          },
        });

        if (instanceQty > 0) {
          const instancesData = Array.from({ length: instanceQty }).map(
            (_, index) => ({
              productId: newProd.id,
              cabinetId: generalCabinet,
              branchId: branch,
              vendorId: item.vendorId || null,
              unitCost: item.defaultCostPrice
                ? Number(item.defaultCostPrice)
                : null,
              status: 'AVAILABLE' as any,
              serialNumber: `${sku}-${index + 1}`,
            }),
          );

          await tx.productInstance.createMany({
            data: instancesData,
          });

          await tx.inventoryMovement.create({
            data: {
              productId: newProd.id,
              cabinetId: generalCabinet,
              quantity: instanceQty,
              direction: 'IN',
              referenceType: 'INITIAL_STOCK',
              referenceId: newProd.id,
              notes: 'Imported product initial stock',
              userId,
              businessId,
            },
          });
        }

        importedCount++;
      }

      return { importedCount };
    });

    await this.invalidateProducts(businessId);

    return {
      success: true,
      message: `Successfully imported ${result.importedCount} products`,
      importedCount: result.importedCount,
    };
  }

  // Soft-delete: the master product is hidden from the catalog but its
  // instances and movement history are preserved.
  async deleteProduct(userId: string, productId: string) {
    const businessId = await this.requireBusinessId(userId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date() },
    });

    await this.invalidateProducts(businessId);

    return {
      success: true,
      message:
        'Product deleted. Its stock instances are preserved across branches.',
      productId,
    };
  }

  async getProductDetails(userId: string, productId: string) {
    const businessId = await this.requireBusinessId(userId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null },
      include: {
        category: true,
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    const totalStock = await this.prisma.productInstance.count({
      where: { productId, status: 'AVAILABLE' },
    });

    // Group available instances by branch and cabinet
    const instancesRaw = await this.prisma.productInstance.findMany({
      where: { productId, status: 'AVAILABLE' },
      include: {
        branch: { select: { id: true, name: true } },
        cabinet: { select: { id: true, name: true } },
      },
    });

    // Audit Trail
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { businessName: true } },
        cabinet: { select: { name: true } },
      },
      take: 100,
    });

    // Sales History from orders (matching either by direct productId or by service item name)
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        OR: [
          { productId },
          {
            AND: [
              { productId: null },
              { serviceName: { equals: product.name, mode: 'insensitive' } },
            ],
          },
        ],
        order: {
          businessId,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
            walkInName: true,
            walkInPhone: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
            creator: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        order: {
          createdAt: 'desc',
        },
      },
      take: 200,
    });

    const activeOrderItems = orderItems.filter(
      (item) => item.order.status !== 'CANCELLED',
    );
    const totalSold = activeOrderItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const totalRevenue = activeOrderItems.reduce(
      (sum, item) => sum + item.quantity * (item.price ?? 0),
      0,
    );

    const sales = orderItems.map((item) => ({
      id: item.id,
      orderId: item.order.id,
      orderNumber: item.order.orderNumber,
      createdAt: item.order.createdAt,
      quantity: item.quantity,
      price: item.price ?? 0,
      total: item.quantity * (item.price ?? 0),
      status: item.order.status,
      paymentStatus: item.order.paymentStatus,
      customerName:
        item.order.customer?.name ||
        item.order.walkInName ||
        'Walk-in Customer',
      customerPhone:
        item.order.customer?.phone || item.order.walkInPhone || null,
      branchName: item.order.branch?.name || 'Main Branch',
      creatorName: item.order.creator?.name || null,
    }));

    return {
      success: true,
      product: {
        ...product,
        price: product.basePrice ?? 0,
        stock: totalStock,
        totalSold,
        totalRevenue,
      },
      instances: instancesRaw,
      movements,
      sales,
    };
  }

  // Move physical stock that belongs to soft-deleted branches into a live
  // branch, re-attaching it to a cabinet in that branch.
  async moveStockFromDeletedBranches(
    userId: string,
    productId: string,
    targetBranchId?: string,
  ) {
    const businessId = await this.requireBusinessId(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, businessId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');

      const targetBranch = targetBranchId
        ? await tx.branch.findFirst({
            where: { id: targetBranchId, businessId, deletedAt: null },
            select: { id: true },
          })
        : await tx.branch.findFirst({
            where: { businessId, deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
      if (!targetBranch)
        throw new BadRequestException('No active branch to move stock into');

      const targetCabinetId = await this.resolveCabinetId(
        tx,
        businessId,
        targetBranch.id,
        {},
      );

      const moved = await tx.productInstance.updateMany({
        where: {
          productId,
          branch: { deletedAt: { not: null } },
        },
        data: { branchId: targetBranch.id, cabinetId: targetCabinetId },
      });

      return { movedCount: moved.count, productId };
    });

    return {
      success: true,
      message: `Moved ${result.movedCount} instance(s) of this product to the active branch.`,
      movedCount: result.movedCount,
      productId,
    };
  }
}
