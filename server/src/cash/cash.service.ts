import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LogExpenseDto } from './dto/log-expense.dto';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

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
  async logExpense(userId: string, dto: LogExpenseDto) {
    const user = await this.getUserWithBusiness(userId);

    const parsedAmount = Number(dto.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
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

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the Expense record
      const expense = await tx.expense.create({
        data: {
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
            amount: -parsedAmount, // CREDIT
          },
        ],
      });

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

    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      success: true,
      count: expenses.length,
      totalAmount,
      expenses,
    };
  }

  /**
   * Step 2: Get Register Status and live drawer calculations
   * Expected Cash = Opening Balance + Cash Sales - Cash Expenses
   */
  async getRegisterStatus(userId: string, branchId?: string) {
    const user = await this.getUserWithBusiness(userId);

    const activeSession = await this.prisma.cashRegisterSession.findFirst({
      where: {
        businessId: user.businessId,
        status: 'OPEN',
        ...(branchId ? { branchId } : {}),
      },
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

    // 1. Calculate Cash Sales since sinceTime
    const cashPayments = await this.prisma.payment.findMany({
      where: {
        method: 'CASH',
        createdAt: { gte: sinceTime },
        order: {
          businessId: user.businessId,
        },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        orderId: true,
      },
    });
    const cashSales = cashPayments.reduce((sum, p) => sum + p.amount, 0);

    // 2. Calculate Cash Expenses since sinceTime
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId: user.businessId,
        createdAt: { gte: sinceTime },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        amount: true,
        category: true,
        description: true,
        createdAt: true,
      },
    });
    const cashExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const openingBalance = activeSession ? activeSession.openingBalance : 0;
    const expectedCash = openingBalance + cashSales - cashExpenses;

    return {
      success: true,
      isOpen: !!activeSession,
      session: activeSession,
      openingBalance,
      cashSales,
      cashExpenses,
      expectedCash,
      salesCount: cashPayments.length,
      expensesCount: expenses.length,
    };
  }

  /**
   * Open Register Session
   */
  async openRegister(userId: string, dto: OpenRegisterDto) {
    const user = await this.getUserWithBusiness(userId);

    const existing = await this.prisma.cashRegisterSession.findFirst({
      where: {
        businessId: user.businessId,
        status: 'OPEN',
        ...(dto.branchId ? { branchId: dto.branchId } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('A cash register session is already open for this branch.');
    }

    const session = await this.prisma.cashRegisterSession.create({
      data: {
        businessId: user.businessId,
        branchId: dto.branchId || null,
        openedById: user.id,
        openingBalance: Number(dto.openingBalance) || 0,
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

    const activeSession = await this.prisma.cashRegisterSession.findFirst({
      where: {
        businessId: user.businessId,
        status: 'OPEN',
        ...(dto.branchId ? { branchId: dto.branchId } : {}),
      },
      orderBy: { openedAt: 'desc' },
    });

    if (!activeSession) {
      throw new BadRequestException('No open register session found to close.');
    }

    const now = new Date();

    // 1. Live Cash Sales during session
    const cashPayments = await this.prisma.payment.findMany({
      where: {
        method: 'CASH',
        createdAt: {
          gte: activeSession.openedAt,
          lte: now,
        },
        order: {
          businessId: user.businessId,
        },
      },
      select: { amount: true },
    });
    const cashSales = cashPayments.reduce((sum, p) => sum + p.amount, 0);

    // 2. Live Cash Expenses during session
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId: user.businessId,
        createdAt: {
          gte: activeSession.openedAt,
          lte: now,
        },
        ...(dto.branchId ? { branchId: dto.branchId } : {}),
      },
      select: { amount: true },
    });
    const cashExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const openingBalance = activeSession.openingBalance;
    const expectedCash = openingBalance + cashSales - cashExpenses;
    const actualCash = Number(dto.actualCash);
    const difference = actualCash - expectedCash;

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
        expectedCash,
        actualCash,
        difference,
        discrepancyType: difference === 0 ? 'BALANCED' : difference < 0 ? 'SHORTAGE' : 'OVERAGE',
      },
    };
  }

  /**
   * Step 2: Generate End of Day Z-Report
   */
  async getZReport(userId: string, sessionId?: string) {
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
        where: { businessId: user.businessId },
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
    const expensesByCategory: Record<string, { total: number; count: number }> = {};
    for (const exp of expenses) {
      if (!expensesByCategory[exp.category]) {
        expensesByCategory[exp.category] = { total: 0, count: 0 };
      }
      expensesByCategory[exp.category].total += exp.amount;
      expensesByCategory[exp.category].count += 1;
    }

    const cashSalesTotal = cashPayments.reduce((sum, p) => sum + p.amount, 0);
    const cashExpensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const expectedCash = session.openingBalance + cashSalesTotal - cashExpensesTotal;
    const actualCash = session.actualCash ?? expectedCash;
    const difference = session.difference ?? (actualCash - expectedCash);

    return {
      success: true,
      report: {
        session,
        generatedAt: new Date(),
        summary: {
          openingBalance: session.openingBalance,
          cashSales: cashSalesTotal,
          cashExpenses: cashExpensesTotal,
          expectedCash,
          actualCash,
          difference,
          discrepancyType: difference === 0 ? 'BALANCED' : difference < 0 ? 'SHORTAGE' : 'OVERAGE',
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
  async getRecentSessions(userId: string, limit = 10) {
    const user = await this.getUserWithBusiness(userId);

    const sessions = await this.prisma.cashRegisterSession.findMany({
      where: { businessId: user.businessId },
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
