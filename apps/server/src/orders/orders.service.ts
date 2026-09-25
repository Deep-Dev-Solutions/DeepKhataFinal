import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
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
    orderId?: string,
  ): Promise<void> {
    const invalidations = [
      this.redis.deleteByPattern(`orders:${businessId}:*`),
      this.redis.deleteByPattern(`dashboard:${businessId}*`),
      this.redis.deleteByPattern(`reports:*${businessId}*`),
      this.redis.deleteByPattern(`products:${businessId}:*`),
    ];
    if (orderId) {
      invalidations.push(
        this.redis.delete(`order_details:${businessId}:${orderId}`),
      );
    }
    await Promise.all([
      ...invalidations,
    ]);
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

    const parsedDiscount = Number(discount) || 0;
    const parsedAmountPaid = Number(amountPaid) || 0;

    if (parsedDiscount < 0) {
      throw new BadRequestException('Discount cannot be negative');
    }
    if (parsedAmountPaid < 0) {
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
        let calculatedTotal = 0;
        const secureProducts: Record<string, any> = {};

        for (const item of items) {
          if (item.isService) {
            calculatedTotal += Number(item.price) * item.quantity;
            continue;
          }

          const product = await tx.product.findFirst({
            where: { id: item.productId, deletedAt: null },
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
          const unitPrice =
            item.price !== undefined && item.price !== null
              ? Number(item.price)
              : product.basePrice;
          calculatedTotal += unitPrice * item.quantity;
        }

        if (parsedDiscount > calculatedTotal) {
          throw new BadRequestException(
            `Discount (${parsedDiscount}) cannot exceed total sale amount (${calculatedTotal})`,
          );
        }

        const finalGrandTotal = calculatedTotal - parsedDiscount;
        const udhaarRequested = finalGrandTotal - parsedAmountPaid;

        let calculatedPaymentStatus = 'UNPAID';
        if (parsedAmountPaid >= finalGrandTotal) {
          calculatedPaymentStatus = 'PAID';
        } else if (parsedAmountPaid > 0) {
          calculatedPaymentStatus = 'PARTIAL';
        }

        if (orderStatus === 'FINAL' && udhaarRequested > 0 && !customerId) {
          throw new Error(
            'Walk-in customers must pay in full for FINAL sales. Please select or create a customer profile to give Udhaar.',
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
                  ? Number(item.price)
                  : item.price !== undefined && item.price !== null
                    ? Number(item.price)
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

            const conditionFilter = item.condition
              ? { condition: item.condition }
              : {};

            // Prioritize instances in the active branch, falling back across business
            let instances = branchId
              ? await tx.productInstance.findMany({
                  where: {
                    productId: item.productId,
                    branchId,
                    status: 'AVAILABLE',
                    ...conditionFilter,
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
                  ...conditionFilter,
                },
                take: needed,
              });
              instances = [...instances, ...fallbackInstances];
            }

            if (instances.length < item.quantity) {
              throw new BadRequestException(
                `Not enough available instances for product ${secureProducts[item.productId]?.name || item.productId} with condition ${item.condition || 'any'}.`,
              );
            }

            let instanceStatus: 'SOLD' | 'MEMO_LOCKED' = 'SOLD';
            if (instances.length > 0) {
              instanceStatus = orderStatus === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
              await tx.productInstance.updateMany({
                where: { id: { in: instances.map((i) => i.id) } },
                data: { status: instanceStatus },
              });
            }

            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                cabinetId: instances[0]?.cabinetId || null,
                fromCondition:
                  item.condition || instances[0]?.condition || null,
                toCondition: item.condition || instances[0]?.condition || null,
                quantity: item.quantity,
                direction: 'OUT',
                referenceType: orderStatus === 'MEMO' ? 'MEMO' : 'ORDER',
                referenceId: order.id,
                userId,
                businessId,
              },
            });
          }

          if (parsedAmountPaid > 0) {
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

        return order;
      });

      if (completeOrder.status === 'FINAL') {
        await this.postDoubleEntrySequence(completeOrder, parsedAmountPaid);
      }

      await this.invalidateOrderCaches(businessId, completeOrder.id);

      return {
        success: true,
        message: 'Order placed successfully',
        order: completeOrder,
      };
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Failed to process order');
    }
  }

  private async postDoubleEntrySequence(order: any, amountPaid: number) {
    const grossItemsAmount =
      order.items && order.items.length > 0
        ? order.items.reduce(
            (sum: number, item: any) =>
              sum + Number(item.price) * Number(item.quantity),
            0,
          )
        : Number(order.totalAmount) + Number(order.discount || 0);

    const discount = Number(order.discount) || 0;
    const netAmount = Math.max(0, grossItemsAmount - discount);

    const postings: any[] = [];

    // Credit REVENUE matching the exact netAmount (-netAmount)
    if (netAmount > 0) {
      postings.push({
        accountId: 'REVENUE',
        accountType: 'REVENUE',
        amount: -netAmount,
      });
    }

    // Debit CASH and/or CUSTOMER_AR to sum exactly to +netAmount
    const cashPortion = Math.min(Number(amountPaid) || 0, netAmount);
    const arPortion = netAmount - cashPortion;

    if (cashPortion > 0) {
      postings.push({
        accountId: 'CASH',
        accountType: 'ASSET',
        amount: cashPortion,
      });
    }

    if (arPortion > 0 && order.customerId) {
      postings.push({
        accountId: order.customerId,
        accountType: 'CUSTOMER_AR',
        amount: arPortion,
      });
    }

    if (postings.length > 0) {
      await this.ledgerService.createBalancedTransaction({
        businessId: order.businessId,
        referenceId: order.id,
        type: 'SALE',
        description: `Sale for Order ${order.id}`,
        postings,
      });
    }
  }

  async getAllOrders(userId: string, query: any) {
    const { search, status, paymentStatus, days = 7 } = query;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');
    const businessId = currentUser.businessId;
    const cacheKey = `orders:${businessId}:search=${encodeURIComponent(search || '')}:status=${encodeURIComponent(status || 'All')}:paymentStatus=${encodeURIComponent(paymentStatus || 'All')}:days=${encodeURIComponent(days)}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    let queryConditions: any = { businessId: businessId };

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
      const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
      const pendingBalance = order.totalAmount - totalPaid;
      return {
        ...order,
        totalPaid,
        pendingBalance: pendingBalance > 0 ? pendingBalance : 0,
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

  async updateOrderStatus(userId: string, id: string, data: any) {
    const { status } = data;
    if (!status) throw new BadRequestException('Status is required');
    const { amountPaid, paymentMethod = 'CASH' } = data;
    const parsedAmountPaid = Number(amountPaid) || 0;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (status === 'CANCELLED' && currentUser?.role === 'STAFF') {
      throw new ForbiddenException(
        'Staff members are not permitted to cancel orders',
      );
    }

    const order = await this.prisma.order.findFirst({
      where: { id, businessId: currentUser?.businessId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (
      order.status === 'ESTIMATE' &&
      (status === 'FINAL' || status === 'MEMO')
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

          const instanceStatus = status === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
          await tx.productInstance.updateMany({
            where: { id: { in: instances.map((i) => i.id) } },
            data: { status: instanceStatus },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              cabinetId: instances[0]?.cabinetId || null,
              fromCondition: null,
              toCondition: null,
              quantity: item.quantity,
              direction: 'OUT',
              referenceType: status === 'MEMO' ? 'MEMO' : 'ORDER',
              referenceId: order.id,
              userId,
              businessId: currentUser?.businessId,
            },
          });
        }

        await tx.order.update({
          where: { id },
          data: { status: status as any },
        });
      });

      if (status === 'FINAL') {
        if (parsedAmountPaid > 0) {
          await this.prisma.payment.create({
            data: {
              orderId: id,
              amount: parsedAmountPaid,
              method: paymentMethod as any,
              receivedBy: userId,
            },
          });

          await this.prisma.order.update({
            where: { id },
            data: {
              paymentStatus:
                parsedAmountPaid >= order.totalAmount
                  ? 'PAID'
                  : ('PARTIAL' as any),
            },
          });
        }
        const totalPaid =
          order.payments.reduce((sum, p) => sum + p.amount, 0) +
          parsedAmountPaid;
        await this.postDoubleEntrySequence(order, totalPaid);
      }
    } else if (order.status === 'MEMO' && status === 'FINAL') {
      throw new BadRequestException(
        'To convert a MEMO to FINAL, use the settle-memo endpoint',
      );
    } else if (status === 'RETURNED' && order.status === 'MEMO') {
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
              fromCondition: null,
              toCondition: null,
              quantity: item.quantity,
              direction: 'IN',
              referenceType: 'RETURN',
              referenceId: order.id,
              userId,
              businessId: currentUser?.businessId,
            },
          });
        }
        await tx.order.update({
          where: { id },
          data: { status: 'RETURNED' as any },
        });
      });
    } else if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          if (!item.productId) continue;

          const instanceStatus =
            order.status === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
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
              fromCondition: null,
              toCondition: null,
              quantity: item.quantity,
              direction: 'IN',
              referenceType: 'ADJUSTMENT',
              notes: 'Order cancelled',
              referenceId: order.id,
              userId,
              businessId: currentUser?.businessId,
            },
          });
        }
        await tx.order.update({
          where: { id },
          data: { status: status as any },
        });
      });
    } else {
      await this.prisma.order.update({
        where: { id },
        data: { status: status as any },
      });
    }

    if (currentUser?.businessId) {
      await this.invalidateOrderCaches(currentUser.businessId, id);
    }

    return { success: true, message: `Order status updated to ${status}` };
  }

  async settleMemo(userId: string, id: string, data: any) {
    const { amountPaid, paymentMethod = 'CASH' } = data;
    const parsedAmountPaid = Number(amountPaid) || 0;

    if (parsedAmountPaid < 0) {
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

    const existingPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const remainingBalance = order.totalAmount - existingPaid;

    if (parsedAmountPaid > remainingBalance) {
      throw new BadRequestException(
        `Amount paid (${parsedAmountPaid}) cannot exceed remaining balance (${remainingBalance})`,
      );
    }

    const totalPaid = existingPaid + parsedAmountPaid;
    const newPaymentStatus =
      totalPaid >= order.totalAmount
        ? 'PAID'
        : totalPaid > 0
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

      if (parsedAmountPaid > 0) {
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
    });

    await this.postDoubleEntrySequence(order, totalPaid);

    if (currentUser?.businessId) {
      await this.invalidateOrderCaches(currentUser.businessId, id);
    }

    return {
      success: true,
      message: 'Memo converted to final sale successfully',
    };
  }

  async recordPayment(userId: string, data: any) {
    const { orderId, amount, method } = data;
    if (!orderId) throw new BadRequestException('Order ID is required');
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0)
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
        totalAmount: true,
        customerId: true,
        payments: { select: { amount: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const totalPaidSoFar = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const remainingBalance = order.totalAmount - totalPaidSoFar;

    if (remainingBalance <= 0)
      throw new BadRequestException('This order is already fully paid.');
    if (parsedAmount > remainingBalance) {
      throw new BadRequestException(
        `Amount exceeds the pending balance. Maximum payable amount is Rs. ${remainingBalance.toLocaleString()}`,
      );
    }

    const newTotalPaid = totalPaidSoFar + parsedAmount;
    const newPaymentStatus =
      newTotalPaid >= order.totalAmount ? 'PAID' : 'PARTIAL';

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
    });

    // Also update ledger
    await this.ledgerService.createBalancedTransaction({
      businessId: currentUser.businessId,
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
          accountId: order.customerId || 'REVENUE', // assuming if walk-in, revenue was already credited, but here payment reduces AR
          accountType: 'CUSTOMER_AR',
          amount: -parsedAmount,
        },
      ],
    });

    await this.invalidateOrderCaches(currentUser.businessId, order.id);

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

    const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const pendingBalance = order.totalAmount - totalPaid;

    const formattedInvoice = {
      ...order,
      orderNumber: `ORD-${order.orderNumber || order.id.substring(0, 4)}`,
      totalPaid,
      pendingBalance: pendingBalance > 0 ? pendingBalance : 0,
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
        let refundAmount = 0;

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

          refundAmount += orderItem.price * returnItem.quantity;

          const targetStatus =
            returnItem.returnCondition === 'DEFECTIVE'
              ? 'DEFECTIVE'
              : 'AVAILABLE';

          const instanceStatus =
            order.status === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
          const conditionFilter = returnItem.condition
            ? { condition: returnItem.condition }
            : {};

          const instances = await tx.productInstance.findMany({
            where: {
              productId: returnItem.productId,
              status: instanceStatus,
              ...conditionFilter,
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
              fromCondition: returnItem.condition || null,
              toCondition:
                returnItem.returnCondition === 'DEFECTIVE'
                  ? 'DEFECTIVE'
                  : (returnItem.condition as any) || 'ORIGINAL_PULL',
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

        if (order.status === 'FINAL') {
          const postings = [];

          postings.push({
            accountId: 'REVENUE',
            accountType: 'REVENUE',
            amount: refundAmount,
          });

          const totalPaid = order.payments.reduce(
            (sum, p) => sum + p.amount,
            0,
          );
          if (totalPaid > 0) {
            postings.push({
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: -Math.min(refundAmount, totalPaid),
            });
          }

          const remainingRefund = refundAmount - totalPaid;
          if (remainingRefund > 0 && order.customerId) {
            postings.push({
              accountId: order.customerId,
              accountType: 'CUSTOMER_AR',
              amount: -remainingRefund,
            });
          }

          await this.ledgerService.createBalancedTransaction({
            businessId: order.businessId,
            referenceId: `RET-${order.id}`,
            type: 'RETURN',
            description: `Return for Order ${order.id}`,
            postings,
          });
        }
      });
    } catch (error) {
      console.error('Failed to process return:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to process return. Please check inventory condition mapping or ledger invariant.',
      );
    }

    await this.invalidateOrderCaches(currentUser.businessId, id);

    return { success: true, message: 'Return processed successfully' };
  }
}
