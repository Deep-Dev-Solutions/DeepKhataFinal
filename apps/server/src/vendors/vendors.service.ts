import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { LedgerService } from '../ledger/ledger.service';
import * as M from '../common/money';
import * as D from '../common/dates';
import { RecordPurchaseDto } from './dto/record-purchase.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ledgerService: LedgerService,
  ) {}

  private parseAmount(raw: unknown, message: string): M.Money {
    let amt: M.Money;
    try {
      amt = M.round2(raw as M.MoneyInput);
    } catch {
      throw new BadRequestException(message);
    }
    if (raw === null || raw === undefined || raw === '' || !M.gt(amt, 0)) {
      throw new BadRequestException(message);
    }
    return amt;
  }

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

    await this.redis.delete(`vendors:${currentUser.businessId}`);

    return { success: true, vendor };
  }

  async getAllVendors(userId: string, query: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const cacheKey = `vendors:${currentUser.businessId}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

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

      let balance = M.ZERO;
      let totalPurchased = M.ZERO;
      let totalPaid = M.ZERO;
      let lastActivityDate: Date | null = null;

      vendorPostings.forEach((p) => {
        const credit = M.lt(p.amount, 0) ? M.neg(p.amount) : M.ZERO;
        const debit = M.gt(p.amount, 0) ? M.money(p.amount) : M.ZERO;
        totalPurchased = M.add(totalPurchased, credit);
        totalPaid = M.add(totalPaid, debit);
        balance = M.add(balance, M.sub(credit, debit));

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

    const result = { success: true, vendors: formattedVendors };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async getVendorById(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const businessId = currentUser.businessId;
    const cacheKey = `vendor_details:${businessId}:${id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const vendor = await this.prisma.vendor.findFirst({
      where: { id, businessId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const [postings, instancesRaw, movements] = await Promise.all([
      this.prisma.posting.findMany({
        where: {
          accountId: id,
          accountType: 'VENDOR_PAYABLE',
          transaction: { businessId },
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

    let runningBalance = M.ZERO;
    let totalPurchases = M.ZERO;
    let totalPaid = M.ZERO;

    const ledger = postings.map((p) => {
      const credit = M.lt(p.amount, 0) ? M.neg(p.amount) : M.ZERO;
      const debit = M.gt(p.amount, 0) ? M.money(p.amount) : M.ZERO;
      totalPurchases = M.add(totalPurchases, credit);
      totalPaid = M.add(totalPaid, debit);
      runningBalance = M.add(runningBalance, M.sub(credit, debit));

      return {
        id: p.id,
        date: p.createdAt,
        transactionId: p.transactionId,
        referenceId: p.transaction.referenceId,
        type: p.transaction.type,
        description:
          p.transaction.description ||
          (M.lt(p.amount, 0) ? 'Stock Purchase on Credit' : 'Payment to Vendor'),
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
      const costVal = M.money(inst.unitCost);
      const key = `${dateKey}_${inst.productId}_${inst.branchId}_${costVal}`;
      const existing = suppliedInventory.find((x) => x.key === key);

      if (existing) {
        existing.quantity += 1;
        existing.totalCost = M.add(existing.totalCost, costVal);
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
          totalCost: M.ZERO,
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
        prod.totalCost = M.add(prod.totalCost, inst.unitCost);
      }
      if (inst.branch?.name) prod.branches.add(inst.branch.name);
      if (inst.createdAt > prod.lastReceivedDate) {
        prod.lastReceivedDate = inst.createdAt;
      }
    });

    const products = Array.from(productMap.values()).map((p) => ({
      ...p,
      avgUnitCost:
        p.totalQuantity > 0
          ? M.round2(M.money(p.totalCost).div(p.totalQuantity))
          : M.ZERO,
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
    const totalCostValue = M.sum(instancesRaw.map((i) => i.unitCost));

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

    const result = {
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

    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async recordPurchase(
    userId: string,
    vendorId: string,
    data: RecordPurchaseDto,
  ) {
    const { amount, description, dueDate } = data;
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

    const numAmount = this.parseAmount(amount, 'Invalid purchase amount');

    const today = D.startOfKarachiDay();
    let finalDueDate: Date;
    if (dueDate) {
      finalDueDate = new Date(dueDate);
      if (Number.isNaN(finalDueDate.getTime()))
        throw new BadRequestException('Invalid due date');
      if (finalDueDate.getTime() < today.getTime())
        throw new BadRequestException('Due date cannot be in the past');
    } else {
      const business = await this.prisma.business.findUnique({
        where: { id: currentUser.businessId },
        select: { defaultPayableDays: true },
      });
      finalDueDate = D.addDays(today, business?.defaultPayableDays ?? 15);
    }

    const transaction = await this.ledgerService.createBalancedTransaction({
      businessId: currentUser.businessId,
      type: 'VENDOR_PURCHASE',
      description: description || 'Inbound stock purchase',
      dueDate: finalDueDate,
      postings: [
        {
          accountId: 'INVENTORY_ACCOUNT',
          accountType: 'INVENTORY',
          amount: numAmount, // Debit
        },
        {
          accountId: vendorId,
          accountType: 'VENDOR_PAYABLE',
          amount: M.neg(numAmount), // Credit
        },
      ],
    });

    await this.redis.delete(`vendors:${currentUser.businessId}`);
    await this.redis.delete(
      `vendor_details:${currentUser.businessId}:${vendorId}`,
    );

    return { success: true, transaction };
  }

  async recordPayment(
    userId: string,
    vendorId: string,
    data: RecordPaymentDto,
  ) {
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

    const numAmount = this.parseAmount(amount, 'Invalid payment amount');

    const transaction = await this.ledgerService.createBalancedTransaction({
      businessId: currentUser.businessId,
      type: 'VENDOR_PAYMENT',
      description: description || 'Payment to vendor',
      postings: [
        {
          accountId: vendorId,
          accountType: 'VENDOR_PAYABLE',
          amount: numAmount, // Debit (reduces liability)
        },
        {
          accountId: 'CASH',
          accountType: 'ASSET',
          amount: M.neg(numAmount), // Credit (reduces cash)
        },
      ],
    });

    await this.redis.delete(`vendors:${currentUser.businessId}`);
    await this.redis.delete(
      `vendor_details:${currentUser.businessId}:${vendorId}`,
    );

    return { success: true, transaction };
  }
}
