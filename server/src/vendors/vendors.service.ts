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
    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: { in: vendorIds },
        accountType: 'VENDOR_PAYABLE',
        transaction: { businessId: currentUser.businessId },
      },
    });

    const formattedVendors = vendors.map((v) => {
      const vendorPostings = postings.filter((p) => p.accountId === v.id);
      let balance = 0;
      vendorPostings.forEach((p) => {
        balance += p.amount * -1;
      });

      return {
        ...v,
        balance,
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

    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: id,
        accountType: 'VENDOR_PAYABLE',
        transaction: { businessId: currentUser.businessId },
      },
      include: {
        transaction: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let runningBalance = 0;
    const ledger = postings.map((p) => {
      const credit = p.amount < 0 ? Math.abs(p.amount) : 0;
      const debit = p.amount > 0 ? p.amount : 0;
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

    return {
      success: true,
      vendor: {
        ...vendor,
        balance: runningBalance,
        ledger,
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

    if (!amount || isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Invalid amount');
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
              amount: amount, // Debit
            },
            {
              accountId: vendorId,
              accountType: 'VENDOR_PAYABLE',
              amount: -amount, // Credit
            },
          ],
        },
      },
    });

    return { success: true, transaction };
  }
}
