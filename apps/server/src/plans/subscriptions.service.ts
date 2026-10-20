import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingCycle,
  BusinessStatus,
  Plan,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { Db } from './plan-limits.service';

export interface EffectiveStatus {
  status: 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED';
  subscriptionExpiresAt: Date | null;
  subscriptionStatus: SubscriptionStatus | null;
  planCode: string | null;
}

export interface ExtendOptions {
  months?: number;
  years?: number;
  /** Set the period end to exactly this date instead of adding a period. */
  until?: Date;
  planId?: string;
  billingCycle?: BillingCycle;
}

type SubWithPlan = Subscription & { plan: Plan };

/** Adds calendar months in UTC, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsUtc(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Pure mapping from a Subscription to the status the kill switch enforces. */
export function computeEffectiveStatus(
  sub: SubWithPlan,
  now: Date,
): EffectiveStatus {
  const base = {
    subscriptionStatus: sub.status,
    planCode: sub.plan.code,
  };
  const passed = (d: Date | null) => d !== null && d.getTime() <= now.getTime();

  switch (sub.status) {
    case 'TRIALING':
      return {
        ...base,
        status:
          passed(sub.trialEndsAt) || passed(sub.currentPeriodEnd)
            ? 'READ_ONLY'
            : 'ACTIVE',
        subscriptionExpiresAt: sub.trialEndsAt ?? sub.currentPeriodEnd,
      };
    case 'ACTIVE':
      return {
        ...base,
        // trialEndsAt is history once converted; only the paid period counts.
        status: passed(sub.currentPeriodEnd) ? 'READ_ONLY' : 'ACTIVE',
        subscriptionExpiresAt: sub.currentPeriodEnd,
      };
    case 'PAST_DUE':
      // No grace date means no grace was granted.
      return {
        ...base,
        status:
          sub.graceEndsAt && sub.graceEndsAt.getTime() > now.getTime()
            ? 'ACTIVE'
            : 'READ_ONLY',
        subscriptionExpiresAt: sub.currentPeriodEnd,
      };
    case 'READ_ONLY':
      return {
        ...base,
        status: 'READ_ONLY',
        subscriptionExpiresAt: sub.currentPeriodEnd,
      };
    default:
      return {
        ...base,
        status: 'SUSPENDED',
        subscriptionExpiresAt: sub.currentPeriodEnd,
      };
  }
}

function toBusinessStatus(status: SubscriptionStatus): BusinessStatus {
  switch (status) {
    case 'READ_ONLY':
      return BusinessStatus.READ_ONLY;
    case 'SUSPENDED':
    case 'CANCELLED':
      return BusinessStatus.SUSPENDED;
    default:
      return BusinessStatus.ACTIVE;
  }
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCache: TenantCacheService,
  ) {}

  /** `now` is injectable so tests can fake the clock. */
  async getEffectiveStatus(
    businessId: string,
    now: Date = new Date(),
  ): Promise<EffectiveStatus> {
    const sub = await this.prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!sub) {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: { status: true, subscriptionExpiresAt: true },
      });
      if (!business) throw new NotFoundException('Business not found');
      return {
        status: business.status,
        subscriptionExpiresAt: business.subscriptionExpiresAt,
        subscriptionStatus: null,
        planCode: null,
      };
    }
    return computeEffectiveStatus(sub, now);
  }

  async startTrial(businessId: string, tx?: Db, now: Date = new Date()) {
    const run = async (db: Db) => {
      const plan = await db.plan.findUnique({ where: { code: 'TRIAL' } });
      if (!plan) throw new NotFoundException('Plan TRIAL is not configured');
      const trialEndsAt = new Date(
        now.getTime() + (plan.trialDays ?? 30) * 86_400_000,
      );
      const sub = await db.subscription.upsert({
        where: { businessId },
        create: {
          businessId,
          planId: plan.id,
          status: 'TRIALING',
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
        },
        update: {
          planId: plan.id,
          status: 'TRIALING',
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          graceEndsAt: null,
        },
      });
      await this.mirrorBusiness(db, sub);
      return sub;
    };
    return this.withTx(tx, businessId, run);
  }

  /**
   * New period end = max(now, currentPeriodEnd) + period (or exactly `until`).
   * Sets the subscription ACTIVE and clears the grace window.
   */
  async extend(
    businessId: string,
    opts: ExtendOptions,
    tx?: Db,
    now: Date = new Date(),
  ) {
    const run = async (db: Db) => {
      const existing = await db.subscription.findUnique({
        where: { businessId },
      });

      let planId = opts.planId ?? existing?.planId;
      if (!planId) {
        const custom = await db.plan.findUnique({ where: { code: 'CUSTOM' } });
        if (!custom) throw new NotFoundException('Plan CUSTOM is not configured');
        planId = custom.id;
      } else if (opts.planId) {
        const plan = await db.plan.findUnique({ where: { id: opts.planId } });
        if (!plan) throw new NotFoundException('Plan not found');
      }

      const billingCycle =
        opts.billingCycle ??
        (opts.years ? BillingCycle.YEARLY : (existing?.billingCycle ?? 'MONTHLY'));

      const currentEnd = existing?.currentPeriodEnd ?? null;
      const periodExpired = !currentEnd || currentEnd.getTime() < now.getTime();
      let periodEnd: Date;
      if (opts.until) {
        periodEnd = opts.until;
      } else {
        const base = periodExpired ? now : (currentEnd as Date);
        const months = (opts.months ?? 0) + (opts.years ?? 0) * 12;
        periodEnd = addMonthsUtc(base, months);
      }

      const sub = await db.subscription.upsert({
        where: { businessId },
        create: {
          businessId,
          planId,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          billingCycle,
        },
        update: {
          planId,
          status: 'ACTIVE',
          billingCycle,
          currentPeriodStart: periodExpired
            ? now
            : (existing?.currentPeriodStart ?? now),
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
        },
      });
      await this.mirrorBusiness(db, sub);
      return sub;
    };
    return this.withTx(tx, businessId, run);
  }

  async setStatus(businessId: string, status: SubscriptionStatus, tx?: Db) {
    const run = async (db: Db) => {
      const existing = await db.subscription.findUnique({
        where: { businessId },
      });
      if (!existing) throw new NotFoundException('Subscription not found');
      const sub = await db.subscription.update({
        where: { businessId },
        data: { status },
      });
      await this.mirrorBusiness(db, sub);
      return sub;
    };
    return this.withTx(tx, businessId, run);
  }

  /**
   * Compatibility mirror: until the kill switch reads the subscription via
   * getEffectiveStatus, the guard still reads Business.status and
   * Business.subscriptionExpiresAt. Every Subscription change writes both so
   * the current guard keeps working.
   */
  private async mirrorBusiness(db: Db, sub: Subscription) {
    const expiresAt =
      sub.status === 'TRIALING'
        ? (sub.trialEndsAt ?? sub.currentPeriodEnd)
        : sub.currentPeriodEnd;
    await db.business.update({
      where: { id: sub.businessId },
      data: {
        status: toBusinessStatus(sub.status),
        subscriptionExpiresAt: expiresAt,
      },
    });
  }

  /** Runs in the caller's transaction, or in its own (then drops the tenant cache). */
  private async withTx<T>(
    tx: Db | undefined,
    businessId: string,
    run: (db: Db) => Promise<T>,
  ): Promise<T> {
    if (tx) return run(tx);
    const result = await this.prisma.$transaction((db) => run(db));
    this.tenantCache.invalidateBusiness(businessId);
    return result;
  }
}
