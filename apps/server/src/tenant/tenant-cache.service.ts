import { Injectable } from '@nestjs/common';
import { BusinessStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 5_000;

export interface BusinessStatusInfo {
  status: BusinessStatus;
  subscriptionExpiresAt: Date | null;
}

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
  private readonly revoked = new Map<string, Entry<boolean>>();

  constructor(private readonly prisma: PrismaService) {}

  async getBusinessStatus(
    businessId: string,
  ): Promise<BusinessStatusInfo | null> {
    const now = Date.now();
    const hit = this.businesses.get(businessId);
    if (hit && hit.expiresAt > now) return hit.value;

    const row = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { status: true, subscriptionExpiresAt: true },
    });
    const value = row
      ? { status: row.status, subscriptionExpiresAt: row.subscriptionExpiresAt }
      : null;
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

  invalidateBusiness(businessId: string): void {
    this.businesses.delete(businessId);
  }

  invalidateBranches(businessId: string): void {
    this.branches.delete(businessId);
  }

  /** Record a revocation locally so this process rejects the token at once. */
  markRevoked(jti: string): void {
    this.revoked.set(jti, { value: true, expiresAt: Date.now() + TTL_MS });
  }

  async isRevoked(jti: string): Promise<boolean> {
    const now = Date.now();
    const hit = this.revoked.get(jti);
    if (hit && hit.expiresAt > now) return hit.value;

    const row = await this.prisma.revokedToken.findUnique({
      where: { jti },
      select: { jti: true },
    });
    const value = !!row;
    // Revocations are permanent for the token's life; negatives expire fast.
    this.revoked.set(jti, {
      value,
      expiresAt: now + (value ? TTL_MS : NEGATIVE_TTL_MS),
    });
    if (this.revoked.size > 10_000) this.sweepRevoked(now);
    return value;
  }

  private sweepRevoked(now: number): void {
    for (const [k, v] of this.revoked) {
      if (v.expiresAt <= now) this.revoked.delete(k);
    }
  }
}
