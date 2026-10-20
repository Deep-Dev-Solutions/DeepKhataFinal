import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { TenantDailyUsage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, karachiDateOnly } from '../common/dates';
import {
  eachUsageDay,
  rollupDay,
  toUsageDate,
  upsertUsageRow,
  computeUsageMetrics,
} from './usage-compute';

/** Nightly TenantDailyUsage rollup. Every method is idempotent (upsert on [businessId, date]). */
@Injectable()
export class UsageRollupService {
  private readonly logger = new Logger(UsageRollupService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Recomputes and upserts one business for one Karachi calendar day. */
  async computeDay(
    businessId: string,
    date: Date | string,
  ): Promise<TenantDailyUsage> {
    const day = toUsageDate(date);
    const metrics = await computeUsageMetrics(this.prisma, day, businessId);
    return upsertUsageRow(this.prisma, businessId, day, metrics.get(businessId));
  }

  /** Recomputes one day for every business. Returns the number of rows written. */
  async rollup(date: Date | string): Promise<number> {
    return rollupDay(this.prisma, date);
  }

  /** Inclusive range, optionally for one business. Returns rows written. */
  async backfill(
    from: Date | string,
    to: Date | string,
    businessId?: string,
  ): Promise<{ days: number; rows: number }> {
    const days = eachUsageDay(toUsageDate(from), toUsageDate(to));
    let rows = 0;
    for (const day of days) {
      rows += await rollupDay(this.prisma, day, businessId);
    }
    return { days: days.length, rows };
  }

  @Cron('0 2 * * *', { timeZone: 'Asia/Karachi', name: 'tenant-usage-rollup' })
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const yesterday = addDays(karachiDateOnly(new Date()), -1);
      const rows = await this.rollup(yesterday);
      this.logger.log(`Usage rollup for ${yesterday.toISOString().slice(0, 10)}: ${rows} tenants`);
    } catch (e) {
      this.logger.error(`Usage rollup failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
