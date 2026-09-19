import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getFinancialOverview(userId: string, query: any) {
    const { days = 7, branchId } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No workspace found.');
    const businessId = currentUser.businessId;

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - parseInt(days as string));

    const branchFilter = branchId ? { branchId } : {};

    const orders = await this.prisma.order.findMany({
      where: {
        businessId,
        ...branchFilter,
        createdAt: { gte: dateLimit },
        status: { not: 'CANCELLED' },
      },
      include: { items: { include: { product: true } } },
    });

    const payments = await this.prisma.payment.groupBy({
      by: ['method'],
      _sum: { amount: true },
      where: { order: { businessId, ...branchFilter, createdAt: { gte: dateLimit } } },
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalDiscounts = 0;
    const dailyData: Record<string, any> = {};

    orders.forEach((order) => {
      totalRevenue += order.totalAmount;
      totalDiscounts += order.discount || 0;

      const dateStr = new Date(order.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      if (!dailyData[dateStr])
        dailyData[dateStr] = { date: dateStr, revenue: 0, profit: 0 };

      let orderCost = 0;
      order.items.forEach((item) => {
        const cost = (item.product?.costPrice || 0) * item.quantity;
        orderCost += cost;
      });
      totalCost += orderCost;

      dailyData[dateStr].revenue += order.totalAmount;
      dailyData[dateStr].profit += order.totalAmount - orderCost;
    });

    const paymentFlow = payments.map((p) => ({
      name:
        p.method === 'CASH'
          ? 'Cash'
          : p.method === 'BANK'
            ? 'Bank Transfer'
            : 'Online',
      value: p._sum.amount || 0,
      color:
        p.method === 'CASH'
          ? '#10b981'
          : p.method === 'BANK'
            ? '#3b82f6'
            : '#f59e0b',
    }));

    const allPaymentsTotal = payments.reduce(
      (sum, p) => sum + (p._sum.amount || 0),
      0,
    );
    const pendingDues = totalRevenue - allPaymentsTotal;
    if (pendingDues > 0) {
      paymentFlow.push({
        name: 'Unpaid (Udhaar)',
        value: pendingDues,
        color: '#f43f5e',
      });
    }

    return {
      success: true,
      kpis: {
        totalRevenue,
        netProfit: totalRevenue - totalCost,
        averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        pendingDues: pendingDues > 0 ? pendingDues : 0,
      },
      revenueTrend: Object.values(dailyData),
      paymentFlow,
    };
  }

  async getInventoryInsights(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No workspace found.');
    const businessId = currentUser.businessId;

    let topProducts = [];
    try {
      const topSelling = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, price: true },
        where: { order: { businessId, status: { not: 'CANCELLED' } } },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      });

      for (const item of topSelling) {
        if (!item.productId) continue;
        const prod = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            name: true,
            basePrice: true,
            _count: {
              select: { instances: { where: { status: 'AVAILABLE' } } },
            },
          },
        });
        if (prod) {
          topProducts.push({
            name: prod.name,
            sold: item._sum.quantity || 0,
            revenue: item._sum.price || 0,
            stock: prod._count.instances || 0,
          });
        }
      }
    } catch (e) {
      topProducts = [];
    }

    let deadStock = [];
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activeProductIds = await this.prisma.orderItem.findMany({
        where: { order: { businessId, createdAt: { gte: thirtyDaysAgo } } },
        select: { productId: true },
        distinct: ['productId'],
      });

      const activeIdsArray = activeProductIds
        .map((a) => a.productId)
        .filter(Boolean);

      const deadStockItems = await this.prisma.product.findMany({
        where: {
          businessId,
          instances: { some: { status: 'AVAILABLE' } },
          id: { notIn: activeIdsArray.length ? activeIdsArray : ['__none__'] },
        },
        select: {
          name: true,
          costPrice: true,
          basePrice: true,
          _count: {
            select: { instances: { where: { status: 'AVAILABLE' } } },
          },
        },
        take: 5,
      });

      deadStock = deadStockItems.map((p) => ({
        name: p.name,
        daysUnsold: 30,
        stock: p._count.instances || 0,
        tiedValue: (p._count.instances || 0) * (p.costPrice || p.basePrice || 0),
      }));
    } catch (e) {
      deadStock = [];
    }

    return { success: true, topProducts, deadStock };
  }

  async getStaffPerformance(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    const businessId = currentUser.businessId;

    const staffStats = await this.prisma.order.groupBy({
      by: ['createdBy'],
      _sum: { totalAmount: true },
      _count: { id: true },
      where: { businessId, status: { not: 'CANCELLED' } },
    });

    const staffPerformance = [];
    for (const stat of staffStats) {
      if (stat.createdBy) {
        const staffUser = await this.prisma.user.findUnique({
          where: { id: stat.createdBy },
          select: { name: true, role: true },
        });
        if (staffUser) {
          const roleFormatted =
            staffUser.role.charAt(0) + staffUser.role.slice(1).toLowerCase();
          staffPerformance.push({
            name: `${staffUser.name} (${roleFormatted})`,
            orders: stat._count.id,
            revenue: stat._sum.totalAmount || 0,
          });
        }
      }
    }
    return { success: true, staffPerformance };
  }

  async getCustomerInsights(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    const businessId = currentUser.businessId;

    const vipStats = await this.prisma.order.groupBy({
      by: ['customerId'],
      _sum: { totalAmount: true },
      _count: { id: true },
      where: {
        businessId,
        status: { not: 'CANCELLED' },
        customerId: { not: null },
      },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 10,
    });

    const vipCustomers = [];
    for (const stat of vipStats) {
      if (stat.customerId) {
        const cust = await this.prisma.customer.findUnique({
          where: { id: stat.customerId },
          select: { name: true, isDefaulter: true },
        });
        if (cust) {
          vipCustomers.push({
            name: cust.name,
            type: cust.isDefaulter ? 'Defaulter' : 'Standard',
            orders: stat._count.id,
            spent: stat._sum.totalAmount || 0,
          });
        }
      }
    }
    return { success: true, vipCustomers };
  }
}
