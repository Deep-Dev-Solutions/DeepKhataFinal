import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

export type SyncItemStatus = 'synced' | 'failed' | 'conflict';

export interface SyncItemResult {
  id: string;
  status: SyncItemStatus;
  reason?: string;
  orderId?: string;
}

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  async processSyncBatch(userId: string, data: { items: any[] }) {
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

    // Load the caller's business once per batch (never from the request body).
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    const businessId = user?.businessId ?? null;

    // Sequential on purpose: stock-affecting orders must not race each other.
    for (const item of items) {
      if (!businessId) {
        results.push({
          id: typeof item?.id === 'string' ? item.id : '',
          status: 'failed',
          reason: 'No business',
        });
        continue;
      }
      results.push(await this.processItem(userId, businessId, item));
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
    userId: string,
    businessId: string,
    item: any,
  ): Promise<SyncItemResult> {
    const id: string = typeof item?.id === 'string' ? item.id : '';

    try {
      if (!item || item.type !== 'CREATE_ORDER') {
        return {
          id,
          status: 'failed',
          reason: `Unsupported sync action: ${item?.type}`,
        };
      }

      if (!id) {
        return { id, status: 'failed', reason: 'Missing sync item id' };
      }

      // Idempotency: an order with this id already exists, so it was synced.
      const existing = await this.prisma.order.findFirst({
        where: { id, businessId },
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
      const orderPayload = {
        ...item.payload,
        id,
      };

      const order: any = await this.ordersService.newOrder(
        userId,
        orderPayload,
      );
      return { id, status: 'synced', orderId: order?.id ?? id };
    } catch (err: any) {
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
  }
}
