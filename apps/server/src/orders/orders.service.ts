import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as M from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private ledgerService: LedgerService,
    private redis: RedisService,
  ) {}

  private async invalidateOrderCaches(
    businessId: string,
    branchId?: string | null,
    orderId?: string,
  ): Promise<void> {
    const invalidations = [
      this.redis.deleteByPattern(`orders:${businessId}:*`),
      this.redis.deleteByPattern(`dashboard:${businessId}*`),
      this.redis.deleteByPattern(`reports:*${businessId}*`),
      this.redis.deleteByPattern(`products:${businessId}:*`),
      this.redis.deleteByPattern(`cabinets:${businessId}:*`),
      this.redis.deleteByPattern(`customers:${businessId}:*`),
      this.redis.deleteByPattern(`restock:${businessId}:*`),
    ];
    if (branchId) {
      invalidations.push(
        // products:/cabinets: keys are `<prefix>:${businessId}:branch:...` and are
        // already covered by the businessId wildcards above.
        this.redis.deleteByPattern(`inventory:${businessId}:*`),
        this.redis.deleteByPattern(
          `restock:${businessId}:branch:${branchId}:*`,
        ),
        this.redis.deleteByPattern(
          `dashboard:${businessId}:branch:${branchId}`,
        ),
        this.redis.deleteByPattern(
          `reports:*${businessId}*branch=${branchId}*`,
        ),
      );
    }
    if (orderId) {
      invalidations.push(
        this.redis.delete(`order_details:${businessId}:${orderId}`),
      );
    }
    await Promise.all([...invalidations]);
  }

  /** A branchId from the request is only valid if it belongs to the caller's business. */
  private async assertBranchInBusiness(
    client: Prisma.TransactionClient | PrismaService,
    businessId: string,
    branchId?: string | null,
  ): Promise<void> {
    if (!branchId) return;
    const branch = await client.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new ForbiddenException('Invalid branch');
  }

  async newOrder(userId: string, data: any) {
    const {
      customerId,
      items,
      discount = 0,
      amountPaid = 0,
      paymentMethod = 'CASH',
      walkInName,
      walkInPhone,
      branchId,
    } = data;
    const orderStatus = data.orderStatus || data.status || 'FINAL';

    if (!items || items.length === 0)
      throw new BadRequestException('Cart is empty');

    const parsedDiscount = M.money(Number(discount) || 0);
    const parsedAmountPaid = M.money(Number(amountPaid) || 0);

    if (M.lt(parsedDiscount, 0)) {
      throw new BadRequestException('Discount cannot be negative');
    }
    if (M.lt(parsedAmountPaid, 0)) {
      throw new BadRequestException('Amount paid cannot be negative');
    }

    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException(
          'Item quantity must be greater than zero',
        );
      }
      if (item.isService && item.quantity > 99) {
        throw new BadRequestException('Service quantity cannot exceed 99');
      }
      if (item.isService && Number(item.price) < 0) {
        throw new BadRequestException('Service price cannot be negative');
      }
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');
    const businessId = currentUser.businessId;

    try {
      const completeOrder = await this.prisma.$transaction(async (tx) => {
        await this.assertBranchInBusiness(tx, businessId, branchId);

        let calculatedTotal: M.Money = M.ZERO;
        const secureProducts: Record<string, any> = {};

        for (const item of items) {
          if (item.isService) {
            calculatedTotal = M.add(
              calculatedTotal,
              M.mul(item.price, item.quantity),
            );
            continue;
          }

          if (!item.productId || typeof item.productId !== 'string') {
            throw new BadRequestException('Product is required');
          }
          const product = await tx.product.findFirst({
            where: { id: item.productId, businessId, deletedAt: null },
          });
          if (!product) throw new BadRequestException(`Product not found`);
          const available = await tx.productInstance.count({
            where: { productId: product.id, status: 'AVAILABLE' },
          });
          if (available < item.quantity) {
            throw new BadRequestException(
              `Not enough stock for ${product.name}. Only ${available} left.`,
            );
          }
          secureProducts[item.productId] = product;
          const unitPrice: M.Money =
            item.price !== undefined && item.price !== null
              ? M.money(item.price)
              : product.basePrice;
          calculatedTotal = M.add(
            calculatedTotal,
            M.mul(unitPrice, item.quantity),
          );
        }

        if (M.gt(parsedDiscount, calculatedTotal)) {
          throw new BadRequestException(
            `Discount (${parsedDiscount.toString()}) cannot exceed total sale amount (${calculatedTotal.toString()})`,
          );
        }

        const finalGrandTotal = M.sub(calculatedTotal, parsedDiscount);
        const udhaarRequested = M.sub(finalGrandTotal, parsedAmountPaid);

        let calculatedPaymentStatus = 'UNPAID';
        if (M.gte(parsedAmountPaid, finalGrandTotal)) {
          calculatedPaymentStatus = 'PAID';
        } else if (M.gt(parsedAmountPaid, 0)) {
          calculatedPaymentStatus = 'PARTIAL';
        }

        if (
          (orderStatus === 'FINAL' || orderStatus === 'COMPLETED') &&
          M.gt(udhaarRequested, 0) &&
          !customerId
        ) {
          throw new Error(
            'Walk-in customers must pay in full for completed sales. Please select or create a customer profile to give Udhaar.',
          );
        }

        const order = await tx.order.create({
          data: {
            id: data.id || undefined,
            businessId,
            branchId: branchId || null,
            customerId: customerId || null,
            walkInName: walkInName || null,
            walkInPhone: walkInPhone || null,
            totalAmount: finalGrandTotal,
            discount: parsedDiscount,
            paymentStatus: calculatedPaymentStatus as any,
            status: orderStatus as any,
            createdBy: userId,
            items: {
              create: items.map((item: any) => ({
                productId: item.isService ? null : item.productId,
                quantity: item.quantity,
                price: item.isService
                  ? M.money(item.price)
                  : item.price !== undefined && item.price !== null
                    ? M.money(item.price)
                    : secureProducts[item.productId].basePrice,
                isService: item.isService || false,
                serviceName: item.serviceName || null,
                notes: item.notes || null,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        if (orderStatus !== 'ESTIMATE') {
          for (const item of items) {
            if (item.isService) continue;

            // Prioritize instances in the active branch, falling back across business
            let instances = branchId
              ? await tx.productInstance.findMany({
                  where: {
                    productId: item.productId,
                    branchId,
                    status: 'AVAILABLE',
                  },
                  take: item.quantity,
                })
              : [];

            if (instances.length < item.quantity) {
              const needed = item.quantity - instances.length;
              const alreadyFoundIds = instances.map((i) => i.id);
              const fallbackInstances = await tx.productInstance.findMany({
                where: {
                  productId: item.productId,
                  id: { notIn: alreadyFoundIds },
                  status: 'AVAILABLE',
                },
                take: needed,
              });
              instances = [...instances, ...fallbackInstances];
            }

            if (instances.length < item.quantity) {
              throw new BadRequestException(
                `Not enough available instances for product ${secureProducts[item.productId]?.name || item.productId}.`,
              );
            }

            // Claim the candidates atomically: only rows still AVAILABLE are updated,
            // so a concurrent sale cannot take the same instances.
            const instanceStatus: 'SOLD' | 'MEMO_LOCKED' =
              orderStatus === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
            const claimIds = instances.map((i) => i.id);
            const claimed = await tx.productInstance.updateMany({
              where: { id: { in: claimIds }, status: 'AVAILABLE' },
              data: { status: instanceStatus },
            });
            if (claimed.count !== claimIds.length) {
              throw new ConflictException('Stock changed, please retry');
            }

            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                cabinetId: instances[0]?.cabinetId || null,
                quantity: item.quantity,
                direction: 'OUT',
                referenceType: orderStatus === 'MEMO' ? 'MEMO' : 'ORDER',
                referenceId: order.id,
                userId,
                businessId,
              },
            });
          }

          if (M.gt(parsedAmountPaid, 0)) {
            await tx.payment.create({
              data: {
                orderId: order.id,
                amount: parsedAmountPaid,
                method: paymentMethod as any,
                receivedBy: userId,
              },
            });
          }
        }

        if (order.status === 'FINAL' || order.status === 'COMPLETED') {
          await this.postDoubleEntrySequence(order, parsedAmountPaid, tx);
        }

        return order;
      });

      await this.invalidateOrderCaches(
        businessId,
        completeOrder.branchId,
        completeOrder.id,
      );

      return {
        success: true,
        message: 'Order placed successfully',
        order: completeOrder,
      };
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Failed to process order');
    }
  }

  /**
   * Account that carries an order's unpaid balance: the customer's khata, or
   * for walk-in sales an OTHER_AR account keyed by the order id.
   */
  private receivableAccount(order: { id: string; customerId?: string | null }) {
    return order.customerId
      ? { accountId: order.customerId, accountType: 'CUSTOMER_AR' }
      : { accountId: order.id, accountType: 'OTHER_AR' };
  }

  private async postDoubleEntrySequence(
    order: any,
    amountPaid: M.MoneyInput,
    tx: Prisma.TransactionClient,
  ) {
    const discount = M.money(order.discount);
    const grossItemsAmount: M.Money =
      order.items && order.items.length > 0
        ? M.sum(
            order.items.map((item: any) => M.mul(item.price, item.quantity)),
          )
        : M.add(order.totalAmount, discount);

    const netAmount = M.max(M.ZERO, M.sub(grossItemsAmount, discount));

    const postings: {
      accountId: string;
      accountType: string;
      amount: M.Money;
    }[] = [];

    // Credit REVENUE matching the exact netAmount (-netAmount)
    if (M.gt(netAmount, 0)) {
      postings.push({
        accountId: 'REVENUE',
        accountType: 'REVENUE',
        amount: M.neg(netAmount),
      });
    }

    // Debit CASH and/or CUSTOMER_AR to sum exactly to +netAmount
    const cashPortion = M.min(M.money(amountPaid), netAmount);
    const arPortion = M.sub(netAmount, cashPortion);

    if (M.gt(cashPortion, 0)) {
      postings.push({
        accountId: 'CASH',
        accountType: 'ASSET',
        amount: cashPortion,
      });
    }

    if (M.gt(arPortion, 0)) {
      postings.push({ ...this.receivableAccount(order), amount: arPortion });
    }

    if (postings.length > 0) {
      await this.ledgerService.createBalancedTransaction(
        {
          businessId: order.businessId,
          referenceId: order.id,
          type: 'SALE',
          description: `Sale for Order ${order.id}`,
          postings,
        },
        tx,
      );
    }
  }

  async getAllOrders(userId: string, query: any) {
    const { search, status, paymentStatus, days = 7, branchId } = query;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');
    const businessId = currentUser.businessId;
    const cacheKey = `orders:${businessId}:branch=${branchId}:search=${encodeURIComponent(search || '')}:status=${encodeURIComponent(status || 'All')}:paymentStatus=${encodeURIComponent(paymentStatus || 'All')}:days=${encodeURIComponent(days)}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    let queryConditions: any = { businessId, branchId };

    if (days !== 'all' && !isNaN(parseInt(days as string))) {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - parseInt(days as string));
      queryConditions.createdAt = { gte: dateLimit };
    }

    if (status && status !== 'All') queryConditions.status = status;
    if (paymentStatus && paymentStatus !== 'All')
      queryConditions.paymentStatus = paymentStatus;

    if (search) {
      const searchNum = parseInt(search.replace(/\D/g, ''), 10);
      const orConditions: any[] = [
        { id: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
        { walkInName: { contains: search, mode: 'insensitive' } },
        { walkInPhone: { contains: search, mode: 'insensitive' } },
      ];
      if (!isNaN(searchNum)) {
        orConditions.push({ orderNumber: searchNum });
      }
      queryConditions.OR = orConditions;
    }

    const orders = await this.prisma.order.findMany({
      where: queryConditions,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOrders = orders.map((order) => {
      const totalPaid = M.sum(order.payments.map((p) => p.amount));
      const pendingBalance = M.sub(order.totalAmount, totalPaid);
      return {
        ...order,
        totalPaid: M.toApi(totalPaid),
        pendingBalance: M.gt(pendingBalance, 0) ? M.toApi(pendingBalance) : 0,
      };
    });

    const result = { success: true, orders: formattedOrders };
    await this.redis.set(cacheKey, result, 300);
    return result;
  }

  async getOrderById(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    const cacheKey = `order_details:${currentUser.businessId}:${id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const order = await this.prisma.order.findFirst({
      where: { id, businessId: currentUser.businessId },
      include: {
        customer: true,
        items: { include: { product: { select: { name: true } } } },
        payments: {
          include: { receiver: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
        creator: { select: { name: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const result = { success: true, order };
    await this.redis.set(cacheKey, result, 600);
    return result;
  }

  async updateOrderStatus(
    orderIdOrUserId: string,
    statusOrOrderId: string,
    businessIdOrData: any,
    currentUserId?: string,
  ) {
    let orderId: string;
    let status: string;
    let businessId: string | undefined;
    let actingUserId: string | undefined = currentUserId;

    if (typeof businessIdOrData === 'object' && businessIdOrData !== null) {
      orderId = statusOrOrderId;
      status = businessIdOrData.status;
      actingUserId = orderIdOrUserId;
    } else {
      orderId = orderIdOrUserId;
      status = statusOrOrderId;
      businessId = businessIdOrData;
    }

    if (!status) throw new BadRequestException('Status is required');

    let resolvedBusinessId = businessId;
    if (!resolvedBusinessId) {
      const existingOrder = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { businessId: true },
      });
      if (!existingOrder) throw new NotFoundException('Order not found');
      resolvedBusinessId = existingOrder.businessId;
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId: resolvedBusinessId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const resolvedUserId =
      actingUserId ||
      order.createdBy ||
      (
        await this.prisma.user.findFirst({
          where: { businessId: resolvedBusinessId },
          select: { id: true },
        })
      )?.id ||
      '';

    let updatedOrder: any;

    if (
      order.status === 'ESTIMATE' &&
      (status === 'FINAL' ||
        status === 'COMPLETED' ||
        status === 'MEMO' ||
        status === 'PENDING')
    ) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          if (!item.productId) continue;

          const instances = await tx.productInstance.findMany({
            where: { productId: item.productId, status: 'AVAILABLE' },
            take: item.quantity,
          });

          if (instances.length < item.quantity) {
            throw new BadRequestException(
              `Not enough available instances for product ${item.productId}.`,
            );
          }

          const instanceStatus =
            status === 'MEMO' || status === 'PENDING' ? 'MEMO_LOCKED' : 'SOLD';
          await tx.productInstance.updateMany({
            where: { id: { in: instances.map((i) => i.id) } },
            data: { status: instanceStatus },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              cabinetId: instances[0]?.cabinetId || null,
              quantity: item.quantity,
              direction: 'OUT',
              referenceType:
                status === 'MEMO' || status === 'PENDING' ? 'MEMO' : 'ORDER',
              referenceId: order.id,
              userId: resolvedUserId,
              businessId: resolvedBusinessId,
            },
          });
        }

        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: status as any },
        });
      });
    } else if (
      status === 'RETURNED' &&
      (order.status === 'MEMO' || order.status === 'PENDING')
    ) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          if (!item.productId) continue;

          const instances = await tx.productInstance.findMany({
            where: { productId: item.productId, status: 'MEMO_LOCKED' },
            take: item.quantity,
          });
          if (instances.length > 0) {
            await tx.productInstance.updateMany({
              where: { id: { in: instances.map((i) => i.id) } },
              data: { status: 'AVAILABLE' },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              cabinetId: instances[0]?.cabinetId || null,
              quantity: item.quantity,
              direction: 'IN',
              referenceType: 'RETURN',
              referenceId: order.id,
              userId: resolvedUserId,
              businessId: resolvedBusinessId,
            },
          });
        }
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: 'RETURNED' as any },
        });
      });
    } else if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          if (!item.productId) continue;

          const instanceStatus =
            order.status === 'MEMO' || order.status === 'PENDING'
              ? 'MEMO_LOCKED'
              : 'SOLD';
          const instances = await tx.productInstance.findMany({
            where: { productId: item.productId, status: instanceStatus },
            take: item.quantity,
          });
          if (instances.length > 0) {
            await tx.productInstance.updateMany({
              where: { id: { in: instances.map((i) => i.id) } },
              data: { status: 'AVAILABLE' },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              cabinetId: instances[0]?.cabinetId || null,
              quantity: item.quantity,
              direction: 'IN',
              referenceType: 'ADJUSTMENT',
              notes: 'Order cancelled',
              referenceId: order.id,
              userId: resolvedUserId,
              businessId: resolvedBusinessId,
            },
          });
        }

        // Clean up financial ledger transactions and postings for this cancelled order
        await tx.transaction.deleteMany({
          where: {
            businessId: resolvedBusinessId,
            referenceId: order.id,
          },
        });

        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: status as any },
        });
      });
    } else {
      updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: status as any },
      });
    }

    await this.invalidateOrderCaches(
      resolvedBusinessId,
      order.branchId,
      orderId,
    );

    return {
      success: true,
      message: `Order status updated to ${status}`,
      order: updatedOrder,
    };
  }

  async settleMemo(userId: string, id: string, data: any) {
    const { amountPaid, paymentMethod = 'CASH' } = data;
    const parsedAmountPaid = M.money(Number(amountPaid) || 0);

    if (M.lt(parsedAmountPaid, 0)) {
      throw new BadRequestException('Amount paid cannot be negative');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    const order = await this.prisma.order.findFirst({
      where: { id, businessId: currentUser?.businessId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'MEMO') {
      throw new BadRequestException('Order is not in MEMO status');
    }

    const existingPaid = M.sum(order.payments.map((p) => p.amount));
    const remainingBalance = M.sub(order.totalAmount, existingPaid);

    if (M.gt(parsedAmountPaid, remainingBalance)) {
      throw new BadRequestException(
        `Amount paid (${parsedAmountPaid.toString()}) cannot exceed remaining balance (${remainingBalance.toString()})`,
      );
    }

    const totalPaid = M.add(existingPaid, parsedAmountPaid);
    const newPaymentStatus = M.gte(totalPaid, order.totalAmount)
      ? 'PAID'
      : M.gt(totalPaid, 0)
        ? 'PARTIAL'
        : 'UNPAID';

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const instances = await tx.productInstance.findMany({
          where: { productId: item.productId, status: 'MEMO_LOCKED' },
          take: item.quantity,
        });
        if (instances.length > 0) {
          await tx.productInstance.updateMany({
            where: { id: { in: instances.map((i) => i.id) } },
            data: { status: 'SOLD' },
          });
        }
      }

      if (M.gt(parsedAmountPaid, 0)) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: parsedAmountPaid,
            method: paymentMethod as any,
            receivedBy: userId,
          },
        });
      }

      await tx.order.update({
        where: { id },
        data: {
          status: 'FINAL',
          paymentStatus: newPaymentStatus as any,
        },
      });

      await this.postDoubleEntrySequence(order, totalPaid, tx);
    });

    if (currentUser?.businessId) {
      await this.invalidateOrderCaches(
        currentUser.businessId,
        order.branchId,
        id,
      );
    }

    return {
      success: true,
      message: 'Memo converted to final sale successfully',
    };
  }

  async recordPayment(userId: string, data: any) {
    const { orderId, amount, method } = data;
    if (!orderId) throw new BadRequestException('Order ID is required');
    const parsedAmount = M.money(parseFloat(amount) || 0);
    if (!M.gt(parsedAmount, 0))
      throw new BadRequestException('Valid amount greater than 0 is required');
    if (!method) throw new BadRequestException('Payment method is required');

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId: currentUser.businessId },
      select: {
        id: true,
        branchId: true,
        totalAmount: true,
        customerId: true,
        payments: { select: { amount: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const businessId = currentUser.businessId;
    const totalPaidSoFar = M.sum(order.payments.map((p) => p.amount));
    const remainingBalance = M.sub(order.totalAmount, totalPaidSoFar);

    if (M.lte(remainingBalance, 0))
      throw new BadRequestException('This order is already fully paid.');
    if (M.gt(parsedAmount, remainingBalance)) {
      throw new BadRequestException(
        `Amount exceeds the pending balance. Maximum payable amount is Rs. ${M.toApi(remainingBalance).toLocaleString()}`,
      );
    }

    const newTotalPaid = M.add(totalPaidSoFar, parsedAmount);
    const newPaymentStatus = M.gte(newTotalPaid, order.totalAmount)
      ? 'PAID'
      : 'PARTIAL';

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: parsedAmount,
          method: method as any,
          receivedBy: userId,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: newPaymentStatus },
      });

      // Ledger entry commits or rolls back together with the payment.
      await this.ledgerService.createBalancedTransaction(
        {
          businessId,
          referenceId: order.id,
          type: 'PAYMENT',
          description: `Payment for Order ${order.id}`,
          postings: [
            {
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: parsedAmount,
            },
            {
              ...this.receivableAccount(order),
              amount: M.neg(parsedAmount),
            },
          ],
        },
        tx,
      );
    });

    await this.invalidateOrderCaches(
      currentUser.businessId,
      order.branchId,
      order.id,
    );

    return { success: true, message: 'Payment recorded successfully' };
  }

  async getPublicInvoice(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: { select: { name: true } } } },
        payments: { orderBy: { createdAt: 'desc' } },
        business: {
          select: {
            name: true,
            logoUrl: true,
            address: true,
            phone: true,
            email: true,
            currency: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Invoice not found');

    const totalPaid = M.sum(order.payments.map((p) => p.amount));
    const pendingBalance = M.sub(order.totalAmount, totalPaid);

    const formattedInvoice = {
      ...order,
      orderNumber: `ORD-${order.orderNumber || order.id.substring(0, 4)}`,
      totalPaid: M.toApi(totalPaid),
      pendingBalance: M.gt(pendingBalance, 0) ? M.toApi(pendingBalance) : 0,
    };

    return { success: true, invoice: formattedInvoice };
  }

  async processReturn(userId: string, id: string, data: any) {
    const { itemsToReturn, returnStatus = 'AVAILABLE' } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    const order = await this.prisma.order.findFirst({
      where: { id, businessId: currentUser.businessId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'FINAL' && order.status !== 'MEMO') {
      throw new BadRequestException('Can only return FINAL or MEMO orders');
    }

    if (!itemsToReturn || itemsToReturn.length === 0) {
      throw new BadRequestException('No items provided to return');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        let refundAmount: M.Money = M.ZERO;

        for (const returnItem of itemsToReturn) {
          const orderItem = order.items.find(
            (i) => i.productId === returnItem.productId,
          );
          if (!orderItem) {
            throw new BadRequestException(
              `Product ${returnItem.productId} not found in order`,
            );
          }

          if (!returnItem.quantity || returnItem.quantity <= 0) {
            throw new BadRequestException(
              `Return quantity must be greater than zero for product ${returnItem.productId}`,
            );
          }

          if (returnItem.quantity > orderItem.quantity) {
            throw new BadRequestException(
              `Return quantity (${returnItem.quantity}) cannot exceed purchased quantity (${orderItem.quantity}) for product ${returnItem.productId}`,
            );
          }

          refundAmount = M.add(
            refundAmount,
            M.mul(orderItem.price, returnItem.quantity),
          );

          const targetStatus =
            returnItem.returnCondition === 'DEFECTIVE'
              ? 'DEFECTIVE'
              : 'AVAILABLE';

          const instanceStatus =
            order.status === 'MEMO' || order.status === 'PENDING'
              ? 'MEMO_LOCKED'
              : 'SOLD';

          const instances = await tx.productInstance.findMany({
            where: {
              productId: returnItem.productId,
              status: instanceStatus,
            },
            take: returnItem.quantity,
          });

          if (instances.length > 0) {
            await tx.productInstance.updateMany({
              where: { id: { in: instances.map((i) => i.id) } },
              data: { status: targetStatus },
            });
          }

          await tx.inventoryMovement.create({
            data: {
              productId: returnItem.productId,
              cabinetId: instances[0]?.cabinetId || null,
              quantity: returnItem.quantity,
              direction: 'IN',
              referenceType: 'RETURN',
              referenceId: order.id,
              userId,
              businessId: order.businessId,
            },
          });
        }

        await tx.order.update({
          where: { id },
          data: { status: 'RETURNED' },
        });

        if (order.status === 'FINAL' || order.status === 'COMPLETED') {
          const postings: {
            accountId: string;
            accountType: string;
            amount: M.Money;
          }[] = [];

          postings.push({
            accountId: 'REVENUE',
            accountType: 'REVENUE',
            amount: refundAmount,
          });

          const totalPaid = M.sum(order.payments.map((p) => p.amount));
          if (M.gt(totalPaid, 0)) {
            postings.push({
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: M.neg(M.min(refundAmount, totalPaid)),
            });
          }

          const remainingRefund = M.sub(refundAmount, totalPaid);
          if (M.gt(remainingRefund, 0)) {
            postings.push({
              ...this.receivableAccount(order),
              amount: M.neg(remainingRefund),
            });
          }

          await this.ledgerService.createBalancedTransaction(
            {
              businessId: order.businessId,
              referenceId: `RET-${order.id}`,
              type: 'RETURN',
              description: `Return for Order ${order.id}`,
              postings,
            },
            tx,
          );
        }
      });
    } catch (error) {
      console.error('Failed to process return:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to process return. Please check inventory mapping or ledger invariant.',
      );
    }

    await this.invalidateOrderCaches(
      currentUser.businessId,
      order.branchId,
      id,
    );

    return { success: true, message: 'Return processed successfully' };
  }
}
