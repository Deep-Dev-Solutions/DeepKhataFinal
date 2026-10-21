import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import * as M from '../common/money';
import { Prisma } from '@prisma/client';
import { UpdateCustomerDto } from './dto/customer.dto';

// Store-wide default credit line for new Udhar accounts (PKR).
const DEFAULT_CREDIT_LIMIT = 50000;

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private async invalidateCustomers(businessId: string): Promise<void> {
    await this.redis.deleteByPattern(`customers:${businessId}:*`);
  }

  /**
   * Batched ledger balances (debit-positive) per customer, excluding postings
   * tied to CANCELLED orders. One query for postings + one for cancelled ids,
   * regardless of how many customers. Customers with no active postings are
   * absent from the returned map.
   */
  private async loadLedgerBalances(
    businessId: string,
    customerIds: string[],
  ): Promise<Map<string, M.Money>> {
    const result = new Map<string, M.Money>();
    if (customerIds.length === 0) return result;

    const cancelled = await this.prisma.order.findMany({
      where: {
        businessId,
        customerId: { in: customerIds },
        status: 'CANCELLED',
      },
      select: { id: true },
    });
    const cancelledIds = cancelled.map((o) => o.id);

    const grouped = await this.prisma.posting.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: customerIds },
        transaction: { businessId },
        ...(cancelledIds.length > 0
          ? {
              OR: [
                { transaction: { referenceId: null } },
                { transaction: { referenceId: { notIn: cancelledIds } } },
              ],
            }
          : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    for (const g of grouped) {
      if (g._count._all > 0) result.set(g.accountId, M.money(g._sum.amount));
    }
    return result;
  }

  /**
   * The ONE customer balance definition (used by list, detail and ledger):
   * the clamped (>= 0) ledger balance over non-cancelled postings; if the
   * customer has no active postings at all, fall back to the outstanding
   * amount on non-cancelled, non-returned orders.
   */
  private computeBalance(
    ledgerBalance: M.Money | undefined,
    orders: {
      status: string;
      totalAmount: M.MoneyInput;
      payments: { amount: M.MoneyInput }[];
    }[],
  ): M.Money {
    if (ledgerBalance !== undefined) return M.max(ledgerBalance, 0);
    return M.sum(
      orders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'RETURNED')
        .map((o) =>
          M.max(
            M.sub(o.totalAmount, M.sum(o.payments.map((p) => p.amount))),
            0,
          ),
        ),
    );
  }

  async newCustomer(userId: string, data: any) {
    const { name, phone, shopName, address, email } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    // STAFF cannot set a credit line (same rule as PATCH customerrisk).
    const mayChooseCreditLimit = currentUser.role !== 'STAFF';

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
        // Udhar is enabled immediately with the store default credit line.
        creditLimit:
          mayChooseCreditLimit &&
          data.creditLimit !== undefined &&
          data.creditLimit !== null
            ? parseFloat(data.creditLimit)
            : DEFAULT_CREDIT_LIMIT,
        businessId: currentUser.businessId,
      },
    });

    await this.invalidateCustomers(currentUser.businessId);

    return { success: true, customer };
  }

  async customerDetails(userId: string, id: string, dto: UpdateCustomerDto) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('No business found.');

    // Explicit pick: never spread the request body into prisma.
    const data: Prisma.CustomerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.shopName !== undefined) data.shopName = dto.shopName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.cnicNumber !== undefined) data.cnicNumber = dto.cnicNumber;
    if (dto.guarantorPhone !== undefined)
      data.guarantorPhone = dto.guarantorPhone;
    if (dto.paymentTermsDays !== undefined)
      data.paymentTermsDays = dto.paymentTermsDays;

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { id, businessId: currentUser.businessId },
    });

    if (!existingCustomer)
      throw new NotFoundException('Customer not found in your workspace.');

    const updatedCustomer = await this.prisma.customer.update({
      where: { id: existingCustomer.id },
      data,
    });

    await this.invalidateCustomers(currentUser.businessId);

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

    await this.invalidateCustomers(currentUser.businessId);

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

    const businessId = currentUser.businessId;
    const cacheKey = `customers:${businessId}:search=${encodeURIComponent(search || '')}:unpaid=${unpaid || 'false'}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const queryConditions: any = { businessId };

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
        creditLimit: true,
        _count: { select: { orders: { where: { status: { not: 'CANCELLED' } } } } },
        orders: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            totalAmount: true,
            status: true,
            payments: { select: { amount: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const ledgerBalances = await this.loadLedgerBalances(
      businessId,
      customersData.map((c) => c.id),
    );

    let formattedCustomers = customersData.map((customer) => {
      const lifetimeSpend = M.sum(
        customer.orders
          .filter((o) => o.status !== 'RETURNED')
          .map((o) => o.totalAmount),
      );
      const outstandingBalance = this.computeBalance(
        ledgerBalances.get(customer.id),
        customer.orders,
      );

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        shopName: customer.shopName || '',
        address: customer.address || '',
        email: customer.email || '',
        creditLimit: customer.creditLimit,
        totalOrders: customer._count.orders,
        lifetimeValue: lifetimeSpend,
        balance: outstandingBalance,
      };
    });

    if (unpaid === 'true') {
      formattedCustomers = formattedCustomers.filter((c) => M.gt(c.balance, 0));
    }

    const result = { success: true, customers: formattedCustomers };
    await this.redis.set(cacheKey, result, 3600);
    return result;
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

    // Exclude postings tied to CANCELLED orders to eliminate "Ghost Udhaar"
    const cancelledOrderIds = new Set(
      customer.orders
        .filter((o) => o.status === 'CANCELLED')
        .map((o) => o.id),
    );

    const activePostings = postings.filter(
      (p) =>
        !p.transaction.referenceId ||
        !cancelledOrderIds.has(p.transaction.referenceId),
    );

    let runningBalance = M.ZERO;
    const ledger = activePostings.map((p) => {
      const debit = M.gt(p.amount, 0) ? M.money(p.amount) : M.ZERO;
      const credit = M.lt(p.amount, 0) ? M.neg(p.amount) : M.ZERO;
      runningBalance = M.add(runningBalance, p.amount);

      return {
        id: p.id,
        date: p.createdAt,
        transactionId: p.transactionId,
        referenceId: p.transaction.referenceId,
        type: p.transaction.type,
        description:
          p.transaction.description ||
          (M.gt(p.amount, 0) ? 'Udhar (Sale)' : 'Payment Received'),
        debit,
        credit,
        balance: runningBalance,
      };
    });

    let lifetimeSpend = M.ZERO;
    let validOrderCount = 0;

    const orderHistory = customer.orders.map((order) => {
      const orderTotal = M.money(order.totalAmount);
      const orderPaid = M.sum(order.payments.map((p) => p.amount));
      let orderBalance = M.sub(orderTotal, orderPaid);

      if (order.status === 'CANCELLED' || order.status === 'RETURNED') {
        orderBalance = M.ZERO;
      } else {
        validOrderCount += 1;
        lifetimeSpend = M.add(lifetimeSpend, orderTotal);
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
        balance: M.max(orderBalance, 0),
      };
    });

    const finalOutstandingBalance = this.computeBalance(
      activePostings.length > 0 ? runningBalance : undefined,
      customer.orders,
    );

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
      include: { orders: { include: { payments: true } } },
    });

    if (!customer) throw new NotFoundException('Customer not found.');

    const [postings, cancelledOrders] = await Promise.all([
      this.prisma.posting.findMany({
        where: {
          accountId: id,
          transaction: { businessId: currentUser.businessId },
        },
        include: {
          transaction: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          customerId: id,
          businessId: currentUser.businessId,
          status: 'CANCELLED',
        },
        select: { id: true },
      }),
    ]);

    const cancelledOrderIds = new Set(cancelledOrders.map((o) => o.id));
    const activePostings = postings.filter(
      (p) =>
        !p.transaction.referenceId ||
        !cancelledOrderIds.has(p.transaction.referenceId),
    );

    let runningBalance = M.ZERO;
    const ledger = activePostings.map((p) => {
      const debit = M.gt(p.amount, 0) ? M.money(p.amount) : M.ZERO;
      const credit = M.lt(p.amount, 0) ? M.neg(p.amount) : M.ZERO;
      runningBalance = M.add(runningBalance, p.amount);

      return {
        id: p.id,
        date: p.createdAt,
        transactionId: p.transactionId,
        referenceId: p.transaction.referenceId,
        type: p.transaction.type,
        description:
          p.transaction.description ||
          (M.gt(p.amount, 0) ? 'Udhar (Sale)' : 'Payment Received'),
        debit,
        credit,
        balance: runningBalance,
      };
    });

    return {
      success: true,
      customerId: id,
      customerName: customer.name,
      totalDebit: M.sum(ledger.map((item) => item.debit)),
      totalCredit: M.sum(ledger.map((item) => item.credit)),
      currentBalance: this.computeBalance(
        activePostings.length > 0 ? runningBalance : undefined,
        customer.orders,
      ),
      ledger,
    };
  }
}
