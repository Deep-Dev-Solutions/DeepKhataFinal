import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { DesktopPushResult } from './dto/desktop.dto';

/**
 * Desktop outbox (entity, op) -> offline-queue item type used by SyncService.
 * Anything else is rejected with "Unsupported entity/op".
 *
 *   order     + create         -> CREATE_ORDER
 *   payment   + create         -> RECORD_PAYMENT
 *   khataEntry+ create         -> CREATE_KHATA_ENTRY
 *   customer  + create|update  -> UPSERT_CUSTOMER
 *   expense   + create         -> CREATE_EXPENSE
 *
 * Payloads are the same objects the client offline queue sends. Idempotency is
 * by entityId (it becomes the queue item id), so replays are accepted without
 * writing twice.
 */
const TYPE_MAP: Record<string, string> = {
  'order:create': 'CREATE_ORDER',
  'payment:create': 'RECORD_PAYMENT',
  'khataEntry:create': 'CREATE_KHATA_ENTRY',
  'customer:create': 'UPSERT_CUSTOMER',
  'customer:update': 'UPSERT_CUSTOMER',
  'expense:create': 'CREATE_EXPENSE',
};

interface QueueItem {
  eventId: string;
  item: { id: string; type: string; payload: Record<string, unknown> };
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

@Injectable()
export class DesktopPushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  /** The user writes are attributed to when applied in the cloud: the business owner. */
  async actingUserId(businessId: string): Promise<string | null> {
    const owner = await this.prisma.user.findFirst({
      where: { businessId, role: Role.OWNER, deactivatedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return owner?.id ?? null;
  }

  async push(businessId: string, events: unknown[]): Promise<DesktopPushResult> {
    const rejected: DesktopPushResult['rejected'] = [];
    const queue: QueueItem[] = [];

    for (const raw of events) {
      const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const eventId =
        typeof e.id === 'string' || typeof e.id === 'number' ? String(e.id) : '';
      if (!eventId) {
        rejected.push({ id: '', reason: 'Missing event id' });
        continue;
      }
      if (!isString(e.entity) || !isString(e.op) || !isString(e.entityId)) {
        rejected.push({ id: eventId, reason: 'entity, entityId and op are required' });
        continue;
      }
      const type = TYPE_MAP[`${e.entity}:${e.op}`];
      if (!type) {
        rejected.push({ id: eventId, reason: `Unsupported entity/op: ${e.entity}/${e.op}` });
        continue;
      }
      if (!e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload)) {
        rejected.push({ id: eventId, reason: 'payload must be an object' });
        continue;
      }
      queue.push({
        eventId,
        item: { id: e.entityId, type, payload: e.payload as Record<string, unknown> },
      });
    }

    const accepted: string[] = [];
    if (queue.length > 0) {
      const userId = await this.actingUserId(businessId);
      if (!userId) {
        for (const q of queue) rejected.push({ id: q.eventId, reason: 'Business has no active owner' });
        return { accepted, rejected };
      }
      const res = await this.sync.processSyncBatch(userId, {
        items: queue.map((q) => q.item),
      });
      // processSyncBatch is sequential and returns one result per item, in order.
      queue.forEach((q, i) => {
        const r = res.results[i];
        if (r?.status === 'synced') accepted.push(q.eventId);
        else rejected.push({ id: q.eventId, reason: r?.reason ?? r?.status ?? 'Sync failed' });
      });
    }
    return { accepted, rejected };
  }
}
