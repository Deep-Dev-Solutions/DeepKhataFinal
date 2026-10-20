import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgencyTaskType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import { daysBetween } from '../common/dates';

/** Informational steps still fire this many days late (missed cron runs). */
const CATCH_UP_DAYS = 2;

interface TrialRow {
  businessId: string;
  status: string;
  trialEndsAt: Date | null;
  start: Date;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
}

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Karachi', name: 'trial-lifecycle' })
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (e) {
      this.logger.error(`Trial lifecycle run failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Walks every trial subscription once. Each step is recorded in
   * LifecycleMessage (`trial-dayN`), so repeat runs and late runs are safe.
   * `opts.businessId` limits the run to one tenant (tests, manual re-runs).
   * Returns the number of steps performed.
   */
  async run(
    now: Date = new Date(),
    opts: { businessId?: string } = {},
  ): Promise<number> {
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['TRIALING', 'READ_ONLY'] },
        plan: { code: 'TRIAL' },
        ...(opts.businessId ? { businessId: opts.businessId } : {}),
      },
      select: {
        businessId: true,
        status: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        business: {
          select: { name: true, owner: { select: { name: true, email: true } } },
        },
      },
    });

    let performed = 0;
    for (const s of subs) {
      const row: TrialRow = {
        businessId: s.businessId,
        status: s.status,
        trialEndsAt: s.trialEndsAt,
        start: s.currentPeriodStart,
        businessName: s.business.name,
        ownerName: s.business.owner.name,
        ownerEmail: s.business.owner.email,
      };
      try {
        performed += await this.processTrial(row, now);
      } catch (e) {
        this.logger.error(
          `Lifecycle failed for business ${s.businessId}: ${(e as Error).message}`,
        );
      }
    }
    return performed;
  }

  private async processTrial(t: TrialRow, now: Date): Promise<number> {
    const days = daysBetween(t.start, now);
    let performed = 0;
    const within = (n: number) => days >= n && days <= n + CATCH_UP_DAYS;

    if (within(3)) {
      performed += await this.step(t.businessId, 'trial-day3', async () => {
        await this.mail.send(
          'trial-tips',
          t.ownerEmail,
          { name: t.ownerName },
          { businessId: t.businessId },
        );
        await this.task(t.businessId, 'FOLLOW_UP', now, `Day 3 follow-up for ${t.businessName}`);
      });
    }

    if (within(7)) {
      performed += await this.step(t.businessId, 'trial-day7', async () => {
        const usage = await this.usage(t.businessId);
        await this.mail.send(
          'trial-usage',
          t.ownerEmail,
          { name: t.ownerName, ...usage },
          { businessId: t.businessId },
        );
      });
    }

    if (within(25)) {
      performed += await this.step(t.businessId, 'trial-day25', async () => {
        const daysLeft = t.trialEndsAt
          ? Math.max(0, daysBetween(now, t.trialEndsAt))
          : 5;
        await this.mail.send(
          'trial-ending',
          t.ownerEmail,
          { name: t.ownerName, daysLeft, payUrl: this.payUrl() },
          { businessId: t.businessId },
        );
        await this.task(
          t.businessId,
          'CONVERSION',
          now,
          `Trial of ${t.businessName} ends in ${daysLeft} days. Ask about converting.`,
        );
      });
    }

    if (days >= 30) {
      performed += await this.step(t.businessId, 'trial-day30', async () => {
        if (t.status === 'TRIALING') {
          await this.subscriptions.setStatus(t.businessId, 'READ_ONLY');
        }
        await this.mail.send(
          'trial-ended',
          t.ownerEmail,
          { name: t.ownerName, payInstructions: this.payInstructions() },
          { businessId: t.businessId },
        );
      });
    }

    if (days >= 45) {
      performed += await this.step(t.businessId, 'trial-day45', async () => {
        await this.mail.send(
          'trial-reminder',
          t.ownerEmail,
          { name: t.ownerName },
          { businessId: t.businessId },
        );
        const sub = await this.prisma.subscription.findUnique({
          where: { businessId: t.businessId },
          select: { status: true },
        });
        if (sub && sub.status !== 'ACTIVE') {
          await this.prisma.business.updateMany({
            where: { id: t.businessId, followUpStatus: { not: 'CONVERTED' } },
            data: { followUpStatus: 'LOST' },
          });
        }
      });
    }

    return performed;
  }

  /** Claims the key (unique row) before acting; releases it if the action throws. */
  private async step(
    businessId: string,
    key: string,
    action: () => Promise<void>,
  ): Promise<number> {
    try {
      await this.prisma.lifecycleMessage.create({ data: { businessId, key } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return 0;
      }
      throw e;
    }
    try {
      await action();
      return 1;
    } catch (e) {
      await this.prisma.lifecycleMessage.deleteMany({ where: { businessId, key } });
      throw e;
    }
  }

  private task(businessId: string, type: AgencyTaskType, dueAt: Date, notes: string) {
    return this.prisma.agencyTask.create({
      data: { businessId, type, dueAt, notes },
    });
  }

  private async usage(businessId: string) {
    const [sales, dues] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          businessId,
          status: { notIn: ['CANCELLED', 'ESTIMATE', 'RETURNED'] },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.khataEntry.count({
        where: {
          businessId,
          direction: 'RECEIVABLE',
          deletedAt: null,
          status: { in: ['OPEN', 'PARTIAL'] },
        },
      }),
    ]);
    return {
      salesCount: sales._count._all,
      salesTotal: (sales._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      duesTracked: dues,
    };
  }

  private payUrl(): string {
    return (
      process.env.AGENCY_PAY_URL?.trim() ||
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/settings/billing`
    );
  }

  private payInstructions(): string {
    return (
      process.env.AGENCY_BANK_DETAILS?.trim() ||
      'Please contact the DeepKhata team to renew your subscription.'
    );
  }
}
