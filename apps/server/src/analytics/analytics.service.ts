import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import * as M from '../common/money';
import { addDays, karachiDateOnly } from '../common/dates';
import { TenantFilter, TenantsAnalyticsQueryDto } from './analytics.dto';
import { toUsageDate, usageDateString } from './usage-compute';
import { buildUsageStatementPdf } from './usage-statement-pdf';

const DAY_MS = 86_400_000;
const FEATURE_COUNT = 4;
/** Days per month a shop is realistically open; 22 active days = full marks. */
const FULL_ACTIVITY_DAYS = 22;

export type PlanFit = 'UPGRADE_CANDIDATE' | 'CHURN_RISK' | null;

export interface TenantHealth {
  score: number;
  reason: string;
}

export interface HealthInput {
  activeDays30: number;
  orders30: number;
  ordersPrev30: number;
  featuresUsed14: number;
}

/**
 * Health 0-100: active days in the last 30 (40), orders vs the previous 30,
 * capped at parity (30), feature breadth in the last 14 days (30). The reason
 * names the part with the lowest share of its own maximum.
 */
export function computeHealth(i: HealthInput): TenantHealth {
  const activity = Math.min(1, i.activeDays30 / FULL_ACTIVITY_DAYS);
  const trend =
    i.ordersPrev30 > 0
      ? Math.min(1, i.orders30 / i.ordersPrev30)
      : i.orders30 > 0
        ? 1
        : 0;
  const breadth = Math.min(1, i.featuresUsed14 / FEATURE_COUNT);
  const score = Math.round(40 * activity + 30 * trend + 30 * breadth);

  const parts: { ratio: number; reason: string }[] = [
    { ratio: activity, reason: `Active only ${i.activeDays30} of the last 30 days` },
    {
      ratio: trend,
      reason:
        i.ordersPrev30 > 0
          ? `Orders down ${Math.round((1 - trend) * 100)}% vs the previous 30 days`
          : 'No orders in the last 30 days',
    },
    {
      ratio: breadth,
      reason: `Using ${i.featuresUsed14} of ${FEATURE_COUNT} features in the last 14 days`,
    },
  ];
  const weakest = parts.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return { score, reason: weakest.ratio >= 1 ? 'Healthy' : weakest.reason };
}

interface Limits {
  maxUsers: number | null;
  maxProducts: number | null;
  maxBranches: number | null;
}

type LimitKey = keyof Limits;

function limitOf(
  plan: Record<LimitKey, number | null>,
  custom: unknown,
  key: LimitKey,
): number | null {
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    const v = (custom as Record<string, unknown>)[key];
    if (v === null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return plan[key];
}

function gmvThreshold(features: unknown): number | null {
  if (features && typeof features === 'object' && !Array.isArray(features)) {
    const v = (features as Record<string, unknown>).gmvThreshold;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export interface TenantRow {
  businessId: string;
  name: string;
  plan: string;
  planCode: string;
  status: string;
  trialDaysLeft: number | null;
  lastActiveAt: Date | null;
  orders30: number;
  gmv30: Prisma.Decimal;
  activeUsers: number;
  maxUsers: number | null;
  products: number;
  maxProducts: number | null;
  branches: number;
  maxBranches: number | null;
  health: TenantHealth;
  planFit: PlanFit;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  // ------------------------------------------------------------ tenants list

  async listTenants(q: TenantsAnalyticsQueryDto): Promise<TenantRow[]> {
    const now = new Date();
    const today = karachiDateOnly(now);
    const d30 = usageDateString(addDays(today, -29)); // last 30 days incl. today
    const d60 = usageDateString(addDays(today, -59));
    const prevEnd = usageDateString(addDays(today, -30));
    const d14 = usageDateString(addDays(today, -13));
    const since14Iso = new Date(now.getTime() - 14 * DAY_MS).toISOString();

    const [businesses, usage, users, invites, products, branches, features] =
      await Promise.all([
        this.prisma.business.findMany({
          select: {
            id: true,
            name: true,
            status: true,
            lastActiveAt: true,
            createdAt: true,
            subscription: { include: { plan: true } },
          },
        }),
        this.prisma.$queryRaw<
          {
            businessId: string;
            orders30: number;
            gmv30: Prisma.Decimal;
            ordersPrev30: number;
            activeDays30: number;
            activeUsers: number;
          }[]
        >`
          SELECT "businessId",
            COALESCE(sum("ordersCount") FILTER (WHERE "date" >= ${d30}::date), 0)::int AS "orders30",
            COALESCE(sum("gmv") FILTER (WHERE "date" >= ${d30}::date), 0) AS "gmv30",
            COALESCE(sum("ordersCount") FILTER (WHERE "date" <= ${prevEnd}::date), 0)::int AS "ordersPrev30",
            (count(*) FILTER (WHERE "date" >= ${d30}::date
               AND ("ordersCount" > 0 OR "activeUsers" > 0 OR "logins" > 0)))::int AS "activeDays30",
            COALESCE(max("activeUsers") FILTER (WHERE "date" >= ${d30}::date), 0)::int AS "activeUsers"
          FROM "TenantDailyUsage"
          WHERE "date" >= ${d60}::date
          GROUP BY 1`,
        this.prisma.user.groupBy({
          by: ['businessId'],
          where: { businessId: { not: null }, deactivatedAt: null },
          _count: { _all: true },
        }),
        this.prisma.invitation.groupBy({
          by: ['businessId'],
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          _count: { _all: true },
        }),
        this.prisma.product.groupBy({
          by: ['businessId'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.branch.groupBy({
          by: ['businessId'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<{ businessId: string; f: string }[]>`
          SELECT DISTINCT "businessId", f FROM (
            SELECT "businessId", 'khata' AS f FROM "KhataEntry" WHERE "createdAt" >= (${since14Iso}::timestamptz AT TIME ZONE 'UTC')
            UNION ALL
            SELECT "businessId", 'dues' FROM "PromiseToPay" WHERE "createdAt" >= (${since14Iso}::timestamptz AT TIME ZONE 'UTC')
            UNION ALL
            SELECT "businessId", 'dues' FROM "Transaction"
              WHERE type = 'KHATA_SETTLEMENT' AND "createdAt" >= (${since14Iso}::timestamptz AT TIME ZONE 'UTC')
            UNION ALL
            SELECT "businessId", 'stock' FROM "StockReservation" WHERE "createdAt" >= (${since14Iso}::timestamptz AT TIME ZONE 'UTC')
            UNION ALL
            SELECT "businessId", 'stock' FROM "StockTransferRequest" WHERE "requestedAt" >= (${since14Iso}::timestamptz AT TIME ZONE 'UTC')
            UNION ALL
            SELECT "businessId", 'pos' FROM "TenantDailyUsage"
              WHERE "date" >= ${d14}::date AND "ordersCount" > 0
          ) x`,
      ]);

    const toMap = (rows: { businessId: string | null; _count: { _all: number } }[]) =>
      new Map(rows.filter((r) => r.businessId).map((r) => [r.businessId as string, r._count._all]));
    const userCount = toMap(users);
    const inviteCount = toMap(invites);
    const productCount = toMap(products);
    const branchCount = toMap(branches);
    const usageBy = new Map(usage.map((u) => [u.businessId, u]));
    const featureBy = new Map<string, Set<string>>();
    for (const f of features) {
      const set = featureBy.get(f.businessId) ?? new Set<string>();
      set.add(f.f);
      featureBy.set(f.businessId, set);
    }

    const inactiveCutoff = now.getTime() - 7 * DAY_MS;
    const rows: (TenantRow & { overLimit: boolean; expiresAt: Date | null })[] = [];

    for (const b of businesses) {
      const sub = b.subscription;
      const u = usageBy.get(b.id);
      const orders30 = u?.orders30 ?? 0;
      const gmv30 = M.round2(u?.gmv30 ?? 0);
      const planCols = sub
        ? {
            maxUsers: sub.plan.maxUsers,
            maxProducts: sub.plan.maxProducts,
            maxBranches: sub.plan.maxBranches,
          }
        : { maxUsers: 2, maxProducts: null, maxBranches: 2 };
      const custom = sub?.customLimits;
      const maxUsers = limitOf(planCols, custom, 'maxUsers');
      const maxProducts = limitOf(planCols, custom, 'maxProducts');
      const maxBranches = limitOf(planCols, custom, 'maxBranches');

      const usersUsed = (userCount.get(b.id) ?? 0) + (inviteCount.get(b.id) ?? 0);
      const productsUsed = productCount.get(b.id) ?? 0;
      const branchesUsed = branchCount.get(b.id) ?? 0;

      const threshold = sub ? gmvThreshold(sub.plan.features) : null;
      const overLimit =
        (maxUsers !== null && usersUsed >= maxUsers) ||
        (maxProducts !== null && productsUsed >= maxProducts) ||
        (maxBranches !== null && branchesUsed >= maxBranches) ||
        (threshold !== null && M.gt(gmv30, threshold));

      const lowFootprint =
        (maxUsers === null || usersUsed <= Math.max(1, Math.floor(maxUsers * 0.1))) &&
        (maxProducts === null || productsUsed <= Math.floor(maxProducts * 0.1));
      const oldEnough = now.getTime() - b.createdAt.getTime() >= 30 * DAY_MS;
      const churnRisk = lowFootprint && orders30 < 10 && oldEnough;

      const status = sub?.status ?? b.status;
      const trialEnds = sub?.status === 'TRIALING' ? sub.trialEndsAt : null;
      const featureSet = featureBy.get(b.id);

      rows.push({
        businessId: b.id,
        name: b.name,
        plan: sub?.plan.name ?? 'Custom',
        planCode: sub?.plan.code ?? 'CUSTOM',
        status,
        trialDaysLeft: trialEnds
          ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / DAY_MS))
          : null,
        lastActiveAt: b.lastActiveAt,
        orders30,
        gmv30,
        activeUsers: u?.activeUsers ?? 0,
        maxUsers,
        products: productsUsed,
        maxProducts,
        branches: branchesUsed,
        maxBranches,
        health: computeHealth({
          activeDays30: u?.activeDays30 ?? 0,
          orders30,
          ordersPrev30: u?.ordersPrev30 ?? 0,
          featuresUsed14: featureSet ? featureSet.size : 0,
        }),
        planFit: overLimit ? 'UPGRADE_CANDIDATE' : churnRisk ? 'CHURN_RISK' : null,
        overLimit,
        expiresAt: trialEnds ?? sub?.currentPeriodEnd ?? null,
      });
    }

    const horizon = now.getTime() + 7 * DAY_MS;
    const predicates: Record<TenantFilter, (r: (typeof rows)[number]) => boolean> = {
      trialing: (r) => r.status === 'TRIALING',
      expiring7: (r) =>
        (r.status === 'TRIALING' || r.status === 'ACTIVE') &&
        r.expiresAt !== null &&
        r.expiresAt.getTime() >= now.getTime() &&
        r.expiresAt.getTime() <= horizon,
      pastdue: (r) => r.status === 'PAST_DUE',
      inactive7: (r) => !r.lastActiveAt || r.lastActiveAt.getTime() < inactiveCutoff,
      overlimit: (r) => r.overLimit,
    };
    let out = q.filter ? rows.filter(predicates[q.filter]) : rows;

    if (q.sort === 'gmv') {
      out = [...out].sort((a, b) => b.gmv30.comparedTo(a.gmv30));
    } else if (q.sort === 'lastActive') {
      out = [...out].sort(
        (a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
      );
    } else {
      out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    }
    return out.map(({ overLimit: _o, expiresAt: _e, ...row }) => row);
  }

  tenantsToCsv(rows: TenantRow[]): string {
    const head = [
      'businessId', 'name', 'plan', 'status', 'trialDaysLeft', 'lastActiveAt',
      'orders30', 'gmv30', 'activeUsers', 'maxUsers', 'products', 'maxProducts',
      'branches', 'maxBranches', 'healthScore', 'healthReason', 'planFit',
    ];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.businessId, r.name, r.plan, r.status, r.trialDaysLeft, r.lastActiveAt,
          r.orders30, r.gmv30.toFixed(2), r.activeUsers, r.maxUsers, r.products,
          r.maxProducts, r.branches, r.maxBranches, r.health.score, r.health.reason,
          r.planFit,
        ]
          .map(csvCell)
          .join(','),
      );
    }
    return lines.join('\n') + '\n';
  }

  // ----------------------------------------------------------- tenant detail

  async getTenantDetail(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        city: true,
        market: true,
        source: true,
        followUpStatus: true,
        followUpNotes: true,
        lastActiveAt: true,
        createdAt: true,
        subscription: { include: { plan: true } },
      },
    });
    if (!business) throw new NotFoundException(`Business ${businessId} not found`);

    const now = new Date();
    const today = karachiDateOnly(now);
    const since = addDays(today, -89);
    const sinceInstant = new Date(since.getTime() - 5 * 3_600_000);
    const sinceIso = sinceInstant.toISOString();

    const [daily, heat, top, branchSplit, team, sessions, limits, usage, invoices, payments] =
      await Promise.all([
        this.prisma.tenantDailyUsage.findMany({
          where: { businessId, date: { gte: since } },
          select: { date: true, ordersCount: true, gmv: true },
          orderBy: { date: 'asc' },
        }),
        this.prisma.$queryRaw<{ dow: number; hour: number; n: number }[]>`
          SELECT EXTRACT(DOW FROM ("createdAt" + interval '5 hours'))::int AS dow,
                 EXTRACT(HOUR FROM ("createdAt" + interval '5 hours'))::int AS hour,
                 count(*)::int AS n
          FROM "Order"
          WHERE "businessId" = ${businessId} AND "createdAt" >= (${sinceIso}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1, 2`,
        this.prisma.$queryRaw<
          { productId: string; name: string; qty: number; revenue: Prisma.Decimal }[]
        >`
          SELECT oi."productId", p.name, COALESCE(sum(oi.quantity), 0)::int AS qty,
                 COALESCE(sum(oi.price * oi.quantity), 0) AS revenue
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          JOIN "Product" p ON p.id = oi."productId"
          WHERE o."businessId" = ${businessId}
            AND o.status IN ('FINAL', 'COMPLETED')
            AND o."createdAt" >= (${sinceIso}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1, 2
          ORDER BY revenue DESC
          LIMIT 10`,
        this.prisma.$queryRaw<
          { branchId: string | null; name: string | null; orders: number; gmv: Prisma.Decimal }[]
        >`
          SELECT o."branchId", b.name, count(*)::int AS orders,
                 COALESCE(sum(o."totalAmount"), 0) AS gmv
          FROM "Order" o
          LEFT JOIN "Branch" b ON b.id = o."branchId"
          WHERE o."businessId" = ${businessId}
            AND o.status IN ('FINAL', 'COMPLETED')
            AND o."createdAt" >= (${sinceIso}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1, 2
          ORDER BY gmv DESC`,
        this.prisma.user.findMany({
          where: { businessId },
          select: { id: true, name: true, role: true, lastActiveAt: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.session.groupBy({
          by: ['userId'],
          where: { user: { businessId }, createdAt: { gte: sinceInstant }, impersonatedBy: null },
          _count: { _all: true },
        }),
        this.planLimits.getLimits(businessId),
        this.planLimits.getUsage(businessId),
        this.prisma.agencyInvoice.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 24,
          select: {
            id: true, number: true, status: true, total: true, dueDate: true,
            paidAt: true, periodStart: true, periodEnd: true,
          },
        }),
        this.prisma.agencyPayment.findMany({
          where: { businessId },
          orderBy: { receivedAt: 'desc' },
          take: 24,
          select: {
            id: true, amount: true, method: true, reference: true, receivedAt: true, invoiceId: true,
          },
        }),
      ]);

    // Continuous 90-day series; days without a rollup row are zero.
    const byDate = new Map(daily.map((d) => [usageDateString(d.date), d]));
    const series: { date: string; orders: number; gmv: Prisma.Decimal }[] = [];
    for (let i = 0; i < 90; i++) {
      const key = usageDateString(addDays(since, i));
      const row = byDate.get(key);
      series.push({ date: key, orders: row?.ordersCount ?? 0, gmv: row?.gmv ?? M.ZERO });
    }

    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (const h of heat) heatmap[h.dow][h.hour] = h.n;

    const sessionCount = new Map(sessions.map((s) => [s.userId, s._count._all]));
    const sub = business.subscription;

    return {
      business: {
        id: business.id,
        name: business.name,
        city: business.city,
        market: business.market,
        createdAt: business.createdAt,
        lastActiveAt: business.lastActiveAt,
      },
      daily: series,
      heatmap,
      topProducts: top.map((t) => ({
        productId: t.productId,
        name: t.name,
        quantity: t.qty,
        revenue: M.round2(t.revenue),
      })),
      branchSplit: branchSplit.map((b) => ({
        branchId: b.branchId,
        name: b.name ?? 'Unassigned',
        orders: b.orders,
        gmv: M.round2(b.gmv),
      })),
      users: team.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        lastActiveAt: u.lastActiveAt,
        sessions: sessionCount.get(u.id) ?? 0,
      })),
      limits,
      usage,
      subscription: sub
        ? {
            current: {
              id: sub.id,
              status: sub.status,
              plan: { code: sub.plan.code, name: sub.plan.name },
              billingCycle: sub.billingCycle,
              trialEndsAt: sub.trialEndsAt,
              currentPeriodStart: sub.currentPeriodStart,
              currentPeriodEnd: sub.currentPeriodEnd,
              priceOverride: sub.priceOverride,
            },
            invoices,
            payments,
          }
        : { current: null, invoices, payments },
      followUp: {
        status: business.followUpStatus,
        notes: business.followUpNotes,
        source: business.source,
      },
    };
  }

  // ---------------------------------------------------------------- overview

  async getOverview() {
    const now = new Date();
    const today = karachiDateOnly(now);
    const monthStart = new Date(`${usageDateString(today).slice(0, 7)}-01T00:00:00+05:00`);
    const d30 = usageDateString(addDays(today, -29));
    const since90 = new Date(now.getTime() - 90 * DAY_MS);
    const since90Iso = since90.toISOString();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);

    const [active, trialsThisMonth, trials90, cancelled, lost, gmv, byCity, byMarket] =
      await Promise.all([
        this.prisma.subscription.findMany({
          where: { status: SubscriptionStatus.ACTIVE },
          select: { billingCycle: true, priceOverride: true, plan: { select: { priceMonthly: true, priceYearly: true } } },
        }),
        this.prisma.subscription.count({
          where: { trialEndsAt: { not: null }, createdAt: { gte: monthStart } },
        }),
        this.prisma.subscription.findMany({
          where: { trialEndsAt: { not: null }, createdAt: { gte: since90 } },
          select: { status: true },
        }),
        this.prisma.subscription.findMany({
          where: { status: SubscriptionStatus.CANCELLED, updatedAt: { gte: since30 } },
          select: { businessId: true },
        }),
        this.prisma.subscription.findMany({
          where: { business: { followUpStatus: 'LOST' }, updatedAt: { gte: since30 } },
          select: { businessId: true },
        }),
        this.prisma.$queryRaw<{ gmv: Prisma.Decimal }[]>`
          SELECT COALESCE(sum("gmv"), 0) AS gmv FROM "TenantDailyUsage" WHERE "date" >= ${d30}::date`,
        this.prisma.$queryRaw<{ label: string; count: number }[]>`
          SELECT COALESCE(NULLIF(trim(city), ''), 'Unknown') AS label, count(*)::int AS count
          FROM "Business" WHERE "createdAt" >= (${since90Iso}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1 ORDER BY count DESC, label ASC`,
        this.prisma.$queryRaw<{ label: string; count: number }[]>`
          SELECT COALESCE(NULLIF(trim(market), ''), 'Unknown') AS label, count(*)::int AS count
          FROM "Business" WHERE "createdAt" >= (${since90Iso}::timestamptz AT TIME ZONE 'UTC')
          GROUP BY 1 ORDER BY count DESC, label ASC`,
      ]);

    let mrr: M.Money = M.ZERO;
    for (const s of active) {
      const yearly = s.billingCycle === 'YEARLY';
      const price = s.priceOverride ?? (yearly ? s.plan.priceYearly : s.plan.priceMonthly);
      if (price === null || price === undefined) continue;
      mrr = M.add(mrr, yearly ? M.round2(M.money(price).div(12)) : price);
    }

    const converted = trials90.filter((t) => t.status === 'ACTIVE' || t.status === 'PAST_DUE').length;
    const churned = new Set([...cancelled, ...lost].map((s) => s.businessId));

    return {
      mrr: M.round2(mrr),
      trialsStartedThisMonth: trialsThisMonth,
      trialToPaid: trials90.length ? Math.round((converted / trials90.length) * 10000) / 10000 : 0,
      trialToPaidCounts: { started: trials90.length, converted },
      churned: churned.size,
      totalGmv30: M.round2(gmv[0]?.gmv ?? 0),
      signupsByCity: byCity.map((r) => ({ city: r.label, count: r.count })),
      signupsByMarket: byMarket.map((r) => ({ market: r.label, count: r.count })),
    };
  }

  // -------------------------------------------------------- usage statement

  /**
   * Totals from TenantDailyUsage for full days only (today is never included).
   * `from`/`to` are inclusive YYYY-MM-DD; defaults to the last 30 full days.
   */
  async getUsageStatement(businessId: string, fromIn?: string, toIn?: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException(`Business ${businessId} not found`);

    const yesterday = addDays(karachiDateOnly(new Date()), -1);
    let to = toIn ? toUsageDate(toIn) : yesterday;
    if (to.getTime() > yesterday.getTime()) to = yesterday;
    const from = fromIn ? toUsageDate(fromIn) : addDays(to, -29);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must not be after to (today is excluded)');
    }
    if ((to.getTime() - from.getTime()) / DAY_MS > 366) {
      throw new BadRequestException('Period may not exceed 366 days');
    }

    const where = { businessId, date: { gte: from, lte: to } };
    const [agg, last, staff] = await Promise.all([
      this.prisma.tenantDailyUsage.aggregate({
        where,
        _sum: {
          ordersCount: true,
          gmv: true,
          itemsSold: true,
          returnsCount: true,
          paymentsReceived: true,
        },
        _max: { activeUsers: true },
        _count: { _all: true },
      }),
      this.prisma.tenantDailyUsage.findFirst({
        where,
        orderBy: { date: 'desc' },
        select: { duesOpenReceivable: true, duesOpenPayable: true },
      }),
      this.prisma.user.count({ where: { businessId, deactivatedAt: null } }),
    ]);

    const orders = agg._sum.ordersCount ?? 0;
    return {
      businessId,
      businessName: business.name,
      from: usageDateString(from),
      to: usageDateString(to),
      daysCovered: agg._count._all,
      orders,
      gmv: M.round2(agg._sum.gmv ?? 0),
      itemsSold: agg._sum.itemsSold ?? 0,
      returns: agg._sum.returnsCount ?? 0,
      paymentsReceived: M.round2(agg._sum.paymentsReceived ?? 0),
      invoicesPrinted: orders,
      activeStaff: agg._max.activeUsers ?? 0,
      staffTotal: staff,
      duesOpenReceivable: M.round2(last?.duesOpenReceivable ?? 0),
      duesOpenPayable: M.round2(last?.duesOpenPayable ?? 0),
    };
  }

  async buildUsageStatementPdf(businessId: string, from?: string, to?: string) {
    const s = await this.getUsageStatement(businessId, from, to);
    const buffer = await buildUsageStatementPdf({
      appName: process.env.APP_NAME || 'DeepKhata',
      businessName: s.businessName,
      from: s.from,
      to: s.to,
      daysCovered: s.daysCovered,
      orders: s.orders,
      gmv: s.gmv.toFixed(2),
      itemsSold: s.itemsSold,
      returns: s.returns,
      paymentsReceived: s.paymentsReceived.toFixed(2),
      invoicesPrinted: s.invoicesPrinted,
      activeStaff: s.activeStaff,
      duesOpenReceivable: s.duesOpenReceivable.toFixed(2),
      duesOpenPayable: s.duesOpenPayable.toFixed(2),
    });
    return { buffer, filename: `usage-statement-${s.from}-to-${s.to}.pdf` };
  }
}
