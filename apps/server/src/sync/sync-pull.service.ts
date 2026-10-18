import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InstanceStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.types';
import { SyncPullEntity, SyncPullQueryDto } from './dto/sync-pull.dto';

const MAX_LIMIT = 1000;
const ZERO_CURSOR = { u: new Date(0).toISOString(), i: '' };

interface Cursor {
  u: string;
  i: string;
}

export interface SyncPullResult {
  entity: SyncPullEntity;
  rows: object[];
  deleted: string[];
  cursor: string;
  hasMore: boolean;
  serverTime: string;
}

interface Access {
  /** Branch ids the user may use (soft-deleted branches excluded unless asked). */
  ids: string[];
  active: string | null;
}

interface Row {
  id: string;
  updatedAt: Date;
  deletedAt?: Date | null;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed?.u !== 'string' ||
      typeof parsed?.i !== 'string' ||
      Number.isNaN(new Date(parsed.u).getTime())
    ) {
      throw new Error('shape');
    }
    return { u: parsed.u, i: parsed.i };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

@Injectable()
export class SyncPullService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(t: TenantContext, q: SyncPullQueryDto): Promise<SyncPullResult> {
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? MAX_LIMIT), 1), MAX_LIMIT);
    // stockSummary is always a full snapshot, so its cursor is ignored (not even parsed).
    const cursor =
      q.cursor && q.entity !== 'stockSummary' ? decodeCursor(q.cursor) : null;
    const access = await this.resolveAccess(t, q.entity === 'branches');
    const isStaff = t.role === Role.STAFF;

    switch (q.entity) {
      case 'products':
        return this.page(q.entity, cursor, limit, {
          model: 'product',
          where: {
            businessId: t.businessId,
            OR: [{ branchId: null }, { branchId: { in: access.ids } }],
          },
          select: {
            id: true,
            name: true,
            sku: true,
            partNumber: true,
            aliases: true,
            compatibleWith: true,
            basePrice: true,
            minSalePrice: true,
            categoryId: true,
            branchId: true,
            lowStockThreshold: true,
            updatedAt: true,
            deletedAt: true,
            ...(isStaff ? {} : { defaultCostPrice: true }),
          },
        });

      case 'instances': {
        if (!access.active) {
          throw new BadRequestException(
            'x-branch-id header is required to pull instances',
          );
        }
        return this.page(q.entity, cursor, limit, {
          model: 'productInstance',
          where: {
            branchId: access.active,
            product: { businessId: t.businessId },
          },
          // A full load only needs live stock; deltas report every status change.
          fullLoadWhere: {
            status: { notIn: [InstanceStatus.SOLD, InstanceStatus.CONSUMED] },
            product: { businessId: t.businessId, deletedAt: null },
          },
          select: {
            id: true,
            productId: true,
            branchId: true,
            cabinetId: true,
            status: true,
            condition: true,
            serialNumber: true,
            updatedAt: true,
            ...(isStaff ? {} : { unitCost: true }),
          },
        });
      }

      case 'stockSummary':
        return this.stockSummary(t, access);

      case 'customers':
        return this.page(q.entity, cursor, limit, {
          model: 'customer',
          where: { businessId: t.businessId },
          select: {
            id: true,
            name: true,
            phone: true,
            shopName: true,
            address: true,
            email: true,
            creditLimit: true,
            isDefaulter: true,
            paymentTermsDays: true,
            updatedAt: true,
            deletedAt: true,
          },
        });

      case 'vendors':
        return this.page(q.entity, cursor, limit, {
          model: 'vendor',
          where: { businessId: t.businessId },
          select: {
            id: true,
            businessName: true,
            contactName: true,
            phone: true,
            address: true,
            updatedAt: true,
            deletedAt: true,
          },
        });

      case 'categories':
        return this.page(q.entity, cursor, limit, {
          model: 'category',
          where: {
            businessId: t.businessId,
            OR: [{ branchId: null }, { branchId: { in: access.ids } }],
          },
          select: {
            id: true,
            name: true,
            branchId: true,
            updatedAt: true,
            deletedAt: true,
          },
        });

      case 'cabinets':
        return this.page(q.entity, cursor, limit, {
          model: 'cabinet',
          where: {
            businessId: t.businessId,
            branchId: { in: access.ids },
          },
          select: {
            id: true,
            name: true,
            rack: true,
            shelf: true,
            bin: true,
            location: true,
            branchId: true,
            updatedAt: true,
            deletedAt: true,
          },
        });

      case 'branches':
        return this.page(q.entity, cursor, limit, {
          model: 'branch',
          where: { businessId: t.businessId, id: { in: access.ids } },
          select: {
            id: true,
            name: true,
            location: true,
            phone: true,
            updatedAt: true,
            deletedAt: true,
          },
        });
    }
  }

  /**
   * Branches the caller may read: every branch of the business unless the user
   * is restricted via UserBranch rows. The active (x-branch-id) branch must be
   * one of them.
   */
  private async resolveAccess(
    t: TenantContext,
    includeDeleted: boolean,
  ): Promise<Access> {
    const user = await this.prisma.user.findUnique({
      where: { id: t.userId },
      select: { allBranches: true },
    });
    const deletedFilter = includeDeleted ? {} : { deletedAt: null };
    let ids: string[];
    if (!user || user.allBranches) {
      const rows = await this.prisma.branch.findMany({
        where: { businessId: t.businessId, ...deletedFilter },
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    } else {
      const rows = await this.prisma.userBranch.findMany({
        where: {
          userId: t.userId,
          branch: { businessId: t.businessId, ...deletedFilter },
        },
        select: { branchId: true },
      });
      ids = rows.map((r) => r.branchId);
    }
    if (t.branchId && !ids.includes(t.branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }
    return { ids, active: t.branchId };
  }

  private async page(
    entity: SyncPullEntity,
    cursor: Cursor | null,
    limit: number,
    cfg: {
      model:
        | 'product'
        | 'productInstance'
        | 'customer'
        | 'vendor'
        | 'category'
        | 'cabinet'
        | 'branch';
      where: Record<string, unknown>;
      fullLoadWhere?: Record<string, unknown>;
      select: Record<string, boolean>;
    },
  ): Promise<SyncPullResult> {
    const hasDeletedAt = 'deletedAt' in cfg.select;
    const and: Record<string, unknown>[] = [cfg.where];
    if (cursor) {
      const u = new Date(cursor.u);
      and.push({
        OR: [{ updatedAt: { gt: u } }, { updatedAt: u, id: { gt: cursor.i } }],
      });
    } else {
      if (hasDeletedAt) and.push({ deletedAt: null });
      if (cfg.fullLoadWhere) and.push(cfg.fullLoadWhere);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (this.prisma as any)[cfg.model];
    const found: Row[] = await delegate.findMany({
      where: { AND: and },
      select: cfg.select,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = found.length > limit;
    const items = hasMore ? found.slice(0, limit) : found;
    const rows: object[] = [];
    const deleted: string[] = [];
    for (const item of items) {
      if (hasDeletedAt && item.deletedAt) {
        deleted.push(item.id);
      } else {
        const { deletedAt: _omit, ...rest } = item as Row & Record<string, unknown>;
        rows.push(hasDeletedAt ? rest : item);
      }
    }

    const last = items[items.length - 1];
    const next: Cursor = last
      ? { u: last.updatedAt.toISOString(), i: last.id }
      : (cursor ?? ZERO_CURSOR);

    return {
      entity,
      rows,
      deleted,
      cursor: encodeCursor(next),
      hasMore,
      serverTime: new Date().toISOString(),
    };
  }

  /** Available counts for every accessible branch except the active one. */
  private async stockSummary(
    t: TenantContext,
    access: Access,
  ): Promise<SyncPullResult> {
    const branchIds = access.ids.filter((id) => id !== access.active);
    const groups = branchIds.length
      ? await this.prisma.productInstance.groupBy({
          by: ['productId', 'branchId', 'condition'],
          where: {
            status: InstanceStatus.AVAILABLE,
            branchId: { in: branchIds },
            product: { businessId: t.businessId, deletedAt: null },
          },
          _count: { _all: true },
        })
      : [];
    const now = new Date();
    return {
      entity: 'stockSummary',
      rows: groups.map((g) => ({
        productId: g.productId,
        branchId: g.branchId,
        condition: g.condition,
        available: g._count._all,
      })),
      deleted: [],
      cursor: encodeCursor({ u: now.toISOString(), i: '' }),
      hasMore: false,
      serverTime: now.toISOString(),
    };
  }
}
