import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingCycle, InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { BillingService } from './billing.service';

const DAY_MS = 86_400_000;
/** Invoice this many days before the period ends. */
export const RENEWAL_LEAD_DAYS = 7;
/** Days a PAST_DUE tenant keeps working after the due date. */
export const GRACE_DAYS = 7;

export interface RenewalSummary {
  created: number;
  sent: number;
  overdue: number;
  readOnly: number;
}

@Injectable()
export class RenewalsService {
  private readonly logger = new Logger(RenewalsService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly subscriptions: SubscriptionsService,
    private readonly tenantCache: TenantCacheService,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'Asia/Karachi', name: 'billing-renewals' })
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const s = await this.runRenewals();
      this.logger.log(
        `Renewals: ${s.created} created, ${s.sent} sent, ${s.overdue} overdue, ${s.readOnly} read-only`,
      );
    } catch (e) {
      this.logger.error(`Renewal run failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Idempotent: each step only acts on rows that are not yet in the target state. */
  async runRenewals(
    now: Date = new Date(),
    opts: { businessId?: string } = {},
  ): Promise<RenewalSummary> {
    const summary: RenewalSummary = { created: 0, sent: 0, overdue: 0, readOnly: 0 };
    const scope = opts.businessId ? { businessId: opts.businessId } : {};

    // 1. Invoice the next period for ACTIVE subscriptions that end within 7 days.
    const due = await this.prisma.subscription.findMany({
      where: {
        ...scope,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { not: null, lte: new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY_MS) },
      },
      include: { plan: true },
    });
    for (const sub of due) {
      try {
        // CUSTOM deals are set manually by the agency; no auto-renewal invoice.
        if (sub.billingCycle === BillingCycle.CUSTOM) continue;
        const hasPrice =
          sub.priceOverride !== null ||
          (sub.billingCycle === BillingCycle.YEARLY
            ? sub.plan.priceYearly !== null
            : sub.plan.priceMonthly !== null);
        if (!hasPrice) continue;
        const invoice = await this.billing.createInvoice(
          {
            businessId: sub.businessId,
            billingCycle: sub.billingCycle,
            periodStart: (sub.currentPeriodEnd as Date).toISOString(),
          },
          { now, skipIfOpen: true },
        );
        if (!invoice) continue;
        summary.created++;
        await this.billing.send(invoice.id, now);
        summary.sent++;
      } catch (e) {
        this.logger.error(`Renewal invoice failed for ${sub.businessId}: ${(e as Error).message}`);
      }
    }

    // 2. Unpaid invoices past their due date become OVERDUE; the tenant gets a grace window.
    const late = await this.prisma.agencyInvoice.findMany({
      where: { ...scope, status: InvoiceStatus.SENT, dueDate: { lt: now } },
    });
    for (const inv of late) {
      try {
        const marked = await this.prisma.$transaction(async (tx) => {
          const res = await tx.agencyInvoice.updateMany({
            where: { id: inv.id, status: InvoiceStatus.SENT },
            data: { status: InvoiceStatus.OVERDUE },
          });
          if (res.count === 0) return false;
          const sub = await tx.subscription.findUnique({ where: { businessId: inv.businessId } });
          if (sub && sub.status === SubscriptionStatus.ACTIVE) {
            await tx.subscription.update({
              where: { businessId: inv.businessId },
              data: { graceEndsAt: new Date(inv.dueDate.getTime() + GRACE_DAYS * DAY_MS) },
            });
            await this.subscriptions.setStatus(inv.businessId, SubscriptionStatus.PAST_DUE, tx);
          }
          return true;
        });
        if (marked) {
          summary.overdue++;
          this.tenantCache.invalidateBusiness(inv.businessId);
        }
      } catch (e) {
        this.logger.error(`Overdue step failed for ${inv.number}: ${(e as Error).message}`);
      }
    }

    // 3. PAST_DUE tenants whose grace window has ended go read-only.
    const expired = await this.prisma.subscription.findMany({
      where: {
        ...scope,
        status: SubscriptionStatus.PAST_DUE,
        OR: [{ graceEndsAt: null }, { graceEndsAt: { lte: now } }],
      },
      select: { businessId: true },
    });
    for (const sub of expired) {
      try {
        await this.subscriptions.setStatus(sub.businessId, SubscriptionStatus.READ_ONLY);
        summary.readOnly++;
      } catch (e) {
        this.logger.error(`Read-only step failed for ${sub.businessId}: ${(e as Error).message}`);
      }
    }
    return summary;
  }
}
