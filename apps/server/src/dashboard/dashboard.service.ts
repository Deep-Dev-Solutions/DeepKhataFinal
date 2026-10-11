import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import * as M from '../common/money';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

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

  async getDashboardData(userId: string, branchId: string, query?: any) {
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

    const cacheKey = `dashboard:${businessId}:branch:${branchId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const branchFilter = { branchId };

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
              product: { select: { defaultCostPrice: true, basePrice: true } },
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
          branchId,
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
    const dailyGrossSales = M.sum(
      todaysOrdersWithItems.map((order) => order.totalAmount),
    );

    // 2. Total Pending Customer Udhar
    const pendingPayments = unpaidOrders.reduce((sum, order) => {
      const totalPaid = M.sum(order.payments.map((payment) => payment.amount));
      return M.add(sum, M.max(M.ZERO, M.sub(order.totalAmount, totalPaid)));
    }, M.ZERO);

    // 3. Daily Cost of Goods Sold (COGS)
    let dailyCOGS = M.ZERO;
    for (const order of todaysOrdersWithItems) {
      for (const item of order.items) {
        if (!item.isService) {
          dailyCOGS = M.add(
            dailyCOGS,
            M.mul(item.product?.defaultCostPrice, item.quantity),
          );
        }
      }
    }

    // 4. Daily Expenses
    const dailyExpenses = M.sum(todaysExpenses.map((exp) => exp.amount));

    // 5. Net Profit = Gross Revenue - COGS - Daily Expenses
    const netProfit = M.sub(M.sub(dailyGrossSales, dailyCOGS), dailyExpenses);
    const grossNum = M.toApi(dailyGrossSales);
    const profitMargin =
      grossNum > 0 ? (M.toApi(netProfit) / grossNum) * 100 : 0;

    // 6. Revenue trend compared to yesterday
    const yesterdayRevenue = M.toApi(
      M.sum(yesterdaysOrders.map((o) => o.totalAmount)),
    );
    const revenueGrowth =
      yesterdayRevenue > 0
        ? ((grossNum - yesterdayRevenue) / yesterdayRevenue) * 100
        : grossNum > 0
          ? 100
          : 0;

    const activeOrders = await this.prisma.order.count({
      where: { businessId, branchId, status: { not: 'CANCELLED' } },
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
      const dayRevenue = M.sum(
        orders
          .filter((order) => {
            const createdAt = new Date(order.createdAt);
            return createdAt >= date && createdAt < nextDay;
          })
          .map((order) => order.totalAmount),
      );

      chartData.push({
        name: dayKey.split(' ')[0],
        revenue: M.toApi(dayRevenue),
      });
    }

    const paymentHealth = [
      {
        name: 'Paid Securely',
        value: M.toApi(
          paymentBreakdown.find((item) => item.method === 'CASH')?._sum.amount,
        ),
        color: '#10b981',
      },
      { name: 'Pending (Udhaar)', value: M.toApi(pendingPayments), color: '#f43f5e' },
      {
        name: 'Partial Advances',
        value: M.toApi(
          paymentBreakdown.find((item) => item.method === 'BANK')?._sum.amount,
        ),
        color: '#f59e0b',
      },
    ];

    const recentOrders = orders.slice(0, 5).map((order) => ({
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || 'Walk-in Customer',
      totalAmount: M.toApi(order.totalAmount),
      paymentStatus: order.paymentStatus,
      relativeTime: this.formatRelativeTime(order.createdAt),
    }));

    const isStaff = currentUser?.role === 'STAFF';

    const result = {
      success: true,
      kpis: {
        todayRevenue: grossNum,
        dailyGrossSales: grossNum,
        pendingPayments: M.toApi(pendingPayments),
        pendingUdhar: M.toApi(pendingPayments),
        dailyCOGS: isStaff ? null : M.toApi(dailyCOGS),
        dailyExpenses: isStaff ? null : M.toApi(dailyExpenses),
        netProfit: isStaff ? null : M.toApi(netProfit),
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

    await this.redis.set(cacheKey, result, 600);
    return result;
  }
}
