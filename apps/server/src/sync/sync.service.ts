import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  async processSyncBatch(userId: string, data: { items: any[] }) {
    const { items } = data;
    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, syncedCount: 0, syncedIds: [] };
    }

    const syncedIds: string[] = [];
    const errors: any[] = [];

    for (const item of items) {
      try {
        if (item.type === 'CREATE_ORDER') {
          // Check for idempotency: if order already exists, mark as synced
          if (item.id) {
            const existing = await this.prisma.order.findUnique({
              where: { id: item.id },
            });
            if (existing) {
              syncedIds.push(item.id);
              continue;
            }
          }

          const orderPayload = {
            id: item.id,
            ...item.payload,
          };

          await this.ordersService.newOrder(userId, orderPayload);
          syncedIds.push(item.id);
        }
      } catch (err: any) {
        errors.push({ id: item.id, error: err?.message || 'Sync failed' });
      }
    }

    return {
      success: true,
      syncedCount: syncedIds.length,
      syncedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
