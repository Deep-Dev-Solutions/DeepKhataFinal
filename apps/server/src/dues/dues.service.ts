import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KhataDirection, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KhataEntriesService } from '../khata-entries/khata-entries.service';
import * as M from '../common/money';
import * as D from '../common/dates';
import { normalizePkPhone } from './phone';
import { Bucket, BUCKETS, ListDuesQueryDto, PromiseDto } from './dto/dues.dto';

export const ENTITY_TYPES = [
  'ORDER',
  'VENDOR_PURCHASE',
  'KHATA_ENTRY',
] as const;
export type DueEntityType = (typeof ENTITY_TYPES)[number];
export type DueDirection = 'RECEIVABLE' | 'PAYABLE';

export interface DueItem {
  entityType: DueEntityType;
  entityId: string;
  direction: DueDirection;
  partyType: 'CUSTOMER' | 'VENDOR' | 'OTHER' | 'WALK_IN';
  partyId: string | null;
  partyName: string;
  partyPhone: string | null;
  amountOpen: M.Money;
  originDate: Date;
  dueDate: Date;
  ageDays: number;
  daysOverdue: number;
  bucket: Bucket;
  lastReminderAt: Date | null;
  promiseDate: Date | null;
  snoozedUntil: Date | null;
  reference: string;
  link: string;
}

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.FINAL,
  OrderStatus.COMPLETED,
  OrderStatus.PENDING,
  OrderStatus.MEMO,
];

function bucketOf(ageDays: number): Bucket {
  if (ageDays <= 7) return '0-7';
  if (ageDays <= 30) return '8-30';
  if (ageDays <= 90) return '31-90';
  return '90+';
}

function formatAmount(v: M.Money): string {
  const r = M.round2(v);
  const whole = r.mod(1).isZero();
  return Number(r.toFixed(2)).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

@Injectable()
export class DuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly khata: KhataEntriesService,
  ) {}

  // ---------------------------------------------------------------- listing

  async listOpen(
    businessId: string,
    direction?: DueDirection,
    now: Date = new Date(),
  ): Promise<DueItem[]> {
    const wantReceivable = !direction || direction === 'RECEIVABLE';
    const wantPayable = !direction || direction === 'PAYABLE';

    const [receivable, payable, khataItems, promises, reminders] =
      await Promise.all([
        wantReceivable
          ? this.openOrders(businessId, now)
          : Promise.resolve([] as DueItem[]),
        wantPayable
          ? this.openPurchases(businessId, now)
          : Promise.resolve([] as DueItem[]),
        this.openKhata(businessId, direction, now),
        this.prisma.promiseToPay.findMany({
          where: { businessId },
          orderBy: { createdAt: 'asc' },
          select: {
            entityType: true,
            entityId: true,
            kind: true,
            promisedDate: true,
          },
        }),
        this.prisma.dueReminder.groupBy({
          by: ['entityType', 'entityId'],
          where: { businessId },
          _max: { createdAt: true },
        }),
      ]);

    const items: DueItem[] = [...receivable, ...payable, ...khataItems];

    const latestPromise = new Map<string, Date>();
    const latestSnooze = new Map<string, Date>();
    for (const p of promises) {
      const key = `${p.entityType}:${p.entityId}`;
      if (p.kind === 'SNOOZE') latestSnooze.set(key, p.promisedDate);
      else latestPromise.set(key, p.promisedDate);
    }
    const lastReminder = new Map<string, Date>();
    for (const r of reminders) {
      if (r._max.createdAt)
        lastReminder.set(`${r.entityType}:${r.entityId}`, r._max.createdAt);
    }
    for (const it of items) {
      const key = `${it.entityType}:${it.entityId}`;
      it.lastReminderAt = lastReminder.get(key) ?? null;
      it.promiseDate = latestPromise.get(key) ?? null;
      const sn = latestSnooze.get(key) ?? null;
      it.snoozedUntil = sn && sn.getTime() > now.getTime() ? sn : null;
    }
    return items;
  }

  private base(
    partial: Pick<
      DueItem,
      | 'entityType'
      | 'entityId'
      | 'direction'
      | 'partyType'
      | 'partyId'
      | 'partyName'
      | 'partyPhone'
      | 'amountOpen'
      | 'originDate'
      | 'dueDate'
      | 'reference'
    >,
    now: Date,
  ): DueItem {
    const ageDays = D.daysBetween(partial.originDate, now);
    return {
      ...partial,
      ageDays,
      daysOverdue: Math.max(0, D.daysBetween(partial.dueDate, now)),
      bucket: bucketOf(ageDays),
      lastReminderAt: null,
      promiseDate: null,
      snoozedUntil: null,
      link: `/dues?focus=${partial.entityType}:${partial.entityId}`,
    };
  }

  private async openOrders(businessId: string, now: Date): Promise<DueItem[]> {
    const [business, orders] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { defaultReceivableDays: true },
      }),
      this.prisma.order.findMany({
        where: {
          businessId,
          status: { in: OPEN_ORDER_STATUSES },
          paymentStatus: { not: 'PAID' },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              paymentTermsDays: true,
            },
          },
          payments: { select: { amount: true } },
        },
      }),
    ]);
    const defaultDays = business?.defaultReceivableDays ?? 7;
    const out: DueItem[] = [];
    for (const o of orders) {
      const totalPaid = M.sum(o.payments.map((p) => p.amount));
      const open = M.sub(o.totalAmount, totalPaid);
      if (!M.gt(open, 0)) continue;
      const terms = o.customer?.paymentTermsDays ?? defaultDays;
      out.push(
        this.base(
          {
            entityType: 'ORDER',
            entityId: o.id,
            direction: 'RECEIVABLE',
            partyType: o.customer ? 'CUSTOMER' : 'WALK_IN',
            partyId: o.customer?.id ?? null,
            partyName: o.customer?.name ?? o.walkInName ?? 'Walk-in customer',
            partyPhone: o.customer?.phone ?? o.walkInPhone ?? null,
            amountOpen: open,
            originDate: o.createdAt,
            dueDate: o.dueDate ?? D.addDays(o.createdAt, terms),
            reference: `Order #${o.orderNumber}`,
          },
          now,
        ),
      );
    }
    return out;
  }

  private async openPurchases(
    businessId: string,
    now: Date,
  ): Promise<DueItem[]> {
    const [business, txs] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { defaultPayableDays: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          businessId,
          type: { in: ['VENDOR_PURCHASE', 'VENDOR_PAYMENT'] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          dueDate: true,
          createdAt: true,
          postings: {
            where: { accountType: 'VENDOR_PAYABLE' },
            select: { accountId: true, amount: true },
          },
        },
      }),
    ]);
    const defaultDays = business?.defaultPayableDays ?? 15;

    const paidByVendor = new Map<string, M.Money>();
    type Purchase = {
      txId: string;
      vendorId: string;
      amount: M.Money;
      createdAt: Date;
      dueDate: Date | null;
    };
    const purchasesByVendor = new Map<string, Purchase[]>();
    for (const tx of txs) {
      const perVendor = new Map<string, M.Money>();
      for (const p of tx.postings) {
        perVendor.set(
          p.accountId,
          M.add(perVendor.get(p.accountId) ?? 0, p.amount),
        );
      }
      for (const [vendorId, net] of perVendor) {
        if (tx.type === 'VENDOR_PAYMENT') {
          if (M.gt(net, 0))
            paidByVendor.set(vendorId, M.add(paidByVendor.get(vendorId), net));
        } else if (M.lt(net, 0)) {
          const list = purchasesByVendor.get(vendorId) ?? [];
          list.push({
            txId: tx.id,
            vendorId,
            amount: M.neg(net),
            createdAt: tx.createdAt,
            dueDate: tx.dueDate,
          });
          purchasesByVendor.set(vendorId, list);
        }
      }
    }
    if (purchasesByVendor.size === 0) return [];

    const vendors = await this.prisma.vendor.findMany({
      where: { businessId, id: { in: [...purchasesByVendor.keys()] } },
      select: { id: true, businessName: true, phone: true },
    });
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    const out: DueItem[] = [];
    for (const [vendorId, list] of purchasesByVendor) {
      const vendor = vendorMap.get(vendorId);
      if (!vendor) continue;
      let remainingPaid = paidByVendor.get(vendorId) ?? M.ZERO;
      for (const pu of list) {
        // list is already ordered oldest first (query orderBy createdAt asc)
        const applied = M.min(remainingPaid, pu.amount);
        remainingPaid = M.sub(remainingPaid, applied);
        const open = M.sub(pu.amount, applied);
        if (!M.gt(open, 0)) continue;
        out.push(
          this.base(
            {
              entityType: 'VENDOR_PURCHASE',
              entityId: pu.txId,
              direction: 'PAYABLE',
              partyType: 'VENDOR',
              partyId: vendor.id,
              partyName: vendor.businessName,
              partyPhone: vendor.phone ?? null,
              amountOpen: open,
              originDate: pu.createdAt,
              dueDate: pu.dueDate ?? D.addDays(pu.createdAt, defaultDays),
              reference: `Purchase ${D.karachiDateString(pu.createdAt)}`,
            },
            now,
          ),
        );
      }
    }
    return out;
  }

  private async openKhata(
    businessId: string,
    direction: DueDirection | undefined,
    now: Date,
  ): Promise<DueItem[]> {
    const entries = await this.khata.findOpen(
      businessId,
      direction as KhataDirection | undefined,
    );
    return entries.map((e) =>
      this.base(
        {
          entityType: 'KHATA_ENTRY',
          entityId: e.id,
          direction: e.direction,
          partyType: e.partyType,
          partyId: e.customerId ?? e.vendorId ?? null,
          partyName: e.partyName,
          partyPhone: e.partyPhone ?? null,
          amountOpen: e.openAmount,
          originDate: e.createdAt,
          dueDate: e.dueDate,
          reference: e.note?.trim() ? e.note : 'Khata entry',
        },
        now,
      ),
    );
  }

  // ---------------------------------------------------------------- summary

  async summary(businessId: string, now: Date = new Date()) {
    const items = await this.listOpen(businessId, undefined, now);
    const zeroAging = () =>
      Object.fromEntries(BUCKETS.map((b) => [b, M.ZERO])) as Record<
        Bucket,
        M.Money
      >;
    const acc = {
      toReceive: M.ZERO,
      toPay: M.ZERO,
      overdueToReceive: M.ZERO,
      overdueToPay: M.ZERO,
      dueThisWeekToReceive: M.ZERO,
      dueThisWeekToPay: M.ZERO,
    };
    const counts = { receivable: 0, payable: 0, overdueReceivable: 0 };
    const aging = { receivable: zeroAging(), payable: zeroAging() };

    for (const it of items) {
      const rec = it.direction === 'RECEIVABLE';
      const untilDue = D.daysBetween(now, it.dueDate);
      const overdue = it.daysOverdue > 0;
      const thisWeek = untilDue >= 0 && untilDue <= 7;
      if (rec) {
        acc.toReceive = M.add(acc.toReceive, it.amountOpen);
        counts.receivable++;
        if (overdue) {
          acc.overdueToReceive = M.add(acc.overdueToReceive, it.amountOpen);
          counts.overdueReceivable++;
        } else if (thisWeek) {
          acc.dueThisWeekToReceive = M.add(
            acc.dueThisWeekToReceive,
            it.amountOpen,
          );
        }
        aging.receivable[it.bucket] = M.add(
          aging.receivable[it.bucket],
          it.amountOpen,
        );
      } else {
        acc.toPay = M.add(acc.toPay, it.amountOpen);
        counts.payable++;
        if (overdue) {
          acc.overdueToPay = M.add(acc.overdueToPay, it.amountOpen);
        } else if (thisWeek) {
          acc.dueThisWeekToPay = M.add(acc.dueThisWeekToPay, it.amountOpen);
        }
        aging.payable[it.bucket] = M.add(
          aging.payable[it.bucket],
          it.amountOpen,
        );
      }
    }
    const toNums = (r: Record<Bucket, M.Money>) =>
      Object.fromEntries(BUCKETS.map((b) => [b, M.toApi(r[b])])) as Record<
        Bucket,
        number
      >;
    return {
      toReceive: M.toApi(acc.toReceive),
      toPay: M.toApi(acc.toPay),
      overdueToReceive: M.toApi(acc.overdueToReceive),
      overdueToPay: M.toApi(acc.overdueToPay),
      dueThisWeekToReceive: M.toApi(acc.dueThisWeekToReceive),
      dueThisWeekToPay: M.toApi(acc.dueThisWeekToPay),
      counts,
      aging: {
        receivable: toNums(aging.receivable),
        payable: toNums(aging.payable),
      },
    };
  }

  async list(businessId: string, q: ListDuesQueryDto) {
    const direction: DueDirection =
      q.direction === 'payable' ? 'PAYABLE' : 'RECEIVABLE';
    let items = await this.listOpen(businessId, direction);

    if (q.bucket) items = items.filter((i) => i.bucket === q.bucket);
    if (q.customerId)
      items = items.filter(
        (i) => i.partyType === 'CUSTOMER' && i.partyId === q.customerId,
      );
    if (q.vendorId)
      items = items.filter(
        (i) => i.partyType === 'VENDOR' && i.partyId === q.vendorId,
      );
    const needle = q.q?.trim().toLowerCase();
    if (needle) {
      items = items.filter(
        (i) =>
          i.partyName.toLowerCase().includes(needle) ||
          (i.partyPhone ?? '').toLowerCase().includes(needle) ||
          i.reference.toLowerCase().includes(needle),
      );
    }
    const sort = q.sort ?? 'oldest';
    items.sort((a, b) => {
      if (sort === 'amount') return M.cmp(b.amountOpen, a.amountOpen) || 0;
      if (sort === 'due') return a.dueDate.getTime() - b.dueDate.getTime();
      return a.originDate.getTime() - b.originDate.getTime();
    });
    return { items: items.map((i) => this.toApi(i)) };
  }

  private toApi(i: DueItem) {
    return {
      ...i,
      amountOpen: M.toApi(i.amountOpen),
      originDate: i.originDate.toISOString(),
      dueDate: i.dueDate.toISOString(),
      lastReminderAt: i.lastReminderAt?.toISOString() ?? null,
      promiseDate: i.promiseDate?.toISOString() ?? null,
      snoozedUntil: i.snoozedUntil?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------- actions

  /** 404 unless the entity belongs to the business. */
  private async assertEntity(
    businessId: string,
    entityType: DueEntityType,
    entityId: string,
  ): Promise<void> {
    let found: { id: string } | null = null;
    if (entityType === 'ORDER') {
      found = await this.prisma.order.findFirst({
        where: { id: entityId, businessId },
        select: { id: true },
      });
    } else if (entityType === 'VENDOR_PURCHASE') {
      found = await this.prisma.transaction.findFirst({
        where: { id: entityId, businessId, type: 'VENDOR_PURCHASE' },
        select: { id: true },
      });
    } else {
      found = await this.prisma.khataEntry.findFirst({
        where: { id: entityId, businessId, deletedAt: null },
        select: { id: true },
      });
    }
    if (!found) throw new NotFoundException('Due item not found');
  }

  async addPromise(
    businessId: string,
    userId: string,
    entityType: DueEntityType,
    entityId: string,
    dto: PromiseDto,
  ) {
    await this.assertEntity(businessId, entityType, entityId);
    return this.prisma.promiseToPay.create({
      data: {
        businessId,
        entityType,
        entityId,
        kind: dto.kind ?? 'PROMISE',
        promisedDate: new Date(dto.promisedDate),
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });
  }

  async logReminder(
    businessId: string,
    userId: string,
    entityType: DueEntityType,
    entityId: string,
    channel: string,
  ) {
    await this.assertEntity(businessId, entityType, entityId);
    return this.prisma.dueReminder.create({
      data: { businessId, entityType, entityId, channel, sentById: userId },
    });
  }

  async whatsappLink(
    businessId: string,
    entityType: DueEntityType,
    entityId: string,
    lang: 'ur' | 'en',
  ) {
    await this.assertEntity(businessId, entityType, entityId);
    const [items, business] = await Promise.all([
      this.listOpen(businessId),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
    ]);
    const item = items.find(
      (i) => i.entityType === entityType && i.entityId === entityId,
    );
    if (!item) throw new NotFoundException('Due item is not open');
    if (item.direction !== 'RECEIVABLE')
      throw new BadRequestException(
        'Reminders are only for amounts to receive',
      );
    const phone = normalizePkPhone(item.partyPhone);
    if (!phone) throw new BadRequestException('No phone number for this party');

    const amount = formatAmount(item.amountOpen);
    const shop = business?.name ?? '';
    const text =
      lang === 'en'
        ? `Hello ${item.partyName}, a reminder from ${shop}: Rs ${amount} is outstanding on your account (${item.ageDays} days). Thank you.`
        : `Assalam o Alaikum ${item.partyName}, ${shop} ki taraf se yaad-dehani: aap ke zimme Rs ${amount} baqi hain (${item.ageDays} din se). Shukriya.`;
    return {
      url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
      phone,
      text,
    };
  }
}
