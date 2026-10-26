import { randomBytes } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AgencyInvoice,
  AgencyPayment,
  BillingCycle,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SubscriptionsService, addMonthsUtc, ExtendOptions } from '../plans/subscriptions.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import * as M from '../common/money';
import { CreateInvoiceDto, RecordPaymentDto } from './billing.dto';
import {
  AgencyDetails,
  agencyDetailsFromEnv,
  buildInvoicePdf,
  PdfLine,
} from './invoice-pdf';

const DAY_MS = 86_400_000;
const KARACHI_OFFSET_MS = 5 * 3_600_000;
const PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

/** Shape persisted inside AgencyInvoice.lines (the column is plain Json). */
interface StoredLine {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}
interface StoredLines {
  items: StoredLine[];
  planId: string | null;
  billingCycle: BillingCycle;
  periods: number;
}

export interface CreateInvoiceOptions {
  now?: Date;
  /** Renewal job: lock the subscription and return null when an invoice is already open. */
  skipIfOpen?: boolean;
}

type InvoiceWithBusiness = AgencyInvoice & {
  business: {
    name: string;
    phone: string | null;
    owner: { email: string; phone: string | null };
  };
};

/** Karachi calendar year of an instant (fixed UTC+5, no DST). */
function karachiYear(d: Date): number {
  return new Date(d.getTime() + KARACHI_OFFSET_MS).getUTCFullYear();
}

/** 23:59:59.999 Karachi time on the Karachi day `days` after `from`. */
export function endOfKarachiDay(from: Date, days: number): Date {
  const shifted = new Date(from.getTime() + KARACHI_OFFSET_MS + days * DAY_MS);
  const startUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(startUtc + DAY_MS - 1 - KARACHI_OFFSET_MS);
}

function readStored(raw: Prisma.JsonValue): StoredLines {
  if (Array.isArray(raw)) {
    return {
      items: raw as unknown as StoredLine[],
      planId: null,
      billingCycle: BillingCycle.MONTHLY,
      periods: 1,
    };
  }
  return raw as unknown as StoredLines;
}

/** wa.me wants digits with the country code; Pakistani numbers start 0 / 3 / 92 / +92. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(2);
  if (digits.startsWith('92')) return digits.length >= 11 ? digits : null;
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return digits.length >= 11 ? digits : null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly subscriptions: SubscriptionsService,
    private readonly tenantCache: TenantCacheService,
  ) {}

  agency(): AgencyDetails {
    return agencyDetailsFromEnv();
  }

  publicUrl(token: string): string {
    const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/i/${token}`;
  }

  // ---------------------------------------------------------------- create

  async createInvoice(
    dto: CreateInvoiceDto,
    opts: CreateInvoiceOptions = {},
  ): Promise<ReturnType<BillingService['view']> | null> {
    const now = opts.now ?? new Date();
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const created = await this.prisma.$transaction(async (tx) => {
      if (opts.skipIfOpen) {
        await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "businessId" = ${dto.businessId} FOR UPDATE`;
      }
      const sub = await tx.subscription.findUnique({
        where: { businessId: dto.businessId },
        include: { plan: true },
      });

      if (opts.skipIfOpen && sub?.currentPeriodEnd) {
        const open = await tx.agencyInvoice.findFirst({
          where: {
            businessId: dto.businessId,
            status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
            periodStart: { gte: sub.currentPeriodEnd },
          },
          select: { id: true },
        });
        if (open) return null;
      }

      const plan = dto.planId
        ? await tx.plan.findUnique({ where: { id: dto.planId } })
        : (sub?.plan ?? null);
      if (dto.planId && !plan) throw new NotFoundException('Plan not found');

      const periods = dto.periods ?? 1;
      const cycle = dto.billingCycle;
      // CUSTOM cycle: period is defined by explicit dates, not month math.
      const months =
        cycle === BillingCycle.CUSTOM
          ? 0
          : (cycle === BillingCycle.YEARLY ? 12 : 1) * periods;
      const periodStart = dto.periodStart
        ? new Date(dto.periodStart)
        : sub?.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()
          ? sub.currentPeriodEnd
          : now;
      if (Number.isNaN(periodStart.getTime())) throw new BadRequestException('Invalid periodStart');
      let periodEnd: Date;
      if (cycle === BillingCycle.CUSTOM) {
        periodEnd = dto.periodEnd
          ? new Date(dto.periodEnd)
          : sub?.currentPeriodEnd ?? addMonthsUtc(periodStart, 1);
        if (Number.isNaN(periodEnd.getTime())) throw new BadRequestException('Invalid periodEnd for custom cycle');
        if (periodEnd.getTime() <= periodStart.getTime()) throw new BadRequestException('periodEnd must be after periodStart');
      } else {
        periodEnd = addMonthsUtc(periodStart, months);
      }

      let items: StoredLine[];
      if (dto.lines && dto.lines.length > 0) {
        items = dto.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: M.round2(l.unitPrice).toFixed(2),
          amount: M.mul(l.unitPrice, l.quantity).toFixed(2),
        }));
      } else {
        const useOverride = sub?.priceOverride && (!dto.planId || dto.planId === sub.planId);
        const unit = useOverride
          ? sub.priceOverride
          : cycle === BillingCycle.YEARLY
            ? plan?.priceYearly
            : plan?.priceMonthly;
        if (!plan || unit === null || unit === undefined) {
          throw new BadRequestException(
            'This plan has no price for the chosen cycle; provide invoice lines with a unit price',
          );
        }
        items = [
          {
            description: `${plan.name} plan - ${cycle === BillingCycle.YEARLY ? 'yearly' : 'monthly'} subscription`,
            quantity: periods,
            unitPrice: M.round2(unit).toFixed(2),
            amount: M.mul(unit, periods).toFixed(2),
          },
        ];
      }

      const subtotal = M.sum(items.map((i) => i.amount));
      const discount = M.round2(dto.discount ?? 0);
      if (M.gt(discount, subtotal)) {
        throw new BadRequestException('Discount cannot exceed the subtotal');
      }
      const total = M.sub(subtotal, discount);
      if (!M.gt(total, 0)) throw new BadRequestException('Invoice total must be greater than zero');

      const year = karachiYear(now);
      await tx.$executeRaw`INSERT INTO "AgencyInvoiceSequence" ("year", "last") VALUES (${year}, 0) ON CONFLICT ("year") DO NOTHING`;
      const rows = await tx.$queryRaw<{ last: number }[]>`UPDATE "AgencyInvoiceSequence" SET "last" = "last" + 1 WHERE "year" = ${year} RETURNING "last"`;
      const number = `DK-${year}-${String(rows[0].last).padStart(4, '0')}`;

      const stored: StoredLines = {
        items,
        planId: dto.planId ?? sub?.planId ?? null,
        billingCycle: cycle,
        periods,
      };
      return tx.agencyInvoice.create({
        data: {
          number,
          businessId: dto.businessId,
          subscriptionId: sub?.id ?? null,
          periodStart,
          periodEnd,
          lines: stored as unknown as Prisma.InputJsonValue,
          subtotal,
          discount,
          total,
          status: InvoiceStatus.DRAFT,
          dueDate: endOfKarachiDay(now, dto.dueDays ?? 7),
          publicToken: randomBytes(32).toString('base64url'),
        },
        include: { business: { select: { name: true } } },
      });
    });

    return created ? this.view(created) : null;
  }

  // ----------------------------------------------------------------- reads

  async list(filter: { businessId?: string; status?: InvoiceStatus }) {
    const rows = await this.prisma.agencyInvoice.findMany({
      where: {
        ...(filter.businessId ? { businessId: filter.businessId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: { business: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.view(r));
  }

  async get(id: string) {
    const row = await this.prisma.agencyInvoice.findUnique({
      where: { id },
      include: { business: { select: { name: true } }, payments: { orderBy: { receivedAt: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return { ...this.view(row), payments: row.payments };
  }

  async listPayments(businessId?: string) {
    return this.prisma.agencyPayment.findMany({
      where: businessId ? { businessId } : {},
      include: { invoice: { select: { number: true } }, business: { select: { name: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });
  }

  async pdfForId(id: string): Promise<{ filename: string; buffer: Buffer }> {
    const row = await this.prisma.agencyInvoice.findUnique({
      where: { id },
      include: { business: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return this.renderPdf(row);
  }

  async publicInvoice(token: string) {
    const row = await this.findByToken(token);
    const stored = readStored(row.lines);
    return {
      number: row.number,
      businessName: row.business.name,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      lines: stored.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: M.toApi(i.unitPrice),
        amount: M.toApi(i.amount),
      })),
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      status: row.status,
      dueDate: row.dueDate,
      agency: this.agency(),
    };
  }

  async publicPdf(token: string) {
    return this.renderPdf(await this.findByToken(token));
  }

  /** Drafts are not issued yet, so their token resolves to nothing. */
  private async findByToken(token: string) {
    if (!PUBLIC_TOKEN_RE.test(token)) throw new NotFoundException('Invoice not found');
    const row = await this.prisma.agencyInvoice.findUnique({
      where: { publicToken: token },
      include: { business: { select: { name: true } } },
    });
    if (!row || row.status === InvoiceStatus.DRAFT) throw new NotFoundException('Invoice not found');
    return row;
  }

  // ------------------------------------------------------------------ send

  async send(id: string, now: Date = new Date()) {
    const row = await this.loadForSend(id);
    if (row.status === InvoiceStatus.PAID || row.status === InvoiceStatus.VOID) {
      throw new BadRequestException(`A ${row.status} invoice cannot be sent`);
    }
    const { buffer, filename } = await this.renderPdf(row);
    const publicUrl = this.publicUrl(row.publicToken);
    const result = await this.mail.send(
      'invoice',
      row.business.owner.email,
      {
        businessName: row.business.name,
        number: row.number,
        total: `Rs. ${row.total.toFixed(2)}`,
        dueDate: row.dueDate,
        publicUrl,
      },
      {
        businessId: row.businessId,
        attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
      },
    );
    if (result.status === 'SUPPRESSED') {
      throw new BadGatewayException('Invoice email was not sent: the daily email limit for this address is reached. Use the WhatsApp link or try again tomorrow.');
    }
    if (result.status === 'FAILED') throw new BadGatewayException('Invoice email could not be sent');

    const updated = await this.prisma.agencyInvoice.update({
      where: { id },
      data: {
        status: row.status === InvoiceStatus.OVERDUE ? InvoiceStatus.OVERDUE : InvoiceStatus.SENT,
        sentAt: now,
      },
      include: { business: { select: { name: true } } },
    });

    const digits = whatsappDigits(row.business.owner.phone ?? row.business.phone);
    const text = `Assalam o Alaikum ${row.business.name}, your ${this.agency().name} invoice ${row.number} for Rs. ${row.total.toFixed(2)} is ready: ${publicUrl}`;
    return {
      invoice: this.view(updated),
      whatsappUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
    };
  }

  private async loadForSend(id: string): Promise<InvoiceWithBusiness> {
    const row = await this.prisma.agencyInvoice.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            name: true,
            phone: true,
            owner: { select: { email: true, phone: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return row;
  }

  // ------------------------------------------------------------------ void

  async voidInvoice(id: string) {
    const row = await this.prisma.agencyInvoice.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Invoice not found');
    if (row.status === InvoiceStatus.PAID) throw new BadRequestException('A paid invoice cannot be voided');
    if (row.status === InvoiceStatus.VOID) return this.get(id);
    await this.prisma.agencyInvoice.update({ where: { id }, data: { status: InvoiceStatus.VOID } });
    return this.get(id);
  }

  // -------------------------------------------------------------- payments

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, recordedById: string | null) {
    const amount = M.round2(dto.amount);
    if (!M.gt(amount, 0)) throw new BadRequestException('Amount must be greater than zero');
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new BadRequestException('Invalid receivedAt');

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Serialises concurrent payments so a full payment extends exactly once.
      await tx.$queryRaw`SELECT id FROM "AgencyInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.agencyInvoice.findUnique({
        where: { id: invoiceId },
        include: { business: { select: { name: true } } },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.VOID) {
        throw new BadRequestException(`A ${invoice.status} invoice cannot take payments`);
      }

      const payment = await tx.agencyPayment.create({
        data: {
          invoiceId,
          businessId: invoice.businessId,
          amount,
          method: dto.method,
          reference: dto.reference ?? null,
          proofUrl: dto.proofUrl ?? null,
          receivedAt,
          recordedById,
        },
      });
      const paid = await tx.agencyPayment.aggregate({
        where: { invoiceId },
        _sum: { amount: true },
      });
      const totalPaid = M.money(paid._sum.amount);

      let periodEnd: Date | null = null;
      if (M.gte(totalPaid, invoice.total)) {
        await tx.agencyInvoice.update({
          where: { id: invoiceId },
          data: { status: InvoiceStatus.PAID, paidAt: new Date() },
        });
        const stored = readStored(invoice.lines);
        const extendOpts: ExtendOptions = {
          billingCycle: stored.billingCycle,
          ...(stored.planId ? { planId: stored.planId } : {}),
        };
        if (stored.billingCycle === BillingCycle.YEARLY) {
          extendOpts.years = stored.periods;
        } else if (stored.billingCycle === BillingCycle.CUSTOM) {
          extendOpts.until = invoice.periodEnd ?? undefined;
        } else {
          extendOpts.months = stored.periods;
        }
        const sub = await this.subscriptions.extend(
          invoice.businessId,
          extendOpts,
          tx,
        );
        periodEnd = sub.currentPeriodEnd;
      }
      return { payment, invoice, totalPaid, periodEnd };
    });

    const settled = outcome.periodEnd !== null;
    if (settled) {
      this.tenantCache.invalidateBusiness(outcome.invoice.businessId);
      await this.sendReceipt(outcome.invoice, outcome.totalPaid, outcome.periodEnd as Date);
    }
    return {
      ...outcome.payment,
      invoiceStatus: settled ? InvoiceStatus.PAID : outcome.invoice.status,
      totalPaid: outcome.totalPaid,
    };
  }

  private async sendReceipt(
    invoice: AgencyInvoice & { business: { name: string } },
    totalPaid: M.Money,
    periodEnd: Date,
  ): Promise<void> {
    try {
      const owner = await this.prisma.business.findUnique({
        where: { id: invoice.businessId },
        select: { owner: { select: { email: true } } },
      });
      if (!owner) return;
      await this.mail.send(
        'payment-receipt',
        owner.owner.email,
        {
          businessName: invoice.business.name,
          number: invoice.number,
          amount: `Rs. ${totalPaid.toFixed(2)}`,
          periodEnd,
        },
        { businessId: invoice.businessId },
      );
    } catch (e) {
      this.logger.error(`Receipt email failed for ${invoice.number}: ${(e as Error).message}`);
    }
  }

  // --------------------------------------------------------------- helpers

  private async renderPdf(
    row: AgencyInvoice & { business: { name: string } },
  ): Promise<{ filename: string; buffer: Buffer }> {
    const stored = readStored(row.lines);
    const lines: PdfLine[] = stored.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    }));
    const buffer = await buildInvoicePdf({
      number: row.number,
      businessName: row.business.name,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      lines,
      subtotal: row.subtotal.toFixed(2),
      discount: row.discount.toFixed(2),
      total: row.total.toFixed(2),
      status: row.status,
      dueDate: row.dueDate,
      agency: this.agency(),
    });
    return { filename: `${row.number}.pdf`, buffer };
  }

  /** Admin-facing serialisation; unwraps the stored lines envelope. */
  view(row: AgencyInvoice & { business?: { name: string } }) {
    const stored = readStored(row.lines);
    return {
      id: row.id,
      number: row.number,
      businessId: row.businessId,
      businessName: row.business?.name ?? null,
      subscriptionId: row.subscriptionId,
      planId: stored.planId,
      billingCycle: stored.billingCycle,
      periods: stored.periods,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      lines: stored.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: M.toApi(i.unitPrice),
        amount: M.toApi(i.amount),
      })),
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      status: row.status,
      dueDate: row.dueDate,
      sentAt: row.sentAt,
      paidAt: row.paidAt,
      publicToken: row.publicToken,
      publicUrl: this.publicUrl(row.publicToken),
      createdAt: row.createdAt,
    };
  }
}

export type { AgencyPayment };
