import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BusinessStatus, InstanceStatus, RegisterStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RuleKey } from '../notifications/defaults';
import { DuesService, DueItem } from '../dues/dues.service';
import * as D from '../common/dates';
import * as M from '../common/money';

function fmt(v: M.Money): string {
  return M.toApi(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** "HH:MM" of the Karachi wall clock for the instant `d`. */
function karachiTime(d: Date): string {
  return new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

function effectiveDue(item: DueItem): Date {
  return item.promiseDate && item.promiseDate > item.dueDate
    ? item.promiseDate
    : item.dueDate;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly dues: DuesService,
  ) {}

  @Cron('*/15 * * * *', { timeZone: 'Asia/Karachi', name: 'reminders' })
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runTick();
    } catch (e) {
      this.logger.error(`Reminder tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async runTick(
    now: Date = new Date(),
  ): Promise<{ businesses: number; fired: number }> {
    const businesses = await this.prisma.business.findMany({
      where: { status: { not: BusinessStatus.SUSPENDED } },
      select: { id: true },
    });
    let fired = 0;
    for (const b of businesses) {
      try {
        fired += await this.runForBusiness(b.id, now);
      } catch (e) {
        this.logger.error(
          `Reminders failed for business ${b.id}: ${(e as Error).message}`,
        );
      }
    }
    return { businesses: businesses.length, fired };
  }

  async runForBusiness(
    businessId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { status: true },
    });
    if (!business || business.status === BusinessStatus.SUSPENDED) return 0;

    const settings = await this.notifications.getEffectiveSettings(businessId);
    const rules = settings.rules;
    const fireDate = D.karachiDateOnly(now);
    let fired = 0;

    const fire = async (
      ruleKey: RuleKey,
      entityId: string,
      payload: {
        title: string;
        body: string;
        link?: string;
        entityType?: string;
        branchId?: string | null;
      },
    ): Promise<void> => {
      const first = await this.notifications.tryLog(
        businessId,
        ruleKey,
        entityId,
        fireDate,
      );
      if (!first) return;
      await this.notifications.notify({
        businessId,
        type: ruleKey,
        entityId,
        ...payload,
      });
      fired += 1;
    };

    // ---- Dues rules ----
    const dueRulesOn =
      rules['receivable.due_soon'].enabled ||
      rules['receivable.due_today'].enabled ||
      rules['receivable.overdue'].enabled ||
      rules['payable.due_soon'].enabled ||
      rules['payable.overdue'].enabled ||
      rules['promise.broken'].enabled ||
      rules['digest.daily'].enabled;

    if (dueRulesOn) {
      const items = await this.dues.listOpen(businessId, undefined, now);

      for (const item of items) {
        const snoozed = item.snoozedUntil !== null && item.snoozedUntil > now;
        const due = effectiveDue(item);
        const untilDue = D.daysBetween(now, due);
        const overdueDays = D.daysBetween(due, now);
        const isRec = item.direction === 'RECEIVABLE';
        const prefix = isRec ? 'receivable' : 'payable';
        const amount = fmt(item.amountOpen);
        const base = {
          link: item.link,
          entityType: item.entityType as string,
        };

        if (!snoozed) {
          const soon = rules[`${prefix}.due_soon` as RuleKey];
          if (
            soon.enabled &&
            soon.daysBefore !== undefined &&
            untilDue === soon.daysBefore &&
            untilDue > 0
          ) {
            await fire(`${prefix}.due_soon` as RuleKey, item.entityId, {
              ...base,
              title: isRec ? 'Wasooli kal' : 'Dena hai',
              body: isRec
                ? `${item.partyName} se Rs ${amount} lene hain — ${untilDue} din mein due (${item.reference})`
                : `${item.partyName} ko Rs ${amount} dene hain — ${untilDue} din mein due (${item.reference})`,
            });
          }

          if (
            isRec &&
            rules['receivable.due_today'].enabled &&
            untilDue === 0
          ) {
            await fire('receivable.due_today', item.entityId, {
              ...base,
              title: 'Aaj wasooli',
              body: `${item.partyName} se Rs ${amount} lene hain — aaj due (${item.reference})`,
            });
          }

          const overdue = rules[`${prefix}.overdue` as RuleKey];
          if (
            overdue.enabled &&
            overdue.offsetsDays?.includes(overdueDays) &&
            overdueDays > 0
          ) {
            await fire(`${prefix}.overdue` as RuleKey, item.entityId, {
              ...base,
              title: isRec ? 'Wasooli overdue' : 'Payment overdue',
              body: isRec
                ? `${item.partyName} se Rs ${amount} lene hain — ${overdueDays} din overdue (${item.reference})`
                : `${item.partyName} ko Rs ${amount} dene hain — ${overdueDays} din overdue (${item.reference})`,
            });
          }
        }

        if (
          rules['promise.broken'].enabled &&
          item.promiseDate &&
          D.daysBetween(item.promiseDate, now) === 1
        ) {
          await fire('promise.broken', item.entityId, {
            ...base,
            title: 'Wada toot gaya',
            body: `${item.partyName} ne Rs ${amount} ka wada kiya tha (${D.karachiDateString(item.promiseDate)}), abhi tak baqi hai (${item.reference})`,
          });
        }
      }

      // ---- Daily digest ----
      const digest = rules['digest.daily'];
      if (digest.enabled && karachiTime(now) >= settings.digestTime) {
        let recvCount = 0;
        let recvAmount = M.ZERO;
        let todayCount = 0;
        let todayAmount = M.ZERO;
        let payCount = 0;
        let payAmount = M.ZERO;
        for (const item of items) {
          const due = effectiveDue(item);
          const untilDue = D.daysBetween(now, due);
          if (item.direction === 'RECEIVABLE') {
            if (untilDue < 0) {
              recvCount += 1;
              recvAmount = M.add(recvAmount, item.amountOpen);
            } else if (untilDue === 0) {
              todayCount += 1;
              todayAmount = M.add(todayAmount, item.amountOpen);
            }
          } else if (untilDue <= 7) {
            payCount += 1;
            payAmount = M.add(payAmount, item.amountOpen);
          }
        }
        await fire('digest.daily', businessId, {
          title: 'Aaj ka khulasa',
          body:
            `Wasooli overdue: ${recvCount} (Rs ${fmt(recvAmount)}). ` +
            `Aaj due: ${todayCount} (Rs ${fmt(todayAmount)}). ` +
            `Is hafte dena hai: ${payCount} (Rs ${fmt(payAmount)}).`,
          link: '/dues',
        });
      }
    }

    // ---- Register not closed ----
    const reg = rules['register.not_closed'];
    if (reg.enabled && karachiTime(now) >= (reg.time ?? '23:00')) {
      const sessions = await this.prisma.cashRegisterSession.findMany({
        where: { businessId, status: RegisterStatus.OPEN },
        select: { id: true, branchId: true },
      });
      for (const s of sessions) {
        await fire('register.not_closed', s.id, {
          title: 'Galla band nahi hua',
          body: 'Aaj ka galla abhi tak band nahi hua — close karke hisaab milayein.',
          link: '/cash',
          entityType: 'CashRegisterSession',
          branchId: s.branchId,
        });
      }
    }

    // ---- Low stock ----
    if (rules['stock.low'].enabled) {
      await this.lowStock(businessId, fire);
    }

    return fired;
  }

  private async lowStock(
    businessId: string,
    fire: (
      key: RuleKey,
      entityId: string,
      p: { title: string; body: string; link?: string; entityType?: string },
    ) => Promise<void>,
  ): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        deletedAt: null,
        lowStockThreshold: { not: null },
      },
      select: { id: true, name: true, lowStockThreshold: true },
    });
    if (products.length === 0) return;
    const counts = await this.prisma.productInstance.groupBy({
      by: ['productId'],
      where: {
        productId: { in: products.map((p) => p.id) },
        status: InstanceStatus.AVAILABLE,
      },
      _count: { _all: true },
    });
    const byProduct = new Map(counts.map((c) => [c.productId, c._count._all]));
    for (const p of products) {
      const available = byProduct.get(p.id) ?? 0;
      const threshold = p.lowStockThreshold as number;
      if (available < threshold) {
        await fire('stock.low', p.id, {
          title: 'Maal kam hai',
          body: `${p.name} sirf ${available} bacha hai (kam az kam ${threshold} chahiye)`,
          link: `/products/${p.id}`,
          entityType: 'Product',
        });
      }
    }
  }
}
