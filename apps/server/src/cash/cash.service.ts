import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import * as M from '../common/money';
import { RedisService } from '../redis/redis.service';
import { LogExpenseDto } from './dto/log-expense.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';

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
   */
  async logExpense(userId: string, dto: LogExpenseDto, id?: string) {
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

    const category = dto.category.trim().toUpperCase();

    // Check if there is an active open register session
    const activeSession = await this.prisma.cashRegisterSession.findFirst({
      where: {
        businessId: user.businessId,
        status: 'OPEN',
        ...(dto.branchId ? { branchId: dto.branchId } : {}),
      },
      orderBy: { openedAt: 'desc' },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create the Expense record
      const expense = await tx.expense.create({
        data: {
          ...(id ? { id } : {}),
          businessId: user.businessId,
          branchId: dto.branchId || null,
          amount: parsedAmount,
          category,
          description: dto.description?.trim() || null,
          createdById: user.id,
          sessionId: activeSession?.id || null,
        },
      });

      // 2. Post to Double-Entry Ledger (Balanced Transaction)
      // Debit EXPENSE (positive), Credit CASH (negative)
      const ledgerTx = await this.ledgerService.createBalancedTransaction({
        businessId: user.businessId,
        referenceId: expense.id,
        type: 'EXPENSE',
        description: `Operational Expense: [${category}] ${dto.description || ''}`.trim(),
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

    await this.invalidateCashCaches(user.businessId, dto.branchId);
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

    const totalAmount = M.sum(expenses.map((e) => e.amount));

    return {
      success: true,
      count: expenses.length,
      totalAmount,
      expenses,
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
  ) {
    const window = { gte: from, ...(to ? { lte: to } : {}) };

    const [cashPayments, expenses, returnTxs] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          method: 'CASH',
          createdAt: window,
          order: { businessId, branchId },
        },
        select: { id: true, amount: true },
      }),
      this.prisma.expense.findMany({
        where: { businessId, branchId, createdAt: window },
        select: { id: true, amount: true },
      }),
      this.prisma.transaction.findMany({
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
    ]);

    let cashRefunds = M.ZERO;
    if (returnTxs.length > 0) {
      const orderIds = returnTxs.map((t) => (t.referenceId as string).slice(4));
      const branchOrders = await this.prisma.order.findMany({
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

    const cashSales = M.sum(cashPayments.map((p) => p.amount));
    const cashExpenses = M.sum(expenses.map((e) => e.amount));
    return {
      cashSales,
      cashExpenses,
      cashRefunds,
      salesCount: cashPayments.length,
      expensesCount: expenses.length,
    };
  }

  private expectedCashOf(
    openingBalance: M.MoneyInput,
    t: { cashSales: M.Money; cashExpenses: M.Money; cashRefunds: M.Money },
  ): M.Money {
    return M.sub(
      M.sub(M.add(openingBalance, t.cashSales), t.cashExpenses),
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
      expectedCash,
      salesCount: totals.salesCount,
      expensesCount: totals.expensesCount,
    };
  }

  /**
   * Open Register Session
   */
  async openRegister(userId: string, dto: OpenRegisterDto) {
    const user = await this.getUserWithBusiness(userId);

    if (!dto.branchId) {
      throw new BadRequestException('Select a branch');
    }

    const existing = await this.prisma.cashRegisterSession.findFirst({
      where: { businessId: user.businessId, status: 'OPEN', branchId: dto.branchId },
    });

    if (existing) {
      throw new BadRequestException('A cash register session is already open for this branch.');
    }

    const session = await this.prisma.cashRegisterSession.create({
      data: {
        businessId: user.businessId,
        branchId: dto.branchId,
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
  async closeRegister(userId: string, dto: CloseRegisterDto) {
    const user = await this.getUserWithBusiness(userId);

    if (!dto.branchId) {
      throw new BadRequestException('Select a branch');
    }

    const activeSession = await this.prisma.cashRegisterSession.findFirst({
      where: { businessId: user.businessId, status: 'OPEN', branchId: dto.branchId },
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

    // Itemized cash sales
    const cashPayments = await this.prisma.payment.findMany({
      where: {
        method: 'CASH',
        createdAt: {
          gte: session.openedAt,
          lte: endTime,
        },
        order: {
          businessId: user.businessId,
          ...(session.branchId ? { branchId: session.branchId } : {}),
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

    // Itemized cash expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId: user.businessId,
        createdAt: {
          gte: session.openedAt,
          lte: endTime,
        },
        ...(session.branchId ? { branchId: session.branchId } : {}),
      },
      include: {
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group expenses by category
    const expensesByCategory: Record<string, { total: M.Money; count: number }> = {};
    for (const exp of expenses) {
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
    const cashExpensesTotal = totals.cashExpenses;
    const expectedCash = this.expectedCashOf(session.openingBalance, totals);
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
          expectedCash,
          actualCash,
          difference,
          discrepancyType: M.isZero(difference) ? 'BALANCED' : M.lt(difference, 0) ? 'SHORTAGE' : 'OVERAGE',
        },
        expensesByCategory,
        salesCount: cashPayments.length,
        expensesCount: expenses.length,
        itemizedSales: cashPayments,
        itemizedExpenses: expenses,
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
