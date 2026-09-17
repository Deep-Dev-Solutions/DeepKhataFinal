import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async newCustomer(userId: string, data: any) {
    const { name, phone, shopName, address, email } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const customerExists = await this.prisma.customer.findFirst({
      where: { businessId: currentUser.businessId, phone },
    });

    if (customerExists)
      throw new BadRequestException(
        'Customer with this phone number already exists',
      );

    const customer = await this.prisma.customer.create({
      data: {
        name,
        phone,
        shopName: shopName || null,
        address: address || null,
        email: email || null,
        businessId: currentUser.businessId,
      },
    });

    return { success: true, customer };
  }

  async customerDetails(userId: string, id: string, data: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { id, businessId: currentUser.businessId },
    });

    if (!existingCustomer)
      throw new NotFoundException('Customer not found in your workspace.');

    const updatedCustomer = await this.prisma.customer.update({
      where: { id },
      data,
    });

    return {
      success: true,
      message: 'Customer details updated',
      customer: updatedCustomer,
    };
  }

  async customerRisk(userId: string, id: string, data: any) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (currentUser.role === 'STAFF') {
      throw new ForbiddenException(
        'Only Owners and Managers can change credit limits.',
      );
    }

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { id, businessId: currentUser.businessId },
    });

    if (!existingCustomer) throw new NotFoundException('Customer not found.');

    const updatedCustomer = await this.prisma.customer.update({
      where: { id },
      data: {
        creditLimit: parseFloat(data.creditLimit),
        isDefaulter: Boolean(data.isDefaulter),
      },
    });

    return {
      success: true,
      message: 'Risk settings updated securely.',
      customer: updatedCustomer,
    };
  }

  async getAllCustomers(userId: string, query: any) {
    const { search, unpaid } = query;
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const queryConditions: any = { businessId: currentUser.businessId };

    if (search) {
      queryConditions.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shopName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const customersData = await this.prisma.customer.findMany({
      where: queryConditions,
      select: {
        id: true,
        name: true,
        phone: true,
        shopName: true,
        address: true,
        email: true,
        _count: { select: { orders: true } },
        orders: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            totalAmount: true,
            payments: { select: { amount: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let formattedCustomers = customersData.map((customer) => {
      let lifetimeSpend = 0;
      let totalPaid = 0;

      customer.orders.forEach((order) => {
        lifetimeSpend += order.totalAmount;
        order.payments.forEach((payment) => {
          totalPaid += payment.amount;
        });
      });

      const outstandingBalance = lifetimeSpend - totalPaid;

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        shopName: customer.shopName || '',
        address: customer.address || '',
        email: customer.email || '',
        totalOrders: customer._count.orders,
        lifetimeValue: lifetimeSpend,
        balance: outstandingBalance > 0 ? outstandingBalance : 0,
      };
    });

    if (unpaid === 'true') {
      formattedCustomers = formattedCustomers.filter((c) => c.balance > 0);
    }

    return { success: true, customers: formattedCustomers };
  }

  async getCustomerById(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId: currentUser.businessId },
      include: {
        orders: {
          include: { payments: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found.');

    // Fetch chronological ledger postings for double-entry accuracy
    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: id,
        transaction: { businessId: currentUser.businessId },
      },
      include: {
        transaction: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let runningBalance = 0;
    const ledger = postings.map((p) => {
      const debit = p.amount > 0 ? p.amount : 0;
      const credit = p.amount < 0 ? Math.abs(p.amount) : 0;
      runningBalance += p.amount;

      return {
        id: p.id,
        date: p.createdAt,
        transactionId: p.transactionId,
        referenceId: p.transaction.referenceId,
        type: p.transaction.type,
        description:
          p.transaction.description ||
          (p.amount > 0 ? 'Udhar (Sale)' : 'Payment Received'),
        debit,
        credit,
        balance: runningBalance,
      };
    });

    let lifetimeSpend = 0;
    let totalOutstanding = 0;
    let validOrderCount = 0;

    const orderHistory = customer.orders.map((order) => {
      let orderTotal = order.totalAmount;
      let orderPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
      let orderBalance = orderTotal - orderPaid;

      if (order.status !== 'CANCELLED' && order.status !== 'RETURNED') {
        validOrderCount += 1;
        lifetimeSpend += orderTotal;
        totalOutstanding += orderBalance;
      }

      return {
        id: order.id,
        orderNumber: `ORD-${order.orderNumber || order.id.substring(0, 4)}`,
        date: new Date(order.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        total: orderTotal,
        status: order.status,
        payment: order.paymentStatus,
        balance: orderBalance > 0 ? orderBalance : 0,
      };
    });

    const finalOutstandingBalance =
      postings.length > 0
        ? runningBalance
        : totalOutstanding > 0
          ? totalOutstanding
          : 0;

    const formattedCustomer = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      shopName: customer.shopName || '',
      email: customer.email || '',
      address: customer.address || '',
      cnic: customer.cnicNumber || '',
      guarantorPhone: customer.guarantorPhone || '',
      creditLimit: customer.creditLimit,
      isDefaulter: customer.isDefaulter,
      joined: new Date(customer.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      metrics: {
        totalOrders: validOrderCount,
        lifetimeValue: lifetimeSpend,
        outstandingBalance: finalOutstandingBalance,
        ledgerBalance: runningBalance,
      },
      orderHistory,
      ledger,
    };

    return { success: true, customer: formattedCustomer };
  }

  async getCustomerLedger(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId: currentUser.businessId },
    });

    if (!customer) throw new NotFoundException('Customer not found.');

    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: id,
        transaction: { businessId: currentUser.businessId },
      },
      include: {
        transaction: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let runningBalance = 0;
    const ledger = postings.map((p) => {
      const debit = p.amount > 0 ? p.amount : 0;
      const credit = p.amount < 0 ? Math.abs(p.amount) : 0;
      runningBalance += p.amount;

      return {
        id: p.id,
        date: p.createdAt,
        transactionId: p.transactionId,
        referenceId: p.transaction.referenceId,
        type: p.transaction.type,
        description:
          p.transaction.description ||
          (p.amount > 0 ? 'Udhar (Sale)' : 'Payment Received'),
        debit,
        credit,
        balance: runningBalance,
      };
    });

    return {
      success: true,
      customerId: id,
      customerName: customer.name,
      totalDebit: ledger.reduce((sum, item) => sum + item.debit, 0),
      totalCredit: ledger.reduce((sum, item) => sum + item.credit, 0),
      currentBalance: runningBalance,
      ledger,
    };
  }
}
