import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LedgerService } from '../ledger/ledger.service';
import * as M from '../common/money';

const COST_KEYS = new Set(['defaultCostPrice', 'unitCost']);

/**
 * Removes cost fields (defaultCostPrice, unitCost) at any depth for STAFF.
 * Other roles get the payload back untouched. Only plain objects and arrays
 * are traversed, so Decimal/Date values pass through as-is.
 */
export function stripCostForStaff<T>(role: string | undefined, payload: T): T {
  if (role !== 'STAFF') return payload;
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return v;
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (COST_KEYS.has(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(payload) as T;
}

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

// Trim, drop empties, dedupe case-insensitively (first spelling wins).
// Accepts an array or a string split on ';' or '|'.
function cleanList(v: unknown): string[] {
  const raw = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v.split(/[;|]/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const t = cleanString(entry);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private readonly ledgerService: LedgerService,
  ) {}

  // getProducts is no longer cached; this stays as a no-op-safe hook for
  // callers that still invalidate after writes.
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
      partNumber,
      aliases,
      compatibleWith,
      minSalePrice,
      lowStockThreshold,
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

    const parsedMin =
      minSalePrice !== undefined && minSalePrice !== null && minSalePrice !== ''
        ? M.round2(minSalePrice)
        : null;
    if (parsedMin !== null && M.gt(parsedMin, parsedPrice)) {
      throw new BadRequestException(
        'Minimum price cannot be above the sale price',
      );
    }
    const parsedThreshold =
      lowStockThreshold !== undefined && lowStockThreshold !== null
        ? Math.max(0, Math.trunc(Number(lowStockThreshold) || 0))
        : null;

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
          defaultCostPrice: defaultCostPrice ? M.round2(defaultCostPrice) : null,
          categoryId: categoryExists.id,
          branchId: branch,
          sku: sku?.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
          businessId,
          partNumber: cleanString(partNumber),
          aliases: cleanList(aliases),
          compatibleWith: cleanList(compatibleWith),
          minSalePrice: parsedMin,
          lowStockThreshold: parsedThreshold,
        },
      });

      // Discrete physical units placed in a spatial cabinet under a branch.
      const instancesData = Array.from({ length: instanceQty }).map(
        (_, index) => ({
          productId: product.id,
          cabinetId: targetCabinetId,
          branchId: branch,
          vendorId: vendorId || null,
          unitCost: defaultCostPrice ? M.round2(defaultCostPrice) : null,
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
        const totalCost = M.mul(defaultCostPrice, instanceQty);
        if (M.gt(totalCost, 0)) {
          await this.ledgerService.createBalancedTransaction(
            {
              businessId,
              type: 'VENDOR_PURCHASE',
              description: `Initial stock of ${instanceQty}x ${name.trim()}`,
              postings: [
                {
                  accountId: 'INVENTORY_ACCOUNT',
                  accountType: 'INVENTORY',
                  amount: totalCost,
                },
                {
                  accountId: vendorId,
                  accountType: 'VENDOR_PAYABLE',
                  amount: M.neg(totalCost),
                },
              ],
            },
            tx,
          );
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

  // Ordered, parameterised page of product ids for a business/branch.
  // Keyset by position: the cursor is the id of the last row of the previous
  // page, resolved to its row number inside the same ordered set.
  private async findProductIdPage(args: {
    businessId: string;
    branchId: string;
    search: string;
    category?: string;
    stock?: string;
    cursor?: string;
    take: number;
  }): Promise<string[]> {
    const { businessId, branchId, search, category, stock, cursor, take } =
      args;
    const q = search.trim().toLowerCase();
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    const searchFilter = q
      ? Prisma.sql`AND (p."searchText" ILIKE ${like} OR word_similarity(${q}, p."searchText") > 0.3 OR similarity(p."searchText", ${q}) > 0.2 OR lower(p."sku") = ${q} OR lower(p."partNumber") = ${q})`
      : Prisma.empty;
    const categoryFilter =
      category && category !== 'All'
        ? Prisma.sql`AND c."name" = ${category}`
        : Prisma.empty;
    const availableCount = Prisma.sql`(SELECT COUNT(*) FROM "ProductInstance" i WHERE i."productId" = p."id" AND i."status" = 'AVAILABLE' AND i."branchId" = ${branchId})`;
    const stockFilter =
      stock === 'out'
        ? Prisma.sql`AND ${availableCount} = 0`
        : stock === 'low'
          ? Prisma.sql`AND ${availableCount} BETWEEN 1 AND 5`
          : Prisma.empty;
    const orderBy = q
      ? Prisma.sql`COALESCE(lower(p."sku") = ${q} OR lower(p."partNumber") = ${q}, false) DESC, GREATEST(word_similarity(${q}, p."searchText"), similarity(p."searchText", ${q})) DESC, p."name" ASC, p."id" ASC`
      : Prisma.sql`p."name" ASC, p."id" ASC`;
    const cursorFilter = cursor
      ? Prisma.sql`WHERE rn > COALESCE((SELECT rn FROM ranked WHERE id = ${cursor}), 0)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH ranked AS (
        SELECT p."id" AS id, ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS rn
        FROM "Product" p
        LEFT JOIN "Category" c ON c."id" = p."categoryId"
        WHERE p."businessId" = ${businessId}
          AND p."deletedAt" IS NULL
          AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)
          ${searchFilter}
          ${categoryFilter}
          ${stockFilter}
      )
      SELECT id FROM ranked ${cursorFilter} ORDER BY rn LIMIT ${take}
    `);
    return rows.map((r) => r.id);
  }

  async getProducts(userId: string, query: any) {
    const { category, stock, branchId } = query;
    const search = typeof query.search === 'string' ? query.search : '';
    const businessId = await this.requireBusinessId(userId);

    if (!branchId) {
      throw new BadRequestException('x-branch-id header is required');
    }

    const parsedLimit = parseInt(String(query.limit ?? ''), 10);
    const limit = Math.min(
      Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 200, 1),
      500,
    );
    const cursor =
      typeof query.cursor === 'string' && query.cursor.trim()
        ? query.cursor.trim()
        : undefined;

    const fetched = await this.findProductIdPage({
      businessId,
      branchId,
      search,
      category,
      stock,
      cursor,
      take: limit + 1,
    });
    const hasMore = fetched.length > limit;
    const pageIds = hasMore ? fetched.slice(0, limit) : fetched;
    const nextCursor = hasMore ? pageIds[pageIds.length - 1] : null;

    if (pageIds.length === 0) {
      return { success: true, products: [] as any[], nextCursor: null };
    }

    const [rows, grouped, branches] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: pageIds }, businessId },
        include: {
          category: true,
          instances: {
            where: { status: 'AVAILABLE', branchId },
            include: {
              cabinet: true,
              branch: { select: { id: true, name: true, deletedAt: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      // One grouped query for the whole page: per-product, per-branch counts.
      this.prisma.productInstance.groupBy({
        by: ['productId', 'branchId', 'status'],
        where: { productId: { in: pageIds }, status: 'AVAILABLE' },
        _count: true,
      }),
      this.prisma.branch.findMany({
        where: { businessId },
        select: { id: true, name: true },
      }),
    ]);

    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
    const currentBranchName = branchNameById.get(branchId) ?? '';

    const branchStockMap = new Map<
      string,
      { total: number; branchNames: string[] }
    >();
    for (const g of grouped) {
      const entry = branchStockMap.get(g.productId) || {
        total: 0,
        branchNames: [],
      };
      entry.total += g._count;
      const name = branchNameById.get(g.branchId);
      if (name && !entry.branchNames.includes(name)) entry.branchNames.push(name);
      branchStockMap.set(g.productId, entry);
    }

    const byId = new Map(rows.map((p) => [p.id, p]));
    const products = pageIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => {
        const branchEntry = branchStockMap.get(p.id);
        const otherBranches = branchEntry
          ? branchEntry.branchNames.filter((name) => name !== currentBranchName)
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
      });

    return { success: true, products, nextCursor };
  }

  async getGlobalStock(userId: string, search: string) {
    const businessId = await this.requireBusinessId(userId);
    const normalizedSearch = search?.trim().toLowerCase();

    if (!normalizedSearch) {
      return [];
    }

    const like = `%${normalizedSearch.replace(/[\\%_]/g, '\\$&')}%`;
    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id" AS id
      FROM "Product" p
      WHERE p."businessId" = ${businessId}
        AND p."deletedAt" IS NULL
        AND (p."searchText" ILIKE ${like}
             OR word_similarity(${normalizedSearch}, p."searchText") > 0.3
             OR similarity(p."searchText", ${normalizedSearch}) > 0.2
             OR lower(p."sku") = ${normalizedSearch}
             OR lower(p."partNumber") = ${normalizedSearch})
      ORDER BY COALESCE(lower(p."sku") = ${normalizedSearch}
                OR lower(p."partNumber") = ${normalizedSearch}, false) DESC,
               GREATEST(word_similarity(${normalizedSearch}, p."searchText"),
                        similarity(p."searchText", ${normalizedSearch})) DESC,
               p."name" ASC, p."id" ASC
      LIMIT 100
    `);
    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) return [];

    const [rows, grouped, branches] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: ids }, businessId, deletedAt: null },
        select: { id: true, name: true, basePrice: true },
      }),
      this.prisma.productInstance.groupBy({
        by: ['productId', 'branchId'],
        where: { productId: { in: ids }, status: 'AVAILABLE' },
        _count: true,
      }),
      this.prisma.branch.findMany({
        where: { businessId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const stockByProduct = new Map<string, Map<string, number>>();
    for (const g of grouped) {
      const m = stockByProduct.get(g.productId) || new Map<string, number>();
      m.set(g.branchId, g._count);
      stockByProduct.set(g.productId, m);
    }
    const byId = new Map(rows.map((p) => [p.id, p]));

    return ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .flatMap((product) =>
        branches.map((branch) => ({
          branchName: branch.name,
          productName: product.name,
          stock: stockByProduct.get(product.id)?.get(branch.id) || 0,
          price: product.basePrice,
        })),
      );
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
      data: { basePrice: M.round2(price) },
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
            ? M.round2(unitCost)
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
            ? M.round2(unitCost)
            : M.money(product.defaultCostPrice);

        const totalCost = M.mul(actualCost, qty);
        if (M.gt(totalCost, 0)) {
          await this.ledgerService.createBalancedTransaction(
            {
              businessId,
              type: 'VENDOR_PURCHASE',
              description: `Bulk restock of ${qty}x ${product.name}`,
              postings: [
                {
                  accountId: 'INVENTORY_ACCOUNT',
                  accountType: 'INVENTORY',
                  amount: totalCost,
                },
                {
                  accountId: vendorId,
                  accountType: 'VENDOR_PAYABLE',
                  amount: M.neg(totalCost),
                },
              ],
            },
            tx,
          );
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

  async updateProduct(businessId: string, productId: string, dto: any) {
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Product not found');

    const data: Prisma.ProductUncheckedUpdateInput = {};

    if (dto.name !== undefined && dto.name !== null) {
      const name = cleanString(dto.name);
      if (!name) throw new BadRequestException('Product name cannot be empty');
      data.name = name;
    }
    if (dto.sku !== undefined && dto.sku !== null) {
      const sku = cleanString(dto.sku);
      if (!sku) throw new BadRequestException('SKU cannot be empty');
      data.sku = sku;
    }
    if (dto.basePrice !== undefined && dto.basePrice !== null) {
      data.basePrice = M.round2(dto.basePrice);
    }
    if (dto.defaultCostPrice !== undefined) {
      data.defaultCostPrice =
        dto.defaultCostPrice === null ? null : M.round2(dto.defaultCostPrice);
    }
    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, businessId },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('Category does not exist');
      data.categoryId = category.id;
    }
    if (dto.partNumber !== undefined) {
      data.partNumber = cleanString(dto.partNumber);
    }
    if (dto.aliases !== undefined && dto.aliases !== null) {
      data.aliases = cleanList(dto.aliases);
    }
    if (dto.compatibleWith !== undefined && dto.compatibleWith !== null) {
      data.compatibleWith = cleanList(dto.compatibleWith);
    }
    if (dto.minSalePrice !== undefined) {
      data.minSalePrice =
        dto.minSalePrice === null ? null : M.round2(dto.minSalePrice);
    }
    if (dto.lowStockThreshold !== undefined) {
      data.lowStockThreshold =
        dto.lowStockThreshold === null
          ? null
          : Math.max(0, Math.trunc(Number(dto.lowStockThreshold)));
    }

    const effectivePrice =
      data.basePrice !== undefined ? data.basePrice : existing.basePrice;
    const effectiveMin =
      data.minSalePrice !== undefined ? data.minSalePrice : existing.minSalePrice;
    if (
      effectiveMin !== null &&
      effectiveMin !== undefined &&
      M.gt(effectiveMin as any, effectivePrice as any)
    ) {
      throw new BadRequestException(
        'Minimum price cannot be above the sale price',
      );
    }

    const product = await this.prisma.product.update({
      where: { id: productId },
      data,
    });

    await Promise.all([
      this.invalidateProducts(businessId),
      this.redis.deleteByPattern(`dashboard:${businessId}*`),
    ]);

    return product;
  }

  private async requireInstance(businessId: string, instanceId: string) {
    const instance = await this.prisma.productInstance.findFirst({
      where: { id: instanceId, product: { businessId } },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Instance not found');
    return instance;
  }

  async updateInstance(
    businessId: string,
    instanceId: string,
    dto: { notes?: string; condition?: any },
  ) {
    await this.requireInstance(businessId, instanceId);
    const data: Prisma.ProductInstanceUpdateInput = {};
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.condition !== undefined) data.condition = dto.condition;
    return this.prisma.productInstance.update({
      where: { id: instanceId },
      data,
    });
  }

  async setInstancePhoto(
    businessId: string,
    instanceId: string,
    photoUrl: string,
  ) {
    await this.requireInstance(businessId, instanceId);
    await this.prisma.productInstance.update({
      where: { id: instanceId },
      data: { photoUrl },
    });
    return { photoUrl };
  }

  async importProducts(userId: string, productsData: any[]) {
    const businessId = await this.requireBusinessId(userId);

    if (!Array.isArray(productsData) || productsData.length === 0) {
      throw new BadRequestException('No products provided for import');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let importedCount = 0;
      const errors: { row: number; error: string }[] = [];

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

      for (const [index, item] of productsData.entries()) {
        const row = index + 1;
        const name = item.name || item.Name;
        if (!name || !String(name).trim()) {
          errors.push({ row, error: 'Name is required' });
          continue;
        }

        // A bad number fails the whole import (one transaction), naming the row.
        const numericFields: [string, unknown][] = [
          ['price', item.basePrice ?? item.price],
          ['stock', item.stock ?? item.quantity],
          ['cost price', item.defaultCostPrice],
        ];
        for (const [label, raw] of numericFields) {
          if (
            raw !== undefined &&
            raw !== null &&
            raw !== '' &&
            !Number.isFinite(Number(raw))
          ) {
            throw new BadRequestException(
              `Row ${row}: ${label} must be a number`,
            );
          }
        }

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

        const rawMin = item.minSalePrice ?? item.min_price;
        const minPrice =
          rawMin !== undefined && rawMin !== null && rawMin !== ''
            ? Math.max(0, Number(rawMin) || 0)
            : null;
        const rawLow = item.lowStockThreshold ?? item.low_stock;
        const lowStock =
          rawLow !== undefined && rawLow !== null && rawLow !== ''
            ? Math.max(0, Math.trunc(Number(rawLow) || 0))
            : null;

        const newProd = await tx.product.create({
          data: {
            name: name.trim(),
            basePrice: parsedPrice,
            defaultCostPrice: item.defaultCostPrice
              ? M.round2(item.defaultCostPrice)
              : null,
            categoryId,
            sku,
            businessId,
            partNumber: cleanString(
              item.partNumber ?? item.PartNumber ?? item.part_number,
            ),
            aliases: cleanList(item.aliases ?? item.Aliases),
            compatibleWith: cleanList(
              item.compatibleWith ?? item.compatible ?? item.Compatible,
            ),
            minSalePrice:
              minPrice !== null && minPrice <= parsedPrice
                ? M.round2(minPrice)
                : null,
            lowStockThreshold: lowStock,
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
                ? M.round2(item.defaultCostPrice)
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

      return { importedCount, errors };
    });

    await this.invalidateProducts(businessId);

    return {
      success: true,
      message: `Successfully imported ${result.importedCount} products`,
      importedCount: result.importedCount,
      errors: result.errors,
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
    const totalRevenue = M.sum(
      activeOrderItems.map((item) => M.mul(item.price, item.quantity)),
    );

    const sales = orderItems.map((item) => ({
      id: item.id,
      orderId: item.order.id,
      orderNumber: item.order.orderNumber,
      createdAt: item.order.createdAt,
      quantity: item.quantity,
      price: M.money(item.price),
      total: M.mul(item.price, item.quantity),
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
