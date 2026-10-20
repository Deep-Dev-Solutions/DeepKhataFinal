import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isDesktopMode } from './desktop-mode';
import { OutboxDb, writeOutbox } from './outbox.service';

/**
 * Desktop outbox capture.
 *
 * In DEPLOYMENT_MODE=desktop every create (and customer profile update) of
 * Order, Payment, KhataEntry, Customer and Expense also writes an OutboxEvent
 * row in the SAME transaction as the business change. The payload is already in
 * the offline-queue item format the cloud accepts (see desktop-push.service.ts),
 * so the desktop only has to ship it.
 *
 * Mechanics: a Prisma `$extends` query extension is built from the PrismaService
 * and its model delegates + $transaction are swapped on that instance, so every
 * service that injects PrismaService is covered without touching them. Inside an
 * interactive transaction the outbox row is written through the transaction's own
 * client (Prisma's internal `_createItxClient`, pinned to Prisma 6); outside a
 * transaction the write and the outbox row share a fresh $transaction. Array-form
 * `$transaction([...])` cannot be joined, so there the row is written right after.
 */

type Row = Record<string, any>;
type Db = Record<string | symbol, any>;

const log = new Logger('DesktopOutbox');

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v.toString());
const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null;

interface Mapped {
  entity: string;
  op: 'create' | 'update';
  payload: Prisma.InputJsonValue;
}

type Builder = (row: Row, db: Db) => Promise<Mapped | null>;

const BUILDERS: Record<string, Partial<Record<'create' | 'update', Builder>>> = {
  order: {
    create: async (row, db) => {
      const items: Row[] =
        row.items ?? (await db.orderItem.findMany({ where: { orderId: row.id } }));
      return {
        entity: 'order',
        op: 'create',
        payload: {
          id: row.id,
          customerId: row.customerId ?? null,
          walkInName: row.walkInName ?? null,
          walkInPhone: row.walkInPhone ?? null,
          branchId: row.branchId ?? null,
          discount: num(row.discount) ?? 0,
          orderStatus: row.status,
          items: items.map((i) => ({
            productId: i.productId ?? undefined,
            quantity: i.quantity,
            price: num(i.price),
            isService: i.isService,
            serviceName: i.serviceName ?? undefined,
            notes: i.notes ?? undefined,
          })),
        },
      };
    },
  },
  payment: {
    create: async (row) => ({
      entity: 'payment',
      op: 'create',
      payload: { orderId: row.orderId, amount: num(row.amount), method: row.method },
    }),
  },
  khataEntry: {
    create: async (row) => ({
      entity: 'khataEntry',
      op: 'create',
      payload: {
        direction: row.direction,
        partyType: row.partyType,
        customerId: row.customerId ?? undefined,
        vendorId: row.vendorId ?? undefined,
        partyName: row.partyName,
        partyPhone: row.partyPhone ?? undefined,
        amount: num(row.amount),
        dueDate: iso(row.dueDate) ?? undefined,
        note: row.note ?? undefined,
        counterAccount: row.counterAccount ?? undefined,
      },
    }),
  },
  customer: {
    create: async (row) => customerEvent(row, 'create'),
    update: async (row) => customerEvent(row, 'update'),
  },
  expense: {
    create: async (row) => ({
      entity: 'expense',
      op: 'create',
      payload: {
        amount: num(row.amount),
        category: row.category,
        description: row.description ?? undefined,
        branchId: row.branchId ?? undefined,
      },
    }),
  },
};

function customerEvent(row: Row, op: 'create' | 'update'): Mapped {
  return {
    entity: 'customer',
    op,
    payload: {
      name: row.name,
      phone: row.phone ?? '',
      shopName: row.shopName ?? null,
      address: row.address ?? null,
      email: row.email ?? null,
      creditLimit: num(row.creditLimit) ?? undefined,
    },
  };
}

/** Customer updates that only touch balances or flags must not flood the outbox. */
const CUSTOMER_PROFILE_KEYS = ['name', 'phone', 'shopName', 'address', 'email', 'creditLimit'];

function shouldRecord(model: string, op: string, args: Row): boolean {
  if (model === 'customer' && op === 'update') {
    const data = (args?.data ?? {}) as Row;
    return CUSTOMER_PROFILE_KEYS.some((k) => k in data);
  }
  return true;
}

async function capture(db: Db, model: string, op: 'create' | 'update', row: Row): Promise<void> {
  const mapped = await BUILDERS[model]?.[op]?.(row, db);
  if (!mapped || !row?.id) return;
  await writeOutbox(db as OutboxDb, mapped.entity, row.id, mapped.op, mapped.payload);
}

const MARK = Symbol.for('deepkhata.outboxInstalled');

/** Idempotent. No-op unless DEPLOYMENT_MODE=desktop. */
export function installOutbox(prisma: object): boolean {
  if (!isDesktopMode()) return false;
  const base = prisma as Db;
  if (base[MARK]) return true;

  const rawTransaction = base.$transaction.bind(base) as (fn: (tx: Db) => Promise<unknown>) => Promise<unknown>;

  const hook =
    (model: string, op: 'create' | 'update') =>
    async ({ args, query, __internalParams }: { args: Row; query: (a: Row) => Promise<Row>; __internalParams?: Row }) => {
      if (!shouldRecord(model, op, args)) return query(args);
      const tr = __internalParams?.transaction as { kind?: string } | undefined;

      if (tr?.kind === 'itx') {
        const row = await query(args);
        await capture(base._createItxClient(tr), model, op, row);
        return row;
      }
      if (tr) {
        // Array-form $transaction: cannot join, record straight after the write.
        const row = await query(args);
        void capture(base, model, op, row).catch((e) => log.error(`outbox write failed: ${e?.message}`));
        return row;
      }
      return rawTransaction(async (tx) => {
        const row = (await tx[model][op](args)) as Row;
        await capture(tx, model, op, row);
        return row;
      });
    };

  const ext = (prisma as any).$extends({
    query: {
      order: { create: hook('order', 'create') },
      payment: { create: hook('payment', 'create') },
      khataEntry: { create: hook('khataEntry', 'create') },
      customer: { create: hook('customer', 'create'), update: hook('customer', 'update') },
      expense: { create: hook('expense', 'create') },
    },
  }) as Db;

  for (const key of ['order', 'payment', 'khataEntry', 'customer', 'expense', '$transaction']) {
    const value = ext[key];
    Object.defineProperty(base, key, {
      value: typeof value === 'function' ? value.bind(ext) : value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
  Object.defineProperty(base, MARK, { value: true, configurable: true });
  log.log('Outbox capture installed (desktop mode)');
  return true;
}
