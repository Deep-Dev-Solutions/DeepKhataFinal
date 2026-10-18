import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  MailAttachment,
  MailTransport,
  TemplateData,
  TemplateName,
} from './mail.types';
import { renderTemplate } from './templates';
import { createTransportFromEnv, defaultFrom } from './transports';

export interface SendOptions {
  businessId?: string;
  attachments?: MailAttachment[];
}

export interface SendResult {
  id: string;
  status: 'SENT' | 'QUEUED' | 'FAILED';
}

/** Delay before retry 1, 2 and 3. A failure after the third retry is final. */
export const RETRY_DELAYS_MS: readonly number[] = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
];
/** A claimed row is invisible to other workers for this long. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

interface StoredAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

interface StoredPayload {
  data: unknown;
  attachments?: StoredAttachment[];
}

let instance: MailService | null = null;

/** Accessor for non-injectable code (e.g. utils/mailer.ts). Null until the app boots. */
export function getMailService(): MailService | null {
  return instance;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transport: MailTransport | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {
    instance = this;
  }

  onModuleInit(): void {
    instance = this;
  }

  /** Lazily created so importing the module never opens a connection. */
  private getTransport(): MailTransport {
    if (!this.transport) this.transport = createTransportFromEnv();
    return this.transport;
  }

  /** Overrides the transport (tests); pass null to go back to env selection. */
  setTransport(transport: MailTransport | null): void {
    this.transport = transport;
  }

  async send<T extends TemplateName>(
    template: T,
    to: string,
    data: TemplateData[T],
    opts: SendOptions = {},
  ): Promise<SendResult> {
    const rendered = renderTemplate(template, data);
    const payload: StoredPayload = {
      data,
      ...(opts.attachments?.length
        ? {
            attachments: opts.attachments.map((a) => ({
              filename: a.filename,
              contentBase64: a.content.toString('base64'),
              contentType: a.contentType,
            })),
          }
        : {}),
    };
    const row = await this.prisma.emailLog.create({
      data: {
        businessId: opts.businessId ?? null,
        to,
        template,
        subject: rendered.subject,
        status: EmailStatus.QUEUED,
        payload: payload as unknown as Prisma.InputJsonValue,
        nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS),
      },
      select: { id: true },
    });
    const status = await this.attempt(row.id, new Date());
    return { id: row.id, status };
  }

  /**
   * Performs one delivery attempt for a log row and records the outcome.
   * `now` drives the retry schedule so tests can use a fake clock.
   */
  private async attempt(
    id: string,
    now: Date,
  ): Promise<'SENT' | 'QUEUED' | 'FAILED'> {
    const row = await this.prisma.emailLog.findUniqueOrThrow({
      where: { id },
    });
    const attempts = row.attempts + 1;
    try {
      const stored = (row.payload ?? {}) as unknown as StoredPayload;
      const rendered = renderTemplate(
        row.template as TemplateName,
        stored.data as TemplateData[TemplateName],
      );
      const result = await this.getTransport().send({
        from: defaultFrom(),
        to: row.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: stored.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.contentBase64, 'base64'),
          contentType: a.contentType,
        })),
      });
      await this.prisma.emailLog.update({
        where: { id },
        data: {
          status: EmailStatus.SENT,
          attempts,
          providerId: result.providerId,
          error: null,
          nextAttemptAt: null,
          sentAt: new Date(),
        },
      });
      return 'SENT';
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      // attempts 1..3 schedule retry 1..3; the 4th failed attempt is final.
      const delay = RETRY_DELAYS_MS[attempts - 1];
      const final = delay === undefined;
      this.logger.warn(
        `Email ${id} (${row.template}) attempt ${attempts} failed: ${message}`,
      );
      await this.prisma.emailLog.update({
        where: { id },
        data: {
          status: final ? EmailStatus.FAILED : EmailStatus.QUEUED,
          attempts,
          error: message.slice(0, 1000),
          nextAttemptAt: final ? null : new Date(now.getTime() + delay),
        },
      });
      return final ? 'FAILED' : 'QUEUED';
    }
  }

  @Cron('* * * * *', { timeZone: 'Asia/Karachi', name: 'mail-retry' })
  async handleRetryCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.retryDue();
    } catch (e) {
      this.logger.error(`Mail retry tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Retries every QUEUED row whose nextAttemptAt has passed. Each row is claimed
   * with an atomic conditional update (lease), so concurrent workers never send
   * the same email twice. Returns the number of rows attempted.
   */
  async retryDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.emailLog.findMany({
      where: { status: EmailStatus.QUEUED, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 50,
      select: { id: true },
    });
    let attempted = 0;
    for (const { id } of due) {
      const claim = await this.prisma.emailLog.updateMany({
        where: {
          id,
          status: EmailStatus.QUEUED,
          nextAttemptAt: { lte: now },
        },
        data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
      });
      if (claim.count !== 1) continue;
      try {
        await this.attempt(id, now);
        attempted += 1;
      } catch (e) {
        this.logger.error(`Retry of ${id} crashed: ${(e as Error).message}`);
      }
    }
    return attempted;
  }
}
