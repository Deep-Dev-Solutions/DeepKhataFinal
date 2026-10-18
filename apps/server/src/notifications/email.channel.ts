import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { DigestRow } from '../mail/mail.types';
import { DuesService, DueItem } from '../dues/dues.service';
import * as D from '../common/dates';
import * as M from '../common/money';

export interface EmailChannelMessage {
  businessId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

const DIGEST_ROWS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function effectiveDue(item: DueItem): Date {
  return item.promiseDate && item.promiseDate > item.dueDate
    ? item.promiseDate
    : item.dueDate;
}

function toRow(item: DueItem): DigestRow {
  return {
    party: item.partyName,
    amount: M.round2(item.amountOpen).toFixed(2),
    dueDate: D.karachiDateString(effectiveDue(item)),
  };
}

/** Sends a notification to one user's email address through MailService. */
@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly dues: DuesService,
  ) {}

  /** Never throws: a mail problem must not break the in-app notification. */
  async send(message: EmailChannelMessage): Promise<void> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { id: message.userId, businessId: message.businessId },
        select: { email: true },
      });
      if (!user?.email) return;

      if (message.type.includes('digest')) {
        await this.sendDigest(user.email, message);
        return;
      }
      await this.mail.send(
        'notification',
        user.email,
        {
          title: message.title,
          body: message.body,
          ...(message.link ? { link: message.link } : {}),
        },
        { businessId: message.businessId },
      );
    } catch (e) {
      this.logger.error(
        `Email for user ${message.userId} (${message.type}) failed: ${(e as Error).message}`,
      );
    }
  }

  private async sendDigest(
    to: string,
    message: EmailChannelMessage,
  ): Promise<void> {
    const now = new Date();
    const [business, items] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: message.businessId },
        select: { name: true },
      }),
      this.dues.listOpen(message.businessId, undefined, now),
    ]);
    const byDue = (a: DueItem, b: DueItem) =>
      effectiveDue(a).getTime() - effectiveDue(b).getTime();
    const receivables = items
      .filter(
        (i) =>
          i.direction === 'RECEIVABLE' &&
          D.daysBetween(now, effectiveDue(i)) <= 0,
      )
      .sort(byDue)
      .slice(0, DIGEST_ROWS)
      .map(toRow);
    const payables = items
      .filter(
        (i) =>
          i.direction === 'PAYABLE' &&
          effectiveDue(i).getTime() - now.getTime() <= 7 * DAY_MS,
      )
      .sort(byDue)
      .slice(0, DIGEST_ROWS)
      .map(toRow);
    await this.mail.send(
      'digest',
      to,
      {
        businessName: business?.name ?? '',
        receivables,
        payables,
      },
      { businessId: message.businessId },
    );
  }
}
