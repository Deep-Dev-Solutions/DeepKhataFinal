import { beforeEach, describe, expect, it } from 'vitest';
import { Injectable } from '@nestjs/common';
import { InstanceStatus, ItemCondition, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.types';
import { toApi } from '../common/money';

export interface StockLocation {
  instanceId: string;
  condition: ItemCondition;
  serialNumber: string | null;
  cabinetId: string | null;
  cabinetName: string | null;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  notes: string | null;
  photoUrl: string | null;
}

export interface StockBranchAvailability {
  branchId: string;
  branchName: string;
  isOwnBranch: boolean;
  available: number;
  byCondition: Partial<Record<ItemCondition, number>>;
  reserved: number;
  inTransit: number;
  locations?: StockLocation[];
}

export interface StockFinderResult {
  productId: string;
  name: string;
  sku: string;
  partNumber: string | null;
  aliases: string[];
  compatibleWith: string[];
  salePrice: number;
  minSalePrice: number | null;
  costPrice?: number | null;
  recentSoldPrices: number[];
  photos: string[];
  totalAvailable: number;
  branches: StockBranchAvailability[];
}

const MAX_TOKENS = 8;
const MAX_LOCATION_ROWS = 1000;

@Injectable()
export class StockFinderService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    t: TenantContext,
    rawQuery: string,
    limit = 20,
  ): Promise<{ results: StockFinderResult[]; tookMs: number }> {
    const started = performance.now();
    const q = rawQuery.trim().toLowerCase().slice(0, 100);
    if (!q) return { results: [], tookMs: elapsed(started) };

    const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
    const ids = await this.rankedProductIds(t.businessId, q, take);
    if (ids.length === 0) return { results: [], tookMs: elapsed(started) };

    const canSeeCost = t.role === Role.OWNER || t.role === Role.MANAGER;
    const ownBranchId = t.branchId;

    const [products, groups, instances, sold, branches] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: ids }, businessId: t.businessId, deletedAt: null },
        select: {
          id: true,
          name: true,
          sku: true,
          partNumber: true,
          aliases: true,
          compatibleWith: true,
          basePrice: true,
          minSalePrice: true,
          defaultCostPrice: canSeeCost,
        },
      }),
      this.prisma.productInstance.groupBy({
        by: ['productId', 'branchId', 'status', 'condition'],
        where: {
          productId: { in: ids },
          status: {
            in: [
              InstanceStatus.AVAILABLE,
              InstanceStatus.RESERVED,
              InstanceStatus.IN_TRANSIT,
            ],
          },
          branch: { businessId: t.businessId, deletedAt: null },
        },
        _count: { _all: true },
      }),
      // AVAILABLE instances: own-branch ones give exact locations, any with a
      // photo give thumbnails. unitCost is deliberately never selected.
      this.prisma.productInstance.findMany({
        where: {
          productId: { in: ids },
          status: InstanceStatus.AVAILABLE,
          branch: { businessId: t.businessId, deletedAt: null },
          OR: [
            ...(ownBranchId ? [{ branchId: ownBranchId }] : []),
            { photoUrl: { not: null } },
          ],
        },
        select: {
          id: true,
          productId: true,
          branchId: true,
          condition: true,
          serialNumber: true,
          cabinetId: true,
          notes: true,
          photoUrl: true,
          cabinet: { select: { name: true, rack: true, shelf: true, bin: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_LOCATION_ROWS,
      }),
      this.recentSoldPrices(t.businessId, ids),
      this.prisma.branch.findMany({
        where: { businessId: t.businessId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const branchNames = new Map(branches.map((b) => [b.id, b.name]));
    const productById = new Map(products.map((p) => [p.id, p]));

    // productId -> branchId -> accumulator
    const perProduct = new Map<string, Map<string, StockBranchAvailability>>();
    for (const g of groups) {
      const name = branchNames.get(g.branchId);
      if (name === undefined) continue;
      let byBranch = perProduct.get(g.productId);
      if (!byBranch) perProduct.set(g.productId, (byBranch = new Map()));
      let b = byBranch.get(g.branchId);
      if (!b) {
        b = {
          branchId: g.branchId,
          branchName: name,
          isOwnBranch: g.branchId === ownBranchId,
          available: 0,
          byCondition: {},
          reserved: 0,
          inTransit: 0,
        };
        if (b.isOwnBranch) b.locations = [];
        byBranch.set(g.branchId, b);
      }
      const n = g._count._all;
      if (g.status === InstanceStatus.AVAILABLE) {
        b.available += n;
        b.byCondition[g.condition] = (b.byCondition[g.condition] ?? 0) + n;
      } else if (g.status === InstanceStatus.RESERVED) {
        b.reserved += n;
      } else if (g.status === InstanceStatus.IN_TRANSIT) {
        b.inTransit += n;
      }
    }

    const photosByProduct = new Map<string, string[]>();
    for (const i of instances) {
      if (i.photoUrl) {
        const arr = photosByProduct.get(i.productId) ?? [];
        if (arr.length < 3 && !arr.includes(i.photoUrl)) arr.push(i.photoUrl);
        photosByProduct.set(i.productId, arr);
      }
      if (i.branchId === ownBranchId) {
        const own = perProduct.get(i.productId)?.get(i.branchId);
        own?.locations?.push({
          instanceId: i.id,
          condition: i.condition,
          serialNumber: i.serialNumber,
          cabinetId: i.cabinetId,
          cabinetName: i.cabinet?.name ?? null,
          rack: i.cabinet?.rack ?? null,
          shelf: i.cabinet?.shelf ?? null,
          bin: i.cabinet?.bin ?? null,
          notes: i.notes,
          photoUrl: i.photoUrl,
        });
      }
    }

    const results: StockFinderResult[] = [];
    for (const id of ids) {
      const p = productById.get(id);
      if (!p) continue;
      const branchList = [...(perProduct.get(id)?.values() ?? [])].sort(
        (a, b) =>
          Number(b.isOwnBranch) - Number(a.isOwnBranch) ||
          a.branchName.localeCompare(b.branchName),
      );
      const result: StockFinderResult = {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        partNumber: p.partNumber ?? null,
        aliases: p.aliases,
        compatibleWith: p.compatibleWith,
        salePrice: toApi(p.basePrice),
        minSalePrice: p.minSalePrice == null ? null : toApi(p.minSalePrice),
        recentSoldPrices: (sold.get(id) ?? []).map((v) => toApi(v)),
        photos: photosByProduct.get(id) ?? [],
        totalAvailable: branchList.reduce((s, b) => s + b.available, 0),
        branches: branchList,
      };
      if (canSeeCost) {
        const cost = (p as { defaultCostPrice?: Prisma.Decimal | null })
          .defaultCostPrice;
        result.costPrice = cost == null ? null : toApi(cost);
      }
      results.push(result);
    }

    return { results, tookMs: elapsed(started) };
  }

  /**
   * Ordered product ids, resolved in tiers so cheap indexed lookups run first
   * and the fuzzy scan only runs when they find nothing.
   * Tier 0: exact sku/partNumber/alias/serial (btree + trigram-prefiltered).
   * Tier 1: every token present in searchText (trigram GIN via ILIKE).
   * Tier 2: fuzzy trigram match (`<%` / `%`, GIN), only when tiers 0 and 1
   * found nothing. Within a tier: best similarity, then name, then id.
   */
  private async rankedProductIds(
    businessId: string,
    q: string,
    take: number,
  ): Promise<string[]> {
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);
    const likeOf = (tok: string) => `%${tok.replace(/[\\%_]/g, '\\$&')}%`;
    const qLike = likeOf(q);
    const allTokens = Prisma.join(
      tokens.map((tok) => Prisma.sql`p."searchText" ILIKE ${likeOf(tok)}`),
      ' AND ',
    );
    const order = Prisma.sql`ORDER BY greatest(word_similarity(${q}, p."searchText"), similarity(p."searchText", ${q})) DESC, p."name" ASC, p."id" ASC`;

    return this.prisma.$transaction(async (tx) => {
      // JIT costs ~30 ms on a query that runs in a few ms. The thresholds
      // match the former full-scan filter (word_similarity > 0.3).
      await tx.$queryRaw`SELECT
        set_config('jit', 'off', true),
        set_config('pg_trgm.word_similarity_threshold', '0.3', true)`;

      const found: string[] = [];
      const exclude = () =>
        found.length
          ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(found)})`
          : Prisma.empty;

      // Tier 0: exact. Alias/sku/partNumber equality implies q is a substring
      // of searchText, so the GIN trigram index prefilters the alias check.
      const t0 = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id" FROM "Product" p
        WHERE p."businessId" = ${businessId}
          AND p."deletedAt" IS NULL
          AND (
            lower(p."sku") = ${q}
            OR lower(p."partNumber") = ${q}
            OR (
              p."searchText" ILIKE ${qLike}
              AND EXISTS (SELECT 1 FROM unnest(p."aliases") a WHERE lower(a) = ${q})
            )
            OR p."id" IN (
              SELECT i."productId" FROM "ProductInstance" i
              WHERE lower(i."serialNumber") = ${q}
            )
          )
        ${order}
        LIMIT ${take}
      `);
      found.push(...t0.map((r) => r.id));
      if (found.length >= take) return found;

      const t1 = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id" FROM "Product" p
        WHERE p."businessId" = ${businessId}
          AND p."deletedAt" IS NULL
          AND ${allTokens}
          ${exclude()}
        ${order}
        LIMIT ${take - found.length}
      `);
      found.push(...t1.map((r) => r.id));
      // Fuzzy is only a fallback for queries that matched nothing exactly or by
      // token: filling the list with loosely similar neighbours is both noise
      // for the user and the single most expensive step (it scores every row).
      if (found.length > 0) return found;

      const t2 = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id" FROM "Product" p
        WHERE p."businessId" = ${businessId}
          AND p."deletedAt" IS NULL
          AND ${q} <% p."searchText"
        ORDER BY word_similarity(${q}, p."searchText") DESC, p."name" ASC, p."id" ASC
        LIMIT ${take}
      `);
      return t2.map((r) => r.id);
    });
  }

  private async recentSoldPrices(
    businessId: string,
    ids: string[],
  ): Promise<Map<string, Prisma.Decimal[]>> {
    const rows = await this.prisma.$queryRaw<
      { productId: string; price: Prisma.Decimal }[]
    >(Prisma.sql`
      SELECT x."productId", x."price" FROM (
        SELECT oi."productId" AS "productId", oi."price" AS "price", o."createdAt" AS "createdAt",
          row_number() OVER (PARTITION BY oi."productId" ORDER BY o."createdAt" DESC, oi."id" DESC) AS rn
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."businessId" = ${businessId}
          AND o."status" IN ('FINAL', 'COMPLETED')
          AND oi."productId" IN (${Prisma.join(ids)})
      ) x
      WHERE x.rn <= 5
      ORDER BY x."productId", x."createdAt" DESC
    `);
    const out = new Map<string, Prisma.Decimal[]>();
    for (const r of rows) {
      const arr = out.get(r.productId) ?? [];
      arr.push(r.price);
      out.set(r.productId, arr);
    }
    return out;
  }
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}
