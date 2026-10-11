import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KhataDirection,
  KhataEntry,
  KhataPartyType,
  KhataStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { TenantContext } from '../tenant/tenant.types';
import * as M from '../common/money';
import { addDays, startOfKarachiDay } from '../common/dates';
import {
  CreateKhataEntryDto,
  PromoteKhataEntryDto,
  SettleKhataEntryDto,
  UpdateKhataEntryDto,
  WriteOffKhataEntryDto,
} from './dto/khata-entry.dto';

interface Account {
  accountId: string;
  accountType: string;
}

const CASH: Account = { accountId: 'CASH', accountType: 'ASSET' };
const REVENUE: Account = { accountId: 'REVENUE', accountType: 'REVENUE' };
const BAD_DEBT: Account = {
  accountId: 'BAD_DEBT',
  accountType: 'BAD_DEBT_EXPENSE',
};

const OPEN_STATUSES: KhataStatus[] = [KhataStatus.OPEN, KhataStatus.PARTIAL];

type PartyRef = Pick<
  KhataEntry,
  'id' | 'direction' | 'partyType' | 'customerId' | 'vendorId'
>;

/** The AR/AP ledger account of the entry's party. */
function partyAccount(e: PartyRef): Account {
  if (e.partyType === KhataPartyType.CUSTOMER && e.customerId) {
    return { accountId: e.customerId, accountType: 'CUSTOMER_AR' };
  }
  if (e.partyType === KhataPartyType.VENDOR && e.vendorId) {
    return { accountId: e.vendorId, accountType: 'VENDOR_PAYABLE' };
  }
  return {
    accountId: e.id,
    accountType:
      e.direction === KhataDirection.RECEIVABLE ? 'OTHER_AR' : 'OTHER_AP',
  };
}

function openOf(
  e: Pick<KhataEntry, 'amount' | 'settledAmount' | 'status'>,
): Prisma.Decimal {
  if (!OPEN_STATUSES.includes(e.status)) return M.ZERO;
  return M.max(M.ZERO, M.sub(e.amount, e.settledAmount));
}

@Injectable()
export class KhataEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async findOwned(
    businessId: string,
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<KhataEntry> {
    const entry = await client.khataEntry.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException('Khata entry not found');
    return entry;
  }

  async create(t: TenantContext, dto: CreateKhataEntryDto) {
    const amount = M.round2(dto.amount);
    const counterAccount = dto.counterAccount ?? 'ASSET';
    if (
      counterAccount === 'REVENUE' &&
      dto.direction !== KhataDirection.RECEIVABLE
    ) {
      throw new BadRequestException(
        'REVENUE counter account is only valid for receivables',
      );
    }

    let customerId: string | null = null;
    let vendorId: string | null = null;
    let partyName = dto.partyName?.trim() || '';
    let partyPhone = dto.partyPhone ?? null;

    if (dto.partyType === KhataPartyType.CUSTOMER) {
      if (!dto.customerId)
        throw new BadRequestException('customerId is required for CUSTOMER');
      const c = await this.prisma.customer.findFirst({
        where: {
          id: dto.customerId,
          businessId: t.businessId,
          deletedAt: null,
        },
      });
      if (!c) throw new NotFoundException('Customer not found');
      customerId = c.id;
      partyName = partyName || c.name;
      partyPhone = partyPhone ?? (c.phone || null);
    } else if (dto.partyType === KhataPartyType.VENDOR) {
      if (!dto.vendorId)
        throw new BadRequestException('vendorId is required for VENDOR');
      const v = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, businessId: t.businessId },
      });
      if (!v) throw new NotFoundException('Vendor not found');
      vendorId = v.id;
      partyName = partyName || v.businessName;
      partyPhone = partyPhone ?? v.phone ?? null;
    } else if (!partyName) {
      throw new BadRequestException('partyName is required for OTHER');
    }

    let dueDate: Date;
    if (dto.dueDate) {
      dueDate = new Date(dto.dueDate);
    } else {
      const biz = await this.prisma.business.findUnique({
        where: { id: t.businessId },
        select: { defaultReceivableDays: true, defaultPayableDays: true },
      });
      const days =
        dto.direction === KhataDirection.RECEIVABLE
          ? (biz?.defaultReceivableDays ?? 7)
          : (biz?.defaultPayableDays ?? 15);
      dueDate = addDays(startOfKarachiDay(), days);
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.khataEntry.create({
        data: {
          businessId: t.businessId,
          branchId: t.branchId,
          direction: dto.direction,
          partyType: dto.partyType,
          customerId,
          vendorId,
          partyName,
          partyPhone,
          amount,
          counterAccount,
          dueDate,
          note: dto.note ?? null,
          createdById: t.userId,
        },
      });

      const party = partyAccount(entry);
      const counter = counterAccount === 'REVENUE' ? REVENUE : CASH;
      const postings =
        dto.direction === KhataDirection.RECEIVABLE
          ? [
              { ...party, amount },
              { ...counter, amount: M.neg(amount) },
            ]
          : [
              { ...CASH, amount },
              { ...party, amount: M.neg(amount) },
            ];

      await this.ledger.createBalancedTransaction(
        {
          businessId: t.businessId,
          referenceId: entry.id,
          type: 'KHATA_ENTRY',
          description: `Khata ${dto.direction === KhataDirection.RECEIVABLE ? 'lena' : 'dena'}: ${partyName}`,
          postings,
        },
        tx,
      );
      return entry;
    });
  }

  list(businessId: string, direction?: KhataDirection, status?: KhataStatus) {
    return this.prisma.khataEntry.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(direction ? { direction } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWithTransactions(businessId: string, id: string) {
    const entry = await this.findOwned(businessId, id);
    const transactions = await this.prisma.transaction.findMany({
      where: { businessId, referenceId: id },
      include: { postings: true },
      orderBy: { createdAt: 'asc' },
    });
    return { ...entry, openAmount: openOf(entry), transactions };
  }

  async update(businessId: string, id: string, dto: UpdateKhataEntryDto) {
    await this.findOwned(businessId, id);
    return this.prisma.khataEntry.update({
      where: { id },
      data: {
        ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.partyName !== undefined
          ? { partyName: dto.partyName.trim() }
          : {}),
        ...(dto.partyPhone !== undefined ? { partyPhone: dto.partyPhone } : {}),
      },
    });
  }

  async settle(t: TenantContext, id: string, dto: SettleKhataEntryDto) {
    const s = M.round2(dto.amount);
    if (!M.gt(s, M.ZERO))
      throw new BadRequestException('Amount must be greater than zero');

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.findOwned(t.businessId, id, tx);
      if (!OPEN_STATUSES.includes(entry.status)) {
        throw new BadRequestException(`Entry is already ${entry.status}`);
      }
      const open = openOf(entry);
      if (M.gt(s, open)) {
        throw new BadRequestException(
          `Amount exceeds open balance of ${M.toApi(open)}`,
        );
      }

      const newSettled = M.add(entry.settledAmount, s);
      const status = M.isZero(M.sub(open, s))
        ? KhataStatus.SETTLED
        : KhataStatus.PARTIAL;

      // Optimistic guard against concurrent settlements of the same entry.
      const res = await tx.khataEntry.updateMany({
        where: {
          id,
          businessId: t.businessId,
          settledAmount: entry.settledAmount,
          status: { in: OPEN_STATUSES },
        },
        data: { settledAmount: newSettled, status },
      });
      if (res.count !== 1)
        throw new ConflictException('Entry was modified concurrently, retry');

      const party = partyAccount(entry);
      const postings =
        entry.direction === KhataDirection.RECEIVABLE
          ? [
              { ...CASH, amount: s },
              { ...party, amount: M.neg(s) },
            ]
          : [
              { ...party, amount: s },
              { ...CASH, amount: M.neg(s) },
            ];

      await this.ledger.createBalancedTransaction(
        {
          businessId: t.businessId,
          referenceId: id,
          type: 'KHATA_SETTLEMENT',
          description: `Khata settlement${dto.method ? ` (${dto.method})` : ''}: ${entry.partyName}`,
          postings,
        },
        tx,
      );
      return this.findOwned(t.businessId, id, tx);
    });
  }

  async writeOff(t: TenantContext, id: string, dto: WriteOffKhataEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.findOwned(t.businessId, id, tx);
      if (entry.direction !== KhataDirection.RECEIVABLE) {
        throw new BadRequestException('Only receivables can be written off');
      }
      if (!OPEN_STATUSES.includes(entry.status)) {
        throw new BadRequestException(`Entry is already ${entry.status}`);
      }
      const open = openOf(entry);

      const res = await tx.khataEntry.updateMany({
        where: {
          id,
          businessId: t.businessId,
          settledAmount: entry.settledAmount,
          status: { in: OPEN_STATUSES },
        },
        data: { status: KhataStatus.WRITTEN_OFF },
      });
      if (res.count !== 1)
        throw new ConflictException('Entry was modified concurrently, retry');

      if (M.gt(open, M.ZERO)) {
        await this.ledger.createBalancedTransaction(
          {
            businessId: t.businessId,
            referenceId: id,
            type: 'KHATA_WRITE_OFF',
            description: `Khata write-off: ${entry.partyName}${dto.reason ? ` - ${dto.reason}` : ''}`,
            postings: [
              { ...BAD_DEBT, amount: open },
              { ...partyAccount(entry), amount: M.neg(open) },
            ],
          },
          tx,
        );
      }
      return this.findOwned(t.businessId, id, tx);
    });
  }

  async promote(t: TenantContext, id: string, dto: PromoteKhataEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.findOwned(t.businessId, id, tx);
      if (entry.partyType !== KhataPartyType.OTHER) {
        throw new BadRequestException(
          'Only free-text (OTHER) parties can be promoted',
        );
      }
      const isReceivable = entry.direction === KhataDirection.RECEIVABLE;
      if (isReceivable && dto.vendorId) {
        throw new BadRequestException(
          'A receivable is promoted to a customer, not a vendor',
        );
      }
      if (!isReceivable && dto.customerId) {
        throw new BadRequestException(
          'A payable is promoted to a vendor, not a customer',
        );
      }

      const oldAccount = partyAccount(entry);
      let customerId: string | null = null;
      let vendorId: string | null = null;

      if (isReceivable) {
        if (dto.customerId) {
          const c = await tx.customer.findFirst({
            where: {
              id: dto.customerId,
              businessId: t.businessId,
              deletedAt: null,
            },
          });
          if (!c) throw new NotFoundException('Customer not found');
          customerId = c.id;
        } else {
          const c = await tx.customer.create({
            data: {
              businessId: t.businessId,
              name: entry.partyName,
              phone: entry.partyPhone ?? '',
            },
          });
          customerId = c.id;
        }
      } else if (dto.vendorId) {
        const v = await tx.vendor.findFirst({
          where: { id: dto.vendorId, businessId: t.businessId },
        });
        if (!v) throw new NotFoundException('Vendor not found');
        vendorId = v.id;
      } else {
        const v = await tx.vendor.create({
          data: {
            businessId: t.businessId,
            businessName: entry.partyName,
            phone: entry.partyPhone ?? null,
          },
        });
        vendorId = v.id;
      }

      const updated = await tx.khataEntry.update({
        where: { id },
        data: {
          partyType: isReceivable
            ? KhataPartyType.CUSTOMER
            : KhataPartyType.VENDOR,
          customerId,
          vendorId,
        },
      });

      const open = openOf(entry);
      if (M.gt(open, M.ZERO)) {
        const newAccount = partyAccount(updated);
        const postings = isReceivable
          ? [
              { ...newAccount, amount: open },
              { ...oldAccount, amount: M.neg(open) },
            ]
          : [
              { ...oldAccount, amount: open },
              { ...newAccount, amount: M.neg(open) },
            ];
        await this.ledger.createBalancedTransaction(
          {
            businessId: t.businessId,
            referenceId: id,
            type: 'KHATA_RECLASS',
            description: `Khata party promoted: ${entry.partyName}`,
            postings,
          },
          tx,
        );
      }
      return updated;
    });
  }

  /** Open (OPEN|PARTIAL) entries with computed openAmount, for the Dues module. */
  async findOpen(businessId: string, direction?: KhataDirection) {
    const entries = await this.prisma.khataEntry.findMany({
      where: {
        businessId,
        deletedAt: null,
        status: { in: OPEN_STATUSES },
        ...(direction ? { direction } : {}),
      },
      orderBy: { dueDate: 'asc' },
    });
    return entries.map((e) => ({ ...e, openAmount: openOf(e) }));
  }
}
