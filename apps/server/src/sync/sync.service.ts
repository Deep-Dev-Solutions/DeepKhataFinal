import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrdersService } from '../orders/orders.service';
import { KhataEntriesService } from '../khata-entries/khata-entries.service';
import { CashService } from '../cash/cash.service';
import { RecordPaymentDto } from '../orders/dto/record-payment.dto';
import { CreateKhataEntryDto } from '../khata-entries/dto/khata-entry.dto';
import { LogExpenseDto } from '../cash/dto/log-expense.dto';
import { ROLE_PERMISSIONS } from '../config/permissions';
import { TenantContext } from '../tenant/tenant.types';

export type SyncItemStatus = 'synced' | 'failed' | 'conflict';

export interface SyncItemResult {
  id: string;
  status: SyncItemStatus;
  reason?: string;
  orderId?: string;
}

/** Offline write types and the permission each one needs (same as the REST route). */
const SYNC_PERMISSIONS: Record<string, string> = {
  CREATE_ORDER: 'create:order',
  RECORD_PAYMENT: 'update:order',
  CREATE_KHATA_ENTRY: 'manage:dues',
  UPSERT_CUSTOMER: 'write:customers',
  CREATE_EXPENSE: 'manage:cash',
};

const ID_IN_USE = 'Id already in use';
const DEFAULT_CREDIT_LIMIT = 50000;

type Claim = 'mine' | 'foreign' | 'free';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private khataService: KhataEntriesService,
    private cashService: CashService,
    private redis: RedisService,
  ) {}

  async processSyncBatch(
    userId: string,
    data: { items: any[] },
    branchId: string | null = null,
  ) {
    const items = data?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: true,
        syncedCount: 0,
        syncedIds: [] as string[],
        results: [] as SyncItemResult[],
      };
    }

    const results: SyncItemResult[] = [];

    // Load the caller's business and role once per batch (never from the request body).
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });
    const businessId = user?.businessId ?? null;

    // Sequential on purpose: stock-affecting orders must not race each other.
    for (const item of items) {
      if (!businessId || !user) {
        results.push({
          id: typeof item?.id === 'string' ? item.id : '',
          status: 'failed',
          reason: 'No business',
        });
        continue;
      }
      const t: TenantContext = {
        businessId,
        branchId,
        userId,
        role: user.role,
      };
      results.push(await this.processItem(t, item));
    }

    const syncedIds = results
      .filter((r) => r.status === 'synced')
      .map((r) => r.id);

    return {
      success: true,
      syncedCount: syncedIds.length,
      syncedIds,
      results,
    };
  }

  private async processItem(
    t: TenantContext,
    item: any,
  ): Promise<SyncItemResult> {
    const id: string = typeof item?.id === 'string' ? item.id : '';

    try {
      const permission = item ? SYNC_PERMISSIONS[item.type] : undefined;
      if (!permission) {
        return {
          id,
          status: 'failed',
          reason: `Unsupported sync action: ${item?.type}`,
        };
      }

      if (!id) {
        return { id, status: 'failed', reason: 'Missing sync item id' };
      }

      const granted: string[] = ROLE_PERMISSIONS[t.role as Role] ?? [];
      if (!granted.includes(permission)) {
        return { id, status: 'failed', reason: 'Permission denied' };
      }

      const payload =
        item.payload && typeof item.payload === 'object' ? item.payload : {};

      switch (item.type) {
        case 'CREATE_ORDER':
          return await this.createOrder(t, id, payload);
        case 'RECORD_PAYMENT':
          return await this.idempotent(t, id, 'payment', () =>
            this.recordPayment(t, id, payload),
          );
        case 'CREATE_KHATA_ENTRY':
          return await this.idempotent(t, id, 'khataEntry', () =>
            this.createKhataEntry(t, id, payload),
          );
        case 'CREATE_EXPENSE':
          return await this.idempotent(t, id, 'expense', () =>
            this.createExpense(t, id, payload),
          );
        case 'UPSERT_CUSTOMER':
          return await this.upsertCustomer(t, id, payload);
      }
      return { id, status: 'failed', reason: 'Unsupported sync action' };
    } catch (err: any) {
      return this.toFailure(id, err);
    }
  }

  private toFailure(id: string, err: any): SyncItemResult {
    const message: string = err?.message || 'Sync failed';
    const isStockProblem =
      (err instanceof BadRequestException ||
        err instanceof ConflictException) &&
      /stock|instance|available/i.test(message);

    return {
      id,
      status: isStockProblem ? 'conflict' : 'failed',
      reason: message,
    };
  }

  // ---- CREATE_ORDER -------------------------------------------------------

  private async createOrder(
    t: TenantContext,
    id: string,
    payload: Record<string, unknown>,
  ): Promise<SyncItemResult> {
    // Idempotency: an order with this id already exists, so it was synced.
    const existing = await this.prisma.order.findFirst({
      where: { id, businessId: t.businessId },
      select: { id: true },
    });
    if (existing) {
      return { id, status: 'synced', orderId: existing.id };
    }

    // Same id under another business: never report it as synced.
    const foreign = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true },
    });
    if (foreign) {
      return { id, status: 'failed', reason: 'Order id already in use' };
    }

    // The queue item id always wins over any id inside the payload.
    const order: any = await this.ordersService.newOrder(
      t.userId,
      { ...payload, id },
      { isOfflineSync: true },
    );
    return { id, status: 'synced', orderId: order?.id ?? id };
  }

  // ---- Idempotency for the id-keyed writes --------------------------------

  /** Whose row (if any) already carries this client-generated id. */
  private async claim(
    t: TenantContext,
    model: 'payment' | 'khataEntry' | 'expense' | 'customer',
    id: string,
  ): Promise<Claim> {
    let owner: string | null | undefined;
    switch (model) {
      case 'payment': {
        const row = await this.prisma.payment.findUnique({
          where: { id },
          select: { order: { select: { businessId: true } } },
        });
        owner = row ? row.order.businessId : undefined;
        break;
      }
      case 'khataEntry': {
        const row = await this.prisma.khataEntry.findUnique({
          where: { id },
          select: { businessId: true },
        });
        owner = row ? row.businessId : undefined;
        break;
      }
      case 'expense': {
        const row = await this.prisma.expense.findUnique({
          where: { id },
          select: { businessId: true },
        });
        owner = row ? row.businessId : undefined;
        break;
      }
      case 'customer': {
        const row = await this.prisma.customer.findUnique({
          where: { id },
          select: { businessId: true },
        });
        owner = row ? row.businessId : undefined;
        break;
      }
    }
    if (owner === undefined) return 'free';
    return owner === t.businessId ? 'mine' : 'foreign';
  }

  /** claim -> create -> (on unique race) claim again; replays return synced. */
  private async idempotent(
    t: TenantContext,
    id: string,
    model: 'payment' | 'khataEntry' | 'expense',
    create: () => Promise<unknown>,
  ): Promise<SyncItemResult> {
    const verdict = (c: Claim): SyncItemResult | null =>
      c === 'mine'
        ? { id, status: 'synced' }
        : c === 'foreign'
          ? { id, status: 'failed', reason: ID_IN_USE }
          : null;

    const before = verdict(await this.claim(t, model, id));
    if (before) return before;

    try {
      await create();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const after = verdict(await this.claim(t, model, id));
        if (after) return after;
      }
      throw err;
    }
    return { id, status: 'synced' };
  }

  private async validated<T extends object>(
    cls: new () => T,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const instance = plainToInstance(cls, payload);
    const errors = await validate(instance, { whitelist: true });
    if (errors.length > 0) {
      const message = errors
        .flatMap((e) => Object.values(e.constraints ?? {}))
        .join('; ');
      throw new BadRequestException(message || 'Invalid payload');
    }
    return instance;
  }

  // ---- RECORD_PAYMENT -----------------------------------------------------

  private async recordPayment(
    t: TenantContext,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const dto = await this.validated(RecordPaymentDto, payload);
    return this.ordersService.recordPayment(t.userId, dto, id);
  }

  // ---- CREATE_KHATA_ENTRY -------------------------------------------------

  private async createKhataEntry(
    t: TenantContext,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const dto = await this.validated(CreateKhataEntryDto, payload);
    return this.khataService.create(t, dto, id);
  }

  // ---- CREATE_EXPENSE -----------------------------------------------------

  private async createExpense(
    t: TenantContext,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const dto = await this.validated(LogExpenseDto, payload);
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, businessId: t.businessId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Invalid branch');
    }
    return this.cashService.logExpense(t.userId, dto, id);
  }

  // ---- UPSERT_CUSTOMER ----------------------------------------------------

  private async upsertCustomer(
    t: TenantContext,
    id: string,
    payload: Record<string, any>,
  ): Promise<SyncItemResult> {
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim() : null;

    const name = str(payload.name);
    if (!name) return { id, status: 'failed', reason: 'Customer name is required' };
    const phone = str(payload.phone) ?? '';

    const verdict = await this.claim(t, 'customer', id);
    if (verdict === 'foreign') {
      return { id, status: 'failed', reason: ID_IN_USE };
    }

    if (phone) {
      const clash = await this.prisma.customer.findFirst({
        where: {
          businessId: t.businessId,
          phone,
          deletedAt: null,
          id: { not: id },
        },
        select: { id: true },
      });
      if (clash) {
        return {
          id,
          status: 'failed',
          reason: 'Customer with this phone number already exists',
        };
      }
    }

    if (verdict === 'mine') {
      const current = await this.prisma.customer.findFirst({
        where: { id, businessId: t.businessId },
        select: { deletedAt: true },
      });
      if (current?.deletedAt) {
        return {
          id,
          status: 'conflict',
          reason: 'Customer was deleted on the server',
        };
      }
      // Risk fields (creditLimit, isDefaulter) are never changed from the queue.
      await this.prisma.customer.update({
        where: { id },
        data: {
          name,
          ...(payload.phone !== undefined ? { phone } : {}),
          ...(payload.shopName !== undefined
            ? { shopName: str(payload.shopName) }
            : {}),
          ...(payload.address !== undefined
            ? { address: str(payload.address) }
            : {}),
          ...(payload.email !== undefined ? { email: str(payload.email) } : {}),
        },
      });
    } else {
      let creditLimit: number = DEFAULT_CREDIT_LIMIT;
      if (payload.creditLimit !== undefined && payload.creditLimit !== null) {
        const parsed = Number(payload.creditLimit);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return { id, status: 'failed', reason: 'Invalid credit limit' };
        }
        creditLimit = parsed;
      }
      try {
        await this.prisma.customer.create({
          data: {
            id,
            name,
            phone,
            shopName: str(payload.shopName),
            address: str(payload.address),
            email: str(payload.email),
            creditLimit,
            businessId: t.businessId,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const again = await this.claim(t, 'customer', id);
          if (again === 'mine') return { id, status: 'synced' };
          if (again === 'foreign') {
            return { id, status: 'failed', reason: ID_IN_USE };
          }
        }
        throw err;
      }
    }

    await this.redis.deleteByPattern(`customers:${t.businessId}:*`);
    return { id, status: 'synced' };
  }
}
