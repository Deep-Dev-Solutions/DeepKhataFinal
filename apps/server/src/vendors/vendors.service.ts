import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async createVendor(userId: string, data: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const vendor = await this.prisma.vendor.create({
      data: {
        businessName: data.businessName,
        contactName: data.contactName,
        phone: data.phone,
        address: data.address,
        businessId: currentUser.businessId,
      },
    });

    return { success: true, vendor };
  }

  async getAllVendors(userId: string, query: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const vendors = await this.prisma.vendor.findMany({
      where: { businessId: currentUser.businessId },
      orderBy: { createdAt: 'desc' },
    });

    const vendorIds = vendors.map((v) => v.id);
    const [postings, instances] = await Promise.all([
      this.prisma.posting.findMany({
        where: {
          accountId: { in: vendorIds },
          accountType: 'VENDOR_PAYABLE',
          transaction: { businessId: currentUser.businessId },
        },
        include: {
          transaction: { select: { createdAt: true } },
        },
      }),
      this.prisma.productInstance.findMany({
        where: {
          vendorId: { in: vendorIds },
        },
        select: {
          vendorId: true,
          productId: true,
          status: true,
          unitCost: true,
          createdAt: true,
        },
      }),
    ]);

    const formattedVendors = vendors.map((v) => {
      const vendorPostings = postings.filter((p) => p.accountId === v.id);
      const vendorInstances = instances.filter((i) => i.vendorId === v.id);

      let balance = 0;
      let totalPurchased = 0;
      let totalPaid = 0;
      let lastActivityDate: Date | null = null;

      vendorPostings.forEach((p) => {
        const credit = p.amount < 0 ? Math.abs(p.amount) : 0;
        const debit = p.amount > 0 ? p.amount : 0;
        totalPurchased += credit;
        totalPaid += debit;
        balance += credit - debit;

        const txDate = p.transaction?.createdAt;
        if (txDate && (!lastActivityDate || txDate > lastActivityDate)) {
          lastActivityDate = txDate;
        }
      });

      const uniqueProductIds = new Set(vendorInstances.map((i) => i.productId));
      const totalUnitsSupplied = vendorInstances.length;
      const inStockUnits = vendorInstances.filter(
        (i) => i.status === 'AVAILABLE',
      ).length;

      vendorInstances.forEach((i) => {
        if (!lastActivityDate || i.createdAt > lastActivityDate) {
          lastActivityDate = i.createdAt;
        }
      });

      return {
        ...v,
        balance,
        totalPurchased,
        totalPaid,
        totalUnitsSupplied,
        productsCount: uniqueProductIds.size,
        inStockUnits,
        lastActivityDate,
      };
    });

    return { success: true, vendors: formattedVendors };
  }

  async getVendorById(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const vendor = await this.prisma.vendor.findFirst({
      where: { id, businessId: currentUser.businessId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const [postings, instancesRaw, movements] = await Promise.all([
      this.prisma.posting.findMany({
        where: {
          accountId: id,
          accountType: 'VENDOR_PAYABLE',
          transaction: { businessId: currentUser.businessId },
        },
        include: {
          transaction: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.productInstance.findMany({
        where: { vendorId: id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              basePrice: true,
              category: { select: { name: true } },
            },
          },
          branch: { select: { id: true, name: true } },
          cabinet: {
            select: {
              id: true,
              name: true,
              location: true,
              rack: true,
              shelf: true,
              bin: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryMovement.findMany({
        where: { vendorId: id },
        include: {
          product: { select: { name: true, sku: true } },
          cabinet: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    let runningBalance = 0;
    let totalPurchases = 0;
    let totalPaid = 0;

    const ledger = postings.map((p) => {
      const credit = p.amount < 0 ? Math.abs(p.amount) : 0;
      const debit = p.amount > 0 ? p.amount : 0;
      totalPurchases += credit;
      totalPaid += debit;
      runningBalance += credit - debit;

      return {
        id: p.id,
        date: p.createdAt,
        transactionId: p.transactionId,
        referenceId: p.transaction.referenceId,
        type: p.transaction.type,
        description:
          p.transaction.description ||
          (p.amount < 0 ? 'Stock Purchase on Credit' : 'Payment to Vendor'),
        debit,
        credit,
        balance: runningBalance,
      };
    });

    // 1. Grouped Batches for "Supplied Inventory" view
    const suppliedInventory: any[] = [];
    instancesRaw.forEach((inst) => {
      const dateKey = inst.createdAt.toISOString().split('T')[0];
      const cabName = inst.cabinet?.name || 'General';
      const costVal = inst.unitCost ?? 0;
      const key = `${dateKey}_${inst.productId}_${inst.condition}_${inst.branchId}_${costVal}`;
      const existing = suppliedInventory.find((x) => x.key === key);

      if (existing) {
        existing.quantity += 1;
        existing.totalCost += costVal;
        if (inst.status === 'AVAILABLE') {
          existing.availableCount += 1;
        } else {
          existing.soldCount += 1;
        }
      } else {
        suppliedInventory.push({
          key,
          date: inst.createdAt,
          productId: inst.productId,
          productName: inst.product.name,
          sku: inst.product.sku,
          category: inst.product.category?.name || 'General',
          condition: inst.condition,
          quantity: 1,
          availableCount: inst.status === 'AVAILABLE' ? 1 : 0,
          soldCount: inst.status !== 'AVAILABLE' ? 1 : 0,
          unitCost: inst.unitCost,
          totalCost: costVal,
          branchName: inst.branch.name,
          cabinetName: cabName,
          cabinetLocation: inst.cabinet?.location || null,
        });
      }
    });
    suppliedInventory.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // 2. Aggregated Distinct Products purchased from this Vendor
    const productMap = new Map<string, any>();
    instancesRaw.forEach((inst) => {
      const pId = inst.productId;
      if (!productMap.has(pId)) {
        productMap.set(pId, {
          productId: pId,
          productName: inst.product.name,
          sku: inst.product.sku,
          category: inst.product.category?.name || 'General',
          basePrice: inst.product.basePrice,
          totalQuantity: 0,
          availableQuantity: 0,
          soldQuantity: 0,
          totalCost: 0,
          conditions: new Set<string>(),
          branches: new Set<string>(),
          lastReceivedDate: inst.createdAt,
        });
      }
      const prod = productMap.get(pId)!;
      prod.totalQuantity += 1;
      if (inst.status === 'AVAILABLE') {
        prod.availableQuantity += 1;
      } else {
        prod.soldQuantity += 1;
      }
      if (inst.unitCost) {
        prod.totalCost += inst.unitCost;
      }
      if (inst.condition) prod.conditions.add(inst.condition);
      if (inst.branch?.name) prod.branches.add(inst.branch.name);
      if (inst.createdAt > prod.lastReceivedDate) {
        prod.lastReceivedDate = inst.createdAt;
      }
    });

    const products = Array.from(productMap.values()).map((p) => ({
      ...p,
      avgUnitCost:
        p.totalQuantity > 0 ? Math.round(p.totalCost / p.totalQuantity) : 0,
      conditions: Array.from(p.conditions),
      branches: Array.from(p.branches),
    }));

    // Overall vendor metrics
    const totalUnitsSupplied = instancesRaw.length;
    const availableUnits = instancesRaw.filter(
      (i) => i.status === 'AVAILABLE',
    ).length;
    const soldUnits = instancesRaw.filter(
      (i) => i.status !== 'AVAILABLE',
    ).length;
    const totalCostValue = instancesRaw.reduce(
      (sum, i) => sum + (i.unitCost || 0),
      0,
    );

    const metrics = {
      totalPurchases,
      totalPaid,
      balance: runningBalance,
      totalUnitsSupplied,
      availableUnits,
      soldUnits,
      totalCostValue,
      distinctProductsCount: products.length,
      lastPurchaseDate:
        ledger.length > 0
          ? ledger[ledger.length - 1].date
          : instancesRaw[0]?.createdAt || null,
    };

    return {
      success: true,
      vendor: {
        ...vendor,
        balance: runningBalance,
        ledger,
        suppliedInventory,
        products,
        movements,
        metrics,
      },
    };
  }

  async recordPurchase(userId: string, vendorId: string, data: any) {
    const { amount, description } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, businessId: currentUser.businessId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      throw new BadRequestException('Invalid purchase amount');
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        businessId: currentUser.businessId,
        type: 'VENDOR_PURCHASE',
        description: description || 'Inbound stock purchase',
        postings: {
          create: [
            {
              accountId: 'INVENTORY_ACCOUNT',
              accountType: 'INVENTORY',
              amount: numAmount, // Debit
            },
            {
              accountId: vendorId,
              accountType: 'VENDOR_PAYABLE',
              amount: -numAmount, // Credit
            },
          ],
        },
      },
    });

    return { success: true, transaction };
  }

  async recordPayment(userId: string, vendorId: string, data: any) {
    const { amount, description } = data;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, businessId: currentUser.businessId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        businessId: currentUser.businessId,
        type: 'VENDOR_PAYMENT',
        description: description || 'Payment to vendor',
        postings: {
          create: [
            {
              accountId: vendorId,
              accountType: 'VENDOR_PAYABLE',
              amount: numAmount, // Debit (reduces liability)
            },
            {
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: -numAmount, // Credit (reduces cash)
            },
          ],
        },
      },
    });

    return { success: true, transaction };
  }
}
