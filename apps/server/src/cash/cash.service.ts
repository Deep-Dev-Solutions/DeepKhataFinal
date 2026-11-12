import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import * as M from '../common/money';
import * as D from '../common/dates';
import { formatMoney } from '../common/money';
import { RedisService } from '../redis/redis.service';
import { LogExpenseDto } from './dto/log-expense.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { VoidExpenseDto } from './dto/void-expense.dto';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly redis: RedisService,
  ) {}

  private async invalidateCashCaches(
    businessId: string,
    branchId?: string | null,
  ): Promise<void> {
    const branchPattern = branchId ? `branch=${branchId}` : '*';
    await Promise.all([
      this.redis.deleteByPattern(`dashboard:${businessId}:branch:${branchId || '*'}`),
      this.redis.deleteByPattern(`reports:*${businessId}*${branchPattern}*`),
    ]);
  }

  /** The branch always comes from the session header; prove it is this tenant's. */
  private async assertBranch(businessId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found.');
  }

  private async getUserWithBusiness(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, businessId: true },
    });

    if (!user || !user.businessId) {
      throw new BadRequestException('User is not associated with an active business.');
    }

    return user;
  }

  /**
   * Step 1: Log Daily Operational Cash Expense & Post to Double-Entry Ledger
   * Debits EXPENSE account, Credits CASH asset account. Postings sum to 0.
   *
   * The branch always comes from the x-branch-id header (or the sync queue's
   * tenant context), never from the body. The expense needs an OPEN register
   * for that branch and can never take more cash than the drawer holds, unless
   * an OWNER / MANAGER overrides it with a reason (logged in the description).
   */
  async logExpense(
    userId: string,
    dto: LogExpenseDto,
    branchId: string,
    id?: string,
  ) {
    const user = await this.getUserWithBusiness(userId);

    let parsedAmount: M.Money;
    try {
      parsedAmount = M.round2(dto.amount);
    } catch {
      throw new BadRequestException('Expense amount must be a positive number.');
    }
    if (!M.gt(parsedAmount, 0)) {
      throw new BadRequestException('Expense amount must be a positive number.');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId: user.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const category = dto.category.trim().toUpperCase();

    const overrideReason = dto.overrideReason?.trim();
    const canOverride = user.role === 'OWNER' || user.role === 'MANAGER';
    if (overrideReason && !canOverride) {
      throw new BadRequestException(
        'Only an owner or manager can override the galla balance.',
      );
    }

    const baseDescription = dto.description?.trim() || '';
    const description = overrideReason
      ? `[OVERRIDE: ${overrideReason}] ${baseDescription}`.trim()
      : baseDescription || null;

    const result = await this.prisma.$transaction(async (tx) => {
      // The register must be open for this branch, and the drawer balance is
      // read in the same transaction so two tills cannot both pass the check.
      const activeSession = await tx.cashRegisterSession.findFirst({
        where: { businessId: user.businessId, branchId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });

      if (!activeSession) {
        throw new ConflictException({
          code: 'REGISTER_CLOSED',
          message: 'Galla band hai. Pehle register kholen.',
        });
      }

      const totals = await this.computeSessionTotals(
        user.businessId,
        branchId,
        activeSession.openedAt,
        undefined,
        tx,
      );
      const expectedCash = this.expectedCashOf(
        activeSession.openingBalance,
        totals,
      );

      if (M.gt(parsedAmount, expectedCash)) {
        if (!overrideReason) {
          throw new ConflictException({
            code: 'GALLA_INSUFFICIENT',
            available: expectedCash.toString(),
            message: `Galla mein sirf Rs ${formatMoney(expectedCash)} hain.`,
          });
        }
      }

      // 1. Create the Expense record
      const expense = await tx.expense.create({
        data: {
          ...(id ? { id } : {}),
          businessId: user.businessId,
          branchId,
          amount: parsedAmount,
          category,
          description,
          createdById: user.id,
          sessionId: activeSession.id,
        },
      });

      // 2. Post to Double-Entry Ledger (Balanced Transaction)
      // Debit EXPENSE (positive), Credit CASH (negative)
      const ledgerTx = await this.ledgerService.createBalancedTransaction({
        businessId: user.businessId,
        referenceId: expense.id,
        type: 'EXPENSE',
        description: `Operational Expense: [${category}] ${baseDescription}`.trim(),
        postings: [
          {
            accountId: category,
            accountType: 'EXPENSE',
            amount: parsedAmount, // DEBIT
          },
          {
            accountId: 'CASH',
            accountType: 'ASSET',
            amount: M.neg(parsedAmount), // CREDIT
          },
        ],
      }, tx);

      // 3. Link ledger transaction to expense
      const updatedExpense = await tx.expense.update({
        where: { id: expense.id },
        data: { transactionId: ledgerTx.id },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          branch: { select: { id: true, name: true } },
          transaction: { include: { postings: true } },
        },
      });

      return {
        success: true,
        message: `Expense of PKR ${parsedAmount.toLocaleString()} logged and balanced in ledger.`,
        expense: updatedExpense,
      };
    });

    await this.invalidateCashCaches(user.businessId, branchId);
    return result;
  }

  /**
   * Get list of expenses
   */
  async getExpenses(userId: string, query: { date?: string; branchId?: string; limit?: number }) {
    const user = await this.getUserWithBusiness(userId);

    const where: any = { businessId: user.businessId };

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.date) {
      const startOfDay = new Date(query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(query.date);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = { gte: startOfDay, lte: endOfDay };
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
        transaction: { include: { postings: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 100,
    });

    const live = expenses.filter((e) => !e.transaction?.voidedAt);
    const totalAmount = M.sum(live.map((e) => e.amount));

    return {
      success: true,
      count: expenses.length,
      totalAmount,
      expenses: expenses.map((e) => ({
        ...e,
        isVoided: Boolean(e.transaction?.voidedAt),
      })),
    };
  }

  /**
   * Expense totals per Karachi calendar day for one branch, plus the vouchers
   * themselves so the history page can expand a day. Voided vouchers are listed
   * but never counted.
   */
  async getDailyExpenses(
    userId: string,
    branchId: string,
    query: { from?: string; to?: string },
  ) {
    const user = await this.getUserWithBusiness(userId);

    const parseDay = (value: string | undefined, label: string): Date => {
      if (!value) throw new BadRequestException(`${label} date is required`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(
          `${label} date must be in YYYY-MM-DD format`,
        );
      }
      return D.startOfKarachiDay(new Date(`${value}T00:00:00.000Z`));
    };

    const today = D.startOfKarachiDay();
    const fromDay = query.from
      ? parseDay(query.from, 'From')
      : D.startOfKarachiDay(new Date(`${D.karachiDateString(today).slice(0, 7)}-01T00:00:00.000Z`));
    const toDay = query.to ? parseDay(query.to, 'To') : today;

    if (fromDay.getTime() > toDay.getTime()) {
      throw new BadRequestException('From date cannot be after the to date');
    }
    if (D.daysBetween(fromDay, toDay) > 91) {
      throw new BadRequestException('Date range cannot be longer than 92 days');
    }

    const from = fromDay;
    const toExclusive = D.addDays(toDay, 1);

    const [expenses, sessions] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          businessId: user.businessId,
          branchId,
          createdAt: { gte: from, lt: toExclusive },
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          transaction: { select: { id: true, voidedAt: true, voidReason: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cashRegisterSession.findMany({
        where: {
          businessId: user.businessId,
          branchId,
          openedAt: { lt: toExclusive },
          OR: [{ closedAt: null }, { closedAt: { gte: from } }],
        },
        select: { id: true, openedAt: true, closedAt: true },
        orderBy: { openedAt: 'asc' },
      }),
    ]);

    type DayBucket = {
      date: string;
      total: M.Money;
      count: number;
      byCategory: Map<string, { total: M.Money; count: number }>;
      sessions: Array<{ id: string; openedAt: Date; closedAt: Date | null }>;
      expenses: Array<Record<string, unknown>>;
    };
    const buckets = new Map<string, DayBucket>();

    for (const expense of expenses) {
      const date = D.karachiDateString(expense.createdAt);
      let bucket = buckets.get(date);
      if (!bucket) {
        bucket = {
          date,
          total: M.ZERO,
          count: 0,
          byCategory: new Map(),
          sessions: sessions.filter(
            (session) =>
              D.karachiDateString(session.openedAt) === date ||
              (session.closedAt !== null &&
                D.karachiDateString(session.closedAt) === date),
          ),
          expenses: [],
        };
        buckets.set(date, bucket);
      }

      const isVoided = Boolean(expense.transaction?.voidedAt);
      if (!isVoided) {
        bucket.total = M.add(bucket.total, expense.amount);
        bucket.count += 1;
        const category = bucket.byCategory.get(expense.category) ?? {
          total: M.ZERO,
          count: 0,
        };
        category.total = M.add(category.total, expense.amount);
        category.count += 1;
        bucket.byCategory.set(expense.category, category);
      }

      bucket.expenses.push({
        id: expense.id,
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        createdAt: expense.createdAt,
        createdById: expense.createdById,
        createdByName: expense.createdBy?.name ?? null,
        sessionId: expense.sessionId,
        isVoided,
        voidReason: expense.transaction?.voidReason ?? null,
        voidedAt: expense.transaction?.voidedAt ?? null,
      });
    }

    const days = Array.from(buckets.values()).map((bucket) => ({
      date: bucket.date,
      total: M.toApi(bucket.total),
      count: bucket.count,
      byCategory: Array.from(bucket.byCategory.entries())
        .map(([category, value]) => ({
          category,
          total: M.toApi(value.total),
          count: value.count,
        }))
        .sort((a, b) => b.total - a.total),
      sessions: bucket.sessions,
      expenses: bucket.expenses,
    }));

    return {
      success: true,
      from: D.karachiDateString(from),
      to: D.karachiDateString(toDay),
      days,
      total: M.toApi(M.sum(Array.from(buckets.values()).map((b) => b.total))),
      count: days.reduce((acc, day) => acc + day.count, 0),
    };
  }

  /**
   * Void an expense voucher. The creator may void while their galla is still
   * open; an owner or manager may void at any time. The ledger is corrected by a
   * reversal (never by editing the original posting).
   */
  async voidExpense(userId: string, expenseId: string, dto: VoidExpenseDto) {
    const user = await this.getUserWithBusiness(userId);

    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, businessId: user.businessId },
      include: {
        session: { select: { id: true, closedAt: true } },
        transaction: { select: { id: true, voidedAt: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found.');
    if (!expense.transactionId) {
      throw new BadRequestException(
        'This expense has no ledger entry to void.',
      );
    }
    if (expense.transaction?.voidedAt) {
      throw new ConflictException('This expense is already voided.');
    }

    const privileged = user.role === 'OWNER' || user.role === 'MANAGER';
    if (!privileged) {
      if (expense.createdById !== userId) {
        throw new ForbiddenException(
          'Only the person who logged this expense, an owner or a manager can void it.',
        );
      }
      if (!expense.session || expense.session.closedAt) {
        throw new ForbiddenException(
          'The galla for this expense is closed. Ask an owner or manager to void it.',
        );
      }
    }

    const reason = dto.reason.trim();
    const transaction = await this.ledgerService.reverse(
      user.businessId,
      expense.transactionId,
      userId,
      reason,
    );

    await this.invalidateCashCaches(user.businessId, expense.branchId);

    return {
      success: true,
      message: `Expense of Rs ${formatMoney(expense.amount)} voided.`,
      expenseId: expense.id,
      transactionId: transaction.id,
    };
  }

  /**
   * Cash flow totals for one branch over [from, to]. Single source of truth for the
   * live status, the close reconciliation and the Z-report, so all three agree.
   * cashRefunds = |CASH postings| of RETURN ledger transactions (referenceId RET-<orderId>)
   * whose order belongs to the branch (Transaction itself carries no branchId).
   */
  private async computeSessionTotals(
    businessId: string,
    branchId: string,
    from: Date,
    to?: Date,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const window = { gte: from, ...(to ? { lte: to } : {}) };

    const [cashPayments, expenses, returnTxs, reversalTxs] = await Promise.all([
      db.payment.findMany({
        where: {
          method: 'CASH',
          createdAt: window,
          order: { businessId, branchId },
        },
        select: { id: true, amount: true },
      }),
      db.expense.findMany({
        where: {
          businessId,
          branchId,
          createdAt: window,
          OR: [{ transactionId: null }, { transaction: { voidedAt: null } }],
        },
        select: { id: true, amount: true },
      }),
      db.transaction.findMany({
        where: {
          businessId,
          type: 'RETURN',
          createdAt: window,
          referenceId: { startsWith: 'RET-' },
        },
        select: {
          referenceId: true,
          postings: {
            where: { accountId: 'CASH', accountType: 'ASSET' },
            select: { amount: true },
          },
        },
      }),
      // Expense voids that happened in this window but belong to an earlier
      // (already closed) session: the cash came back into the drawer now, so it
      // is an adjustment of this session, not of the closed one.
      db.transaction.findMany({
        where: {
          businessId,
          type: 'EXPENSE_REVERSAL',
          createdAt: window,
        },
        select: {
          id: true,
          description: true,
          createdAt: true,
          postings: {
            where: { accountId: 'CASH', accountType: 'ASSET' },
            select: { amount: true },
          },
          reverses: {
            select: {
              id: true,
              expense: {
                select: {
                  id: true,
                  amount: true,
                  description: true,
                  branchId: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    let cashRefunds = M.ZERO;
    if (returnTxs.length > 0) {
      const orderIds = returnTxs.map((t) => (t.referenceId as string).slice(4));
      const branchOrders = await db.order.findMany({
        where: { id: { in: orderIds }, businessId, branchId },
        select: { id: true },
      });
      const branchOrderIds = new Set(branchOrders.map((o) => o.id));
      for (const t of returnTxs) {
        if (!branchOrderIds.has((t.referenceId as string).slice(4))) continue;
        for (const p of t.postings) {
          // CASH credits on a return are negative; refunded amount is the absolute value
          if (M.lt(p.amount, 0)) cashRefunds = M.add(cashRefunds, M.neg(p.amount));
        }
      }
    }

    let cashAdjustments = M.ZERO;
    const adjustments: Array<{
      transactionId: string;
      expenseId: string | null;
      description: string;
      amount: M.Money;
      createdAt: Date;
    }> = [];
    for (const reversal of reversalTxs) {
      const expense = reversal.reverses?.expense ?? null;
      if (!expense) continue;
      // Same-session voids are already netted out by excluding the expense.
      if (expense.createdAt.getTime() >= from.getTime()) continue;
      if (expense.branchId && expense.branchId !== branchId) continue;
      // An expense reversal debits CASH: the money came back into the drawer.
      const refunded = M.sum(reversal.postings.map((p) => p.amount));
      if (!M.gt(refunded, 0)) continue;
      cashAdjustments = M.add(cashAdjustments, refunded);
      adjustments.push({
        transactionId: reversal.id,
        expenseId: expense.id,
        description:
          reversal.description ??
          expense.description ??
          'Voided expense from an earlier galla',
        amount: refunded,
        createdAt: reversal.createdAt,
      });
    }

    const cashSales = M.sum(cashPayments.map((p) => p.amount));
    const cashExpenses = M.sum(expenses.map((e) => e.amount));
    return {
      cashSales,
      cashExpenses,
      cashRefunds,
      cashAdjustments,
      adjustments,
      salesCount: cashPayments.length,
      expensesCount: expenses.length,
    };
  }

  private expectedCashOf(
    openingBalance: M.MoneyInput,
    t: {
      cashSales: M.Money;
      cashExpenses: M.Money;
      cashRefunds: M.Money;
      cashAdjustments?: M.Money;
    },
  ): M.Money {
    return M.sub(
      M.sub(
        M.add(M.add(openingBalance, t.cashSales), t.cashAdjustments ?? M.ZERO),
        t.cashExpenses,
      ),
      t.cashRefunds,
    );
  }

  /**
   * Step 2: Get Register Status and live drawer calculations
   * Expected Cash = Opening Balance + Cash Sales - Cash Expenses - Cash Refunds
   */
  async getRegisterStatus(userId: string, branchId?: string) {
    const user = await this.getUserWithBusiness(userId);
    if (!branchId) {
      throw new BadRequestException('Select a branch');
    }

    const activeSession = await this.prisma.cashRegisterSession.findFirst({
      where: { businessId: user.businessId, status: 'OPEN', branchId },
      include: {
        openedBy: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
    });

    // Start time for cash flows: session openedAt or start of today
    let sinceTime: Date;
    if (activeSession) {
      sinceTime = activeSession.openedAt;
    } else {
      sinceTime = new Date();
      sinceTime.setHours(0, 0, 0, 0);
    }

    const totals = await this.computeSessionTotals(user.businessId, branchId, sinceTime);
    const openingBalance = activeSession ? M.money(activeSession.openingBalance) : M.ZERO;
    const expectedCash = this.expectedCashOf(openingBalance, totals);

    return {
      success: true,
      isOpen: !!activeSession,
      session: activeSession,
      openingBalance,
      cashSales: totals.cashSales,
      cashExpenses: totals.cashExpenses,
      cashRefunds: totals.cashRefunds,
      cashAdjustments: totals.cashAdjustments,
      adjustments: totals.adjustments,
      expectedCash,
      salesCount: totals.salesCount,
      expensesCount: totals.expensesCount,
    };
  }

  /**
   * Open Register Session
   */
  async openRegister(userId: string, branchId: string, dto: OpenRegisterDto) {
    const user = await this.getUserWithBusiness(userId);
    await this.assertBranch(user.businessId, branchId);

    const existing = await this.prisma.cashRegisterSession.findFirst({
      where: { businessId: user.businessId, status: 'OPEN', branchId },
    });

    if (existing) {
      throw new BadRequestException('A cash register session is already open for this branch.');
    }

    const session = await this.prisma.cashRegisterSession.create({
      data: {
        businessId: user.businessId,
        branchId,
        openedById: user.id,
        openingBalance: M.round2(dto.openingBalance || 0),
        notes: dto.notes?.trim() || null,
        status: 'OPEN',
        openedAt: new Date(),
      },
      include: {
        openedBy: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      message: 'Cash register opened successfully.',
      session,
    };
  }

  /**
   * Step 2: Close Register Session and generate reconciliation
   */
  async closeRegister(userId: string, branchId: string, dto: CloseRegisterDto) {
    const user = await this.getUserWithBusiness(userId);
    await this.assertBranch(user.businessId, branchId);

    const activeSession = await this.prisma.cashRegisterSession.findFirst({
      where: { businessId: user.businessId, status: 'OPEN', branchId },
      orderBy: { openedAt: 'desc' },
    });

    if (!activeSession) {
      throw new BadRequestException('No open register session found to close.');
    }

    const now = new Date();

    // Totals are scoped to the SESSION's branch, never to the request body.
    const { cashSales, cashExpenses, cashRefunds } = await this.computeSessionTotals(
      user.businessId,
      activeSession.branchId as string,
      activeSession.openedAt,
      now,
    );

    const openingBalance = M.money(activeSession.openingBalance);
    const expectedCash = this.expectedCashOf(openingBalance, { cashSales, cashExpenses, cashRefunds });
    const actualCash = M.round2(dto.actualCash);
    const difference = M.sub(actualCash, expectedCash);

    // A variance must be explained in writing before the galla is locked.
    if (!M.isZero(difference) && !dto.notes?.trim()) {
      throw new BadRequestException(
        'A note is required when the counted cash differs from the expected cash.',
      );
    }

    const closedSession = await this.prisma.cashRegisterSession.update({
      where: { id: activeSession.id },
      data: {
        status: 'CLOSED',
        cashSales,
        cashExpenses,
        expectedCash,
        actualCash,
        difference,
        notes: dto.notes?.trim() || null,
        closedById: user.id,
        closedAt: now,
      },
      include: {
        openedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      message: 'Register closed successfully.',
      session: closedSession,
      reconciliation: {
        openingBalance,
        cashSales,
        cashExpenses,
        cashRefunds,
        expectedCash,
        actualCash,
        difference,
        discrepancyType: M.isZero(difference) ? 'BALANCED' : M.lt(difference, 0) ? 'SHORTAGE' : 'OVERAGE',
      },
    };
  }

  /**
   * Step 2: Generate End of Day Z-Report
   */
  async getZReport(userId: string, branchId: string, sessionId?: string) {
    const user = await this.getUserWithBusiness(userId);

    let session: any = null;

    if (sessionId) {
      session = await this.prisma.cashRegisterSession.findUnique({
        where: { id: sessionId },
        include: {
          openedBy: { select: { id: true, name: true, email: true } },
          closedBy: { select: { id: true, name: true, email: true } },
          branch: { select: { id: true, name: true } },
        },
      });
    } else {
      // Find latest closed session or current open session
      session = await this.prisma.cashRegisterSession.findFirst({
        where: { businessId: user.businessId, branchId },
        include: {
          openedBy: { select: { id: true, name: true, email: true } },
          closedBy: { select: { id: true, name: true, email: true } },
          branch: { select: { id: true, name: true } },
        },
        orderBy: { openedAt: 'desc' },
      });
    }

    if (!session) {
      throw new NotFoundException('No register session found.');
    }
    if (session.branchId !== branchId) {
      throw new NotFoundException('Register session not found for this branch.');
    }

    const endTime = session.closedAt || new Date();

    // Itemized cash sales: payments carry no session, so the window applies but
    // the branch is always enforced.
    const cashPayments = await this.prisma.payment.findMany({
      where: {
        method: 'CASH',
        createdAt: {
          gte: session.openedAt,
          lte: endTime,
        },
        order: {
          businessId: user.businessId,
          branchId: session.branchId,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            customer: { select: { name: true, phone: true } },
          },
        },
        receiver: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Itemized cash expenses: the session link wins over the time window, and
    // legacy vouchers with no session still count when they are this branch's
    // and fall inside the window. A branch-less orphan never belongs to a report.
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId: user.businessId,
        OR: [
          { sessionId: session.id },
          {
            sessionId: null,
            branchId: session.branchId,
            createdAt: { gte: session.openedAt, lte: endTime },
          },
        ],
      },
      include: {
        createdBy: { select: { name: true } },
        transaction: { select: { voidedAt: true, voidReason: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const itemizedExpenses = expenses.map((exp) => ({
      ...exp,
      isVoided: Boolean(exp.transaction?.voidedAt),
      voidedAt: exp.transaction?.voidedAt ?? null,
      voidReason: exp.transaction?.voidReason ?? null,
    }));

    // A voucher voided after the galla closed stays in that session's numbers
    // (the cash had already left) and comes back as an adjustment in the next
    // session. A voucher voided before closing nets out here.
    const countedInReport = itemizedExpenses.filter(
      (exp) =>
        !exp.isVoided ||
        (exp.voidedAt !== null && exp.voidedAt.getTime() > endTime.getTime()),
    );

    // Group the session's expenses by category (voided vouchers stay visible).
    const expensesByCategory: Record<string, { total: M.Money; count: number }> = {};
    let expensesCount = 0;
    for (const exp of countedInReport) {
      expensesCount += 1;
      if (!expensesByCategory[exp.category]) {
        expensesByCategory[exp.category] = { total: M.ZERO, count: 0 };
      }
      expensesByCategory[exp.category].total = M.add(expensesByCategory[exp.category].total, exp.amount);
      expensesByCategory[exp.category].count += 1;
    }

    const totals = await this.computeSessionTotals(
      user.businessId,
      session.branchId,
      session.openedAt,
      endTime,
    );
    const cashSalesTotal = totals.cashSales;
    const cashExpensesTotal = M.sum(countedInReport.map((e) => e.amount));
    const expectedCash = this.expectedCashOf(session.openingBalance, {
      ...totals,
      cashExpenses: cashExpensesTotal,
    });
    const actualCash = session.actualCash != null ? M.money(session.actualCash) : expectedCash;
    const difference = session.difference != null ? M.money(session.difference) : M.sub(actualCash, expectedCash);

    return {
      success: true,
      report: {
        session,
        generatedAt: new Date(),
        summary: {
          openingBalance: session.openingBalance,
          cashSales: cashSalesTotal,
          cashExpenses: cashExpensesTotal,
          cashRefunds: totals.cashRefunds,
          cashAdjustments: totals.cashAdjustments,
          expectedCash,
          actualCash,
          difference,
          discrepancyType: M.isZero(difference) ? 'BALANCED' : M.lt(difference, 0) ? 'SHORTAGE' : 'OVERAGE',
        },
        expensesByCategory,
        salesCount: cashPayments.length,
        expensesCount,
        itemizedSales: cashPayments,
        itemizedExpenses,
        adjustments: totals.adjustments,
      },
    };
  }

  /**
   * Get recent register sessions history
   */
  async getRecentSessions(userId: string, branchId: string, limit = 10) {
    const user = await this.getUserWithBusiness(userId);

    const sessions = await this.prisma.cashRegisterSession.findMany({
      where: { businessId: user.businessId, branchId },
      include: {
        openedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: limit,
    });

    return {
      success: true,
      sessions,
    };
  }
}
