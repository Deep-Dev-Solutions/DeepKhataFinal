import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private formatRelativeTime(dateValue: Date | string) {
    const diffMs = Date.now() - new Date(dateValue).getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return new Date(dateValue).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  async getDashboardData(userId: string, query?: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    let businessId = currentUser?.businessId;
    if (!businessId && currentUser?.role === 'SUPER_ADMIN') {
      const firstBiz = await this.prisma.business.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      businessId = firstBiz?.id;
    }

    if (!businessId) {
      throw new BadRequestException('User does not belong to a workspace');
    }

    const branchId = query?.branchId;
    const branchFilter = branchId ? { branchId } : {};

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfSevenDays = new Date(now);
    startOfSevenDays.setDate(startOfSevenDays.getDate() - 6);
    startOfSevenDays.setHours(0, 0, 0, 0);

    const [
      orders,
      todaysOrdersWithItems,
      unpaidOrders,
      paymentBreakdown,
      todaysExpenses,
      yesterdaysOrders,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { businessId, ...branchFilter, status: { not: 'CANCELLED' } },
        include: {
          customer: { select: { name: true } },
          payments: { select: { amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.order.findMany({
        where: {
          businessId,
          ...branchFilter,
          status: { not: 'CANCELLED' },
          createdAt: { gte: startOfToday },
        },
        include: {
          items: {
            include: {
              product: { select: { costPrice: true, basePrice: true } },
            },
          },
        },
      }),
      this.prisma.order.findMany({
        where: {
          businessId,
          ...branchFilter,
          status: { not: 'CANCELLED' },
          paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        },
        select: {
          id: true,
          totalAmount: true,
          paymentStatus: true,
          customerId: true,
          createdAt: true,
          payments: { select: { amount: true } },
        },
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amount: true },
        where: {
          order: { businessId, ...branchFilter, createdAt: { gte: startOfSevenDays } },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          businessId,
          createdAt: { gte: startOfToday },
        },
        select: { amount: true },
      }),
      (() => {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        return this.prisma.order.findMany({
          where: {
            businessId,
            ...branchFilter,
            status: { not: 'CANCELLED' },
            createdAt: { gte: startOfYesterday, lt: startOfToday },
          },
          select: { totalAmount: true },
        });
      })(),
    ]);

    // 1. Daily Gross Sales
    const dailyGrossSales = todaysOrdersWithItems.reduce(
      (sum, order) => sum + (Number(order.totalAmount) || 0),
      0,
    );

    // 2. Total Pending Customer Udhar
    const pendingPayments = unpaidOrders.reduce((sum, order) => {
      const totalPaid = order.payments.reduce(
        (paymentSum, payment) => paymentSum + Number(payment.amount || 0),
        0,
      );
      return sum + Math.max(0, Number(order.totalAmount || 0) - totalPaid);
    }, 0);

    // 3. Daily Cost of Goods Sold (COGS)
    let dailyCOGS = 0;
    for (const order of todaysOrdersWithItems) {
      for (const item of order.items) {
        if (!item.isService) {
          const unitCost = Number(item.product?.costPrice ?? 0);
          dailyCOGS += unitCost * item.quantity;
        }
      }
    }

    // 4. Daily Expenses
    const dailyExpenses = todaysExpenses.reduce(
      (sum, exp) => sum + (Number(exp.amount) || 0),
      0,
    );

    // 5. Net Profit = Gross Revenue - COGS - Daily Expenses
    const netProfit = dailyGrossSales - dailyCOGS - dailyExpenses;
    const profitMargin =
      dailyGrossSales > 0 ? (netProfit / dailyGrossSales) * 100 : 0;

    // 6. Revenue trend compared to yesterday
    const yesterdayRevenue = yesterdaysOrders.reduce(
      (sum, o) => sum + (Number(o.totalAmount) || 0),
      0,
    );
    const revenueGrowth =
      yesterdayRevenue > 0
        ? ((dailyGrossSales - yesterdayRevenue) / yesterdayRevenue) * 100
        : dailyGrossSales > 0
          ? 100
          : 0;

    const activeOrders = await this.prisma.order.count({
      where: { businessId, status: { not: 'CANCELLED' } },
    });

    const pendingOrderCount = unpaidOrders.length;

    // 7-day revenue chart data
    const chartData = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayKey = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const dayRevenue = orders
        .filter((order) => {
          const createdAt = new Date(order.createdAt);
          return createdAt >= date && createdAt < nextDay;
        })
        .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

      chartData.push({ name: dayKey.split(' ')[0], revenue: dayRevenue });
    }

    const paymentHealth = [
      {
        name: 'Paid Securely',
        value:
          paymentBreakdown.find((item) => item.method === 'CASH')?._sum
            .amount || 0,
        color: '#10b981',
      },
      { name: 'Pending (Udhaar)', value: pendingPayments, color: '#f43f5e' },
      {
        name: 'Partial Advances',
        value:
          paymentBreakdown.find((item) => item.method === 'BANK')?._sum
            .amount || 0,
        color: '#f59e0b',
      },
    ];

    const recentOrders = orders.slice(0, 5).map((order) => ({
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || 'Walk-in Customer',
      totalAmount: Number(order.totalAmount || 0),
      paymentStatus: order.paymentStatus,
      relativeTime: this.formatRelativeTime(order.createdAt),
    }));

    const isStaff = currentUser?.role === 'STAFF';

    return {
      success: true,
      kpis: {
        todayRevenue: dailyGrossSales,
        dailyGrossSales,
        pendingPayments,
        pendingUdhar: pendingPayments,
        dailyCOGS: isStaff ? null : dailyCOGS,
        dailyExpenses: isStaff ? null : dailyExpenses,
        netProfit: isStaff ? null : netProfit,
        profitMargin: isStaff ? null : Number(profitMargin.toFixed(1)),
        revenueGrowth: Number(revenueGrowth.toFixed(1)),
        activeOrders,
        pendingOrderCount,
        isStaff,
      },
      chartData,
      paymentHealth,
      recentOrders,
    };
  }
}
