import { Prisma } from '@prisma/client';
import * as M from '../common/money';
import { karachiDateOnly, startOfKarachiDay, addDays } from '../common/dates';

/**
 * Pure usage computation for the TenantDailyUsage rollup. Shared by the Nest
 * service (nightly cron, tests) and the standalone backfill CLI, so it only
 * needs something with `$queryRaw` and `tenantDailyUsage`.
 *
 * Definitions (day = Asia/Karachi calendar day, UTC+5, no DST):
 *  - ordersCount / gmv / itemsSold: orders created that day in status
 *    FINAL or COMPLETED (totalAmount is already net of discount). A later
 *    return does not rewrite history; it is counted in returnsCount on the day
 *    of the return.
 *  - returnsCount: ledger transactions of type RETURN created that day.
 *  - paymentsReceived: Payment rows created that day against the business's orders.
 *  - newCustomers: customers created that day.
 *  - newProducts: Product has no createdAt, so this counts products that got
 *    their INITIAL_STOCK movement that day (product creation with stock > 0).
 *  - logins: Session rows created that day for the business's users
 *    (support view-as sessions excluded).
 *  - activeUsers: distinct users that signed in or created an order that day.
 *  - offlineSyncedOrders: always 0. Orders pushed through /sync are not
 *    flagged in the schema, so they cannot be told apart from online orders.
 *  - duesOpenReceivable / duesOpenPayable: open amounts at the end of the day.
 *    Order receivables use payments up to end of day but only orders that are
 *    not PAID *now*; khata entries use their *current* settled amount and
 *    status. Exact for the nightly "yesterday" run, approximate for old
 *    backfilled days.
 */
export type UsageDb = Prisma.TransactionClient;

export interface UsageMetrics {
  ordersCount: number;
  gmv: Prisma.Decimal;
  itemsSold: number;
  returnsCount: number;
  paymentsReceived: Prisma.Decimal;
  newCustomers: number;
  newProducts: number;
  activeUsers: number;
  logins: number;
  offlineSyncedOrders: number;
  duesOpenReceivable: Prisma.Decimal;
  duesOpenPayable: Prisma.Decimal;
}

const DAY_MS = 86_400_000;

/** YYYY-MM-DD in, or any instant -> the Karachi calendar day, as a UTC-midnight Date. */
export function toUsageDate(input: Date | string): Date {
  if (typeof input === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
    if (!m) throw new Error(`Invalid date: ${input}`);
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  }
  return karachiDateOnly(input);
}

export function usageDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of calendar days from..to. */
export function eachUsageDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

const emptyMetrics = (): UsageMetrics => ({
  ordersCount: 0,
  gmv: M.ZERO,
  itemsSold: 0,
  returnsCount: 0,
  paymentsReceived: M.ZERO,
  newCustomers: 0,
  newProducts: 0,
  activeUsers: 0,
  logins: 0,
  offlineSyncedOrders: 0,
  duesOpenReceivable: M.ZERO,
  duesOpenPayable: M.ZERO,
});

type Row = { businessId: string };

/**
 * Computes the metrics for one Karachi day for one business, or for every
 * business when `businessId` is omitted (one grouped query per metric, never
 * a scan per tenant). Businesses with no activity are absent from the map.
 */
export async function computeUsageMetrics(
  db: UsageDb,
  dateInput: Date | string,
  businessId?: string,
): Promise<Map<string, UsageMetrics>> {
  const date = toUsageDate(dateInput);
  const start = startOfKarachiDay(date).toISOString();
  const end = addDays(startOfKarachiDay(date), 1).toISOString();
  const biz = businessId ?? null;

  const result = new Map<string, UsageMetrics>();
  const get = (id: string): UsageMetrics => {
    let m = result.get(id);
    if (!m) {
      m = emptyMetrics();
      result.set(id, m);
    }
    return m;
  };

  const [
    orders,
    items,
    returns,
    payments,
    customers,
    products,
    logins,
    active,
    orderDues,
    khataDues,
    vendorDues,
  ] = await Promise.all([
    db.$queryRaw<(Row & { n: number; gmv: Prisma.Decimal })[]>`
      SELECT o."businessId", count(*)::int AS n, COALESCE(sum(o."totalAmount"), 0) AS gmv
      FROM "Order" o
      WHERE o.status IN ('FINAL', 'COMPLETED')
        AND o."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND o."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR o."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { n: number })[]>`
      SELECT o."businessId", COALESCE(sum(oi.quantity), 0)::int AS n
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status IN ('FINAL', 'COMPLETED')
        AND o."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND o."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR o."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { n: number })[]>`
      SELECT t."businessId", count(*)::int AS n
      FROM "Transaction" t
      WHERE t.type = 'RETURN'
        AND t."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND t."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR t."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { amt: Prisma.Decimal })[]>`
      SELECT o."businessId", COALESCE(sum(p.amount), 0) AS amt
      FROM "Payment" p
      JOIN "Order" o ON o.id = p."orderId"
      WHERE p."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND p."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR o."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { n: number })[]>`
      SELECT c."businessId", count(*)::int AS n
      FROM "Customer" c
      WHERE c."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND c."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR c."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { n: number })[]>`
      SELECT m."businessId", count(DISTINCT m."productId")::int AS n
      FROM "InventoryMovement" m
      WHERE m."referenceType" = 'INITIAL_STOCK'
        AND m."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND m."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR m."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { n: number })[]>`
      SELECT u."businessId", count(*)::int AS n
      FROM "Session" s
      JOIN "User" u ON u.id = s."userId"
      WHERE s."impersonatedBy" IS NULL
        AND u."businessId" IS NOT NULL
        AND s."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND s."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR u."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { n: number })[]>`
      SELECT a."businessId", count(DISTINCT a.uid)::int AS n
      FROM (
        SELECT u."businessId", u.id AS uid
        FROM "Session" s
        JOIN "User" u ON u.id = s."userId"
        WHERE s."impersonatedBy" IS NULL
          AND u."businessId" IS NOT NULL
          AND s."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
          AND s."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
          AND (${biz}::text IS NULL OR u."businessId" = ${biz})
        UNION ALL
        SELECT o."businessId", o."createdBy" AS uid
        FROM "Order" o
        WHERE o."createdBy" IS NOT NULL
          AND o."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
          AND o."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
          AND (${biz}::text IS NULL OR o."businessId" = ${biz})
      ) a
      GROUP BY 1`,
    db.$queryRaw<(Row & { amt: Prisma.Decimal })[]>`
      SELECT o."businessId",
             COALESCE(sum(GREATEST(o."totalAmount" - COALESCE(pp.paid, 0), 0)), 0) AS amt
      FROM "Order" o
      LEFT JOIN LATERAL (
        SELECT sum(p.amount) AS paid
        FROM "Payment" p
        WHERE p."orderId" = o.id
          AND p."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
      ) pp ON true
      WHERE o.status IN ('FINAL', 'COMPLETED', 'PENDING', 'MEMO')
        AND o."paymentStatus" <> 'PAID'
        AND o."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR o."businessId" = ${biz})
      GROUP BY 1`,
    db.$queryRaw<(Row & { direction: string; amt: Prisma.Decimal })[]>`
      SELECT k."businessId", k.direction::text AS direction,
             COALESCE(sum(GREATEST(k.amount - k."settledAmount", 0)), 0) AS amt
      FROM "KhataEntry" k
      WHERE k."deletedAt" IS NULL
        AND k.status IN ('OPEN', 'PARTIAL')
        AND k."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
        AND (${biz}::text IS NULL OR k."businessId" = ${biz})
      GROUP BY 1, 2`,
    db.$queryRaw<(Row & { amt: Prisma.Decimal })[]>`
      WITH tx_net AS (
        SELECT t."businessId", t.type, po."accountId" AS vendor, sum(po.amount) AS net
        FROM "Transaction" t
        JOIN "Posting" po ON po."transactionId" = t.id
        WHERE t.type IN ('VENDOR_PURCHASE', 'VENDOR_PAYMENT')
          AND po."accountType" = 'VENDOR_PAYABLE'
          AND t."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
          AND (${biz}::text IS NULL OR t."businessId" = ${biz})
        GROUP BY t.id, t."businessId", t.type, po."accountId"
      )
      SELECT v."businessId", COALESCE(sum(GREATEST(v.purchased - v.paid, 0)), 0) AS amt
      FROM (
        SELECT "businessId", vendor,
               sum(CASE WHEN type = 'VENDOR_PURCHASE' AND net < 0 THEN -net ELSE 0 END) AS purchased,
               sum(CASE WHEN type = 'VENDOR_PAYMENT' AND net > 0 THEN net ELSE 0 END) AS paid
        FROM tx_net
        GROUP BY 1, 2
      ) v
      GROUP BY 1`,
  ]);

  for (const r of orders) {
    const m = get(r.businessId);
    m.ordersCount = r.n;
    m.gmv = M.round2(r.gmv);
  }
  for (const r of items) get(r.businessId).itemsSold = r.n;
  for (const r of returns) get(r.businessId).returnsCount = r.n;
  for (const r of payments) get(r.businessId).paymentsReceived = M.round2(r.amt);
  for (const r of customers) get(r.businessId).newCustomers = r.n;
  for (const r of products) get(r.businessId).newProducts = r.n;
  for (const r of logins) get(r.businessId).logins = r.n;
  for (const r of active) get(r.businessId).activeUsers = r.n;
  for (const r of orderDues) {
    const m = get(r.businessId);
    m.duesOpenReceivable = M.add(m.duesOpenReceivable, r.amt);
  }
  for (const r of khataDues) {
    const m = get(r.businessId);
    if (r.direction === 'RECEIVABLE') {
      m.duesOpenReceivable = M.add(m.duesOpenReceivable, r.amt);
    } else {
      m.duesOpenPayable = M.add(m.duesOpenPayable, r.amt);
    }
  }
  for (const r of vendorDues) {
    const m = get(r.businessId);
    m.duesOpenPayable = M.add(m.duesOpenPayable, r.amt);
  }
  for (const m of result.values()) {
    m.duesOpenReceivable = M.round2(m.duesOpenReceivable);
    m.duesOpenPayable = M.round2(m.duesOpenPayable);
  }
  return result;
}

/** Upserts one TenantDailyUsage row (idempotent on [businessId, date]). */
export async function upsertUsageRow(
  db: UsageDb,
  businessId: string,
  date: Date,
  metrics: UsageMetrics | undefined,
) {
  const data = metrics ?? emptyMetrics();
  return db.tenantDailyUsage.upsert({
    where: { businessId_date: { businessId, date } },
    create: { businessId, date, ...data },
    update: { ...data, computedAt: new Date() },
  });
}

/** One day, all businesses (or just one). Returns the number of rows written. */
export async function rollupDay(
  db: UsageDb,
  dateInput: Date | string,
  businessId?: string,
): Promise<number> {
  const date = toUsageDate(dateInput);
  const ids = businessId
    ? (
        await db.business.findMany({
          where: { id: businessId },
          select: { id: true },
        })
      ).map((b) => b.id)
    : (await db.business.findMany({ select: { id: true } })).map((b) => b.id);
  if (ids.length === 0) return 0;

  const metrics = await computeUsageMetrics(db, date, businessId);
  const CHUNK = 25;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await Promise.all(
      ids
        .slice(i, i + CHUNK)
        .map((id) => upsertUsageRow(db, id, date, metrics.get(id))),
    );
  }
  return ids.length;
}
