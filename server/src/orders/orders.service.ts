import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private ledgerService: LedgerService,
  ) {}

  async newOrder(userId: string, data: any) {
    const {
      customerId,
      items,
      discount = 0,
      amountPaid = 0,
      paymentMethod = 'CASH',
      orderStatus = 'FINAL',
      walkInName,
      walkInPhone,
    } = data;

    if (!items || items.length === 0)
      throw new BadRequestException('Cart is empty');

    const parsedDiscount = Number(discount) || 0;
    const parsedAmountPaid = Number(amountPaid) || 0;

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
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });
          if (!product) throw new Error(`Product not found`);
          if (product.stock < item.quantity) {
            throw new Error(
              `Not enough stock for ${product.name}. Only ${product.stock} left.`,
            );
          }
          secureProducts[item.productId] = product;
          calculatedTotal += product.price * item.quantity;
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
                productId: item.productId,
                quantity: item.quantity,
                price: secureProducts[item.productId].price,
              })),
            },
          },
        });

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });

          const conditionFilter = item.condition ? { condition: item.condition } : {};
          const instances = await tx.productInstance.findMany({
            where: { productId: item.productId, status: 'AVAILABLE', ...conditionFilter },
            take: item.quantity,
          });
          
          if (instances.length < item.quantity) {
             throw new Error(`Not enough available instances for product ${item.productId} with condition ${item.condition || 'any'}.`);
          }

          if (instances.length > 0) {
            await tx.productInstance.updateMany({
              where: { id: { in: instances.map((i) => i.id) } },
              data: { status: orderStatus === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD' },
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

        return order;
      });

      if (completeOrder.status === 'FINAL') {
        await this.postDoubleEntrySequence(completeOrder, parsedAmountPaid);
      }

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
    const udhaarRequested = order.totalAmount - amountPaid;
    const postings = [];

    postings.push({
      accountId: 'REVENUE',
      accountType: 'REVENUE',
      amount: -order.totalAmount,
    });

    if (amountPaid > 0) {
      postings.push({
        accountId: 'CASH',
        accountType: 'ASSET',
        amount: amountPaid,
      });
    }

    if (udhaarRequested > 0 && order.customerId) {
      postings.push({
        accountId: order.customerId,
        accountType: 'CUSTOMER_AR',
        amount: udhaarRequested,
      });
    }

    await this.ledgerService.createBalancedTransaction({
      businessId: order.businessId,
      referenceId: order.id,
      type: 'SALE',
      description: `Sale for Order ${order.id}`,
      postings,
    });
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

    return { success: true, orders: formattedOrders };
  }

  async getOrderById(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

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

    return { success: true, order };
  }

  async updateOrderStatus(userId: string, id: string, data: any) {
    const { status } = data;
    if (!status) throw new BadRequestException('Status is required');
    const { amountPaid, paymentMethod = 'CASH' } = data;
    const parsedAmountPaid = Number(amountPaid) || 0;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    const order = await this.prisma.order.findFirst({
      where: { id, businessId: currentUser?.businessId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'MEMO' && status === 'FINAL') {
      throw new BadRequestException('To convert a MEMO to FINAL, use the settle-memo endpoint');
    } else if (status === 'RETURNED' && order.status === 'MEMO') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

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
        }
        await tx.order.update({
          where: { id },
          data: { status: 'RETURNED' as any },
        });
      });
    } else if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

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

    return { success: true, message: `Order status updated to ${status}` };
  }

  async settleMemo(userId: string, id: string, data: any) {
    const { amountPaid, paymentMethod = 'CASH' } = data;
    const parsedAmountPaid = Number(amountPaid) || 0;

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
    
    return { success: true, message: 'Memo converted to final sale successfully' };
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

    await this.prisma.$transaction(async (tx) => {
      let refundAmount = 0;

      for (const returnItem of itemsToReturn) {
        const orderItem = order.items.find(i => i.productId === returnItem.productId);
        if (!orderItem) {
          throw new BadRequestException(`Product ${returnItem.productId} not found in order`);
        }
        
        refundAmount += orderItem.price * returnItem.quantity;

        await tx.product.update({
          where: { id: returnItem.productId },
          data: { stock: { increment: returnItem.quantity } },
        });

        const instanceStatus = order.status === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
        const conditionFilter = returnItem.condition ? { condition: returnItem.condition } : {};
        
        const instances = await tx.productInstance.findMany({
          where: { productId: returnItem.productId, status: instanceStatus, ...conditionFilter },
          take: returnItem.quantity,
        });

        if (instances.length > 0) {
          await tx.productInstance.updateMany({
            where: { id: { in: instances.map((i) => i.id) } },
            data: { status: returnStatus },
          });
        }
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

        const totalPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
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

    return { success: true, message: 'Return processed successfully' };
  }
}
