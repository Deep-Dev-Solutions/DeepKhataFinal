import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Minimal client surface needed to write an outbox row (PrismaService or a tx client). */
export interface OutboxDb {
  outboxEvent: {
    create(args: { data: Prisma.OutboxEventCreateInput }): Promise<unknown>;
  };
}

export async function writeOutbox(
  db: OutboxDb,
  entity: string,
  entityId: string,
  op: string,
  payload: Prisma.InputJsonValue,
  version = 1,
): Promise<void> {
  await db.outboxEvent.create({
    data: { entity, entityId, op, payload, version },
  });
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append a local write to the outbox. Pass `tx` to join the caller's transaction. */
  async record(
    entity: string,
    entityId: string,
    op: string,
    payload: Prisma.InputJsonValue,
    tx?: OutboxDb,
  ): Promise<void> {
    await writeOutbox(tx ?? this.prisma, entity, entityId, op, payload);
  }
}
