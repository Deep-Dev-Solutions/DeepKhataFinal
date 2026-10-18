import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PlanResource = 'branches' | 'users' | 'products';

export type Db = Prisma.TransactionClient;

export interface PlanLimits {
  plan: { code: string; name: string };
  maxBranches: number | null;
  maxUsers: number | null;
  maxProducts: number | null;
}

export interface PlanUsage {
  branches: number;
  users: number;
  products: number;
}

/**
 * Fallback for a business that somehow has no Subscription row: the caps that
 * were hardcoded before plans moved to the database (2 branches, 5 users).
 */
const LEGACY_LIMITS: PlanLimits = {
  plan: { code: 'CUSTOM', name: 'Custom' },
  maxBranches: 2,
  maxUsers: 5,
  maxProducts: null,
};

const LIMIT_KEYS = {
  branches: 'maxBranches',
  users: 'maxUsers',
  products: 'maxProducts',
} as const;

function readLimit(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective limits: Subscription.customLimits keys override Plan columns. null = unlimited. */
  async getLimits(businessId: string, tx?: Db): Promise<PlanLimits> {
    const db = tx ?? this.prisma;
    const sub = await db.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!sub) return { ...LEGACY_LIMITS, plan: { ...LEGACY_LIMITS.plan } };

    const custom =
      sub.customLimits &&
      typeof sub.customLimits === 'object' &&
      !Array.isArray(sub.customLimits)
        ? (sub.customLimits as Record<string, unknown>)
        : {};
    const pick = (key: 'maxBranches' | 'maxUsers' | 'maxProducts') => {
      const override = readLimit(custom[key]);
      return override !== undefined ? override : sub.plan[key];
    };

    return {
      plan: { code: sub.plan.code, name: sub.plan.name },
      maxBranches: pick('maxBranches'),
      maxUsers: pick('maxUsers'),
      maxProducts: pick('maxProducts'),
    };
  }

  /** Users = active members + pending, unexpired invitations. */
  async getUsage(businessId: string, tx?: Db): Promise<PlanUsage> {
    const db = tx ?? this.prisma;
    const now = new Date();
    const [branches, members, pending, products] = await Promise.all([
      db.branch.count({ where: { businessId, deletedAt: null } }),
      db.user.count({ where: { businessId, deactivatedAt: null } }),
      db.invitation.count({
        where: {
          businessId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      db.product.count({ where: { businessId, deletedAt: null } }),
    ]);
    return { branches, users: members + pending, products };
  }

  /**
   * Throws 403 PLAN_LIMIT_REACHED when used + adding would exceed the limit.
   * The SUPER_ADMIN bypass lives at the call sites.
   */
  async assert(
    businessId: string,
    resource: PlanResource,
    adding = 1,
    tx?: Db,
  ): Promise<void> {
    const limits = await this.getLimits(businessId, tx);
    const limit = limits[LIMIT_KEYS[resource]];
    if (limit === null) return;

    const usage = await this.getUsage(businessId, tx);
    const used = usage[resource];
    if (used + adding > limit) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_LIMIT_REACHED',
        resource,
        limit,
        used,
        plan: limits.plan.code,
        message: `Plan limit reached: ${limit} ${resource} on ${limits.plan.name}`,
      });
    }
  }
}
