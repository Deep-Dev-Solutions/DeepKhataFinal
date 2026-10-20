import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BusinessStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 5_000;

export interface BusinessStatusInfo {
  status: BusinessStatus;
  subscriptionExpiresAt: Date | null;
}

export interface UserAuthInfo {
  role: Role;
  businessId: string | null;
  banned: boolean;
  banExpires: Date | null;
  deactivatedAt: Date | null;
}

const USER_TTL_MS = 30_000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory, TTL-bound caches for per-request tenant lookups. Safe to lose:
 * every entry is re-derived from the database on a miss.
 */
@Injectable()
export class TenantCacheService {
  private readonly businesses = new Map<
    string,
    Entry<BusinessStatusInfo | null>
  >();
  private readonly branches = new Map<
    string,
    Entry<Set<string>> & { loadedAt: number }
  >();
  private readonly users = new Map<string, Entry<UserAuthInfo | null>>();

  constructor(
    private readonly prisma: PrismaService,
    // SubscriptionsService depends on this service, so it is resolved lazily.
    private readonly moduleRef: ModuleRef,
  ) {}

  async getBusinessStatus(
    businessId: string,
  ): Promise<BusinessStatusInfo | null> {
    const now = Date.now();
    const hit = this.businesses.get(businessId);
    if (hit && hit.expiresAt > now) return hit.value;

    let value: BusinessStatusInfo | null = null;
    try {
      // Imported lazily: subscriptions.service imports this file (cycle).
      const { SubscriptionsService: Subs } = await import(
        '../plans/subscriptions.service'
      );
      const eff = await this.moduleRef
        .get(Subs, { strict: false })
        .getEffectiveStatus(businessId, new Date(now));
      value = {
        status: eff.status,
        subscriptionExpiresAt: eff.subscriptionExpiresAt,
      };
    } catch (e) {
      if (!(e instanceof NotFoundException)) throw e;
    }
    this.businesses.set(businessId, {
      value,
      expiresAt: now + (value ? TTL_MS : NEGATIVE_TTL_MS),
    });
    return value;
  }

  async isBranchInBusiness(
    businessId: string,
    branchId: string,
  ): Promise<boolean> {
    const now = Date.now();
    let entry = this.branches.get(businessId);
    if (entry && entry.expiresAt > now && entry.value.has(branchId)) {
      return true;
    }
    // Miss (or expired): reload, but not more than once per NEGATIVE_TTL_MS so
    // that a freshly created branch is recognised without waiting for the TTL
    // while junk ids cannot force a query per request.
    if (!entry || entry.expiresAt <= now || now - entry.loadedAt >= NEGATIVE_TTL_MS) {
      const rows = await this.prisma.branch.findMany({
        where: { businessId, deletedAt: null },
        select: { id: true },
      });
      entry = {
        value: new Set(rows.map((r) => r.id)),
        expiresAt: now + TTL_MS,
        loadedAt: now,
      };
      this.branches.set(businessId, entry);
    }
    return entry.value.has(branchId);
  }

  /** Live role/business of a user (30 s cache, 5 s for missing users). */
  async getUserAuth(userId: string): Promise<UserAuthInfo | null> {
    const now = Date.now();
    const hit = this.users.get(userId);
    if (hit && hit.expiresAt > now) return hit.value;

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        businessId: true,
        banned: true,
        banExpires: true,
        deactivatedAt: true,
      },
    });
    const value = row
      ? {
          role: row.role,
          businessId: row.businessId,
          banned: !!row.banned,
          banExpires: row.banExpires,
          deactivatedAt: row.deactivatedAt,
        }
      : null;
    this.users.set(userId, {
      value,
      expiresAt: now + (value ? USER_TTL_MS : NEGATIVE_TTL_MS),
    });
    if (this.users.size > 10_000) {
      for (const [k, v] of this.users) {
        if (v.expiresAt <= now) this.users.delete(k);
      }
    }
    return value;
  }

  invalidateUser(userId: string): void {
    this.users.delete(userId);
  }

  invalidateBusiness(businessId: string): void {
    this.businesses.delete(businessId);
  }

  invalidateBranches(businessId: string): void {
    this.branches.delete(businessId);
  }
}
