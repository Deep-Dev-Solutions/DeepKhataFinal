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
import * as D from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { RedisService } from '../redis/redis.service';
import { ReservationsService } from '../reservations/reservations.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private ledgerService: LedgerService,
    private redis: RedisService,
    private reservations: ReservationsService,
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

  /**
   * Moves the given instances between statuses, guarded on the expected source
   * status so a concurrent change cannot be overwritten.
   */
  private async moveInstances(
    tx: Prisma.TransactionClient,
    ids: string[],
    from: 'AVAILABLE' | 'SOLD' | 'MEMO_LOCKED',
    to: 'AVAILABLE' | 'SOLD' | 'MEMO_LOCKED' | 'DEFECTIVE',
  ): Promise<void> {
    if (ids.length === 0) return;
    const res = await tx.productInstance.updateMany({
      where: { id: { in: ids }, status: from },
      data: { status: to },
    });
    if (res.count !== ids.length) {
      throw new ConflictException('Stock changed, please retry');
    }
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
      if (item.reservationId && (item.isService || item.quantity !== 1)) {
        throw new BadRequestException(
          'A reserved item must be sold as a single unit',
        );
      }
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true, role: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');
    const businessId = currentUser.businessId;
    const isStaff = currentUser.role === 'STAFF';

    try {
      const completeOrder = await this.prisma.$transaction(async (tx) => {
        await this.assertBranchInBusiness(tx, businessId, branchId);

        let calculatedTotal: M.Money = M.ZERO;
        const secureProducts: Record<string, any> = {};
        // Per cart line (by index): the reserved instance being sold, and the
        // reason recorded when sold below the product's minimum price.
        const reservedInstanceIds = new Map<number, string>();
        const overrideReasons = new Map<number, string>();

        for (const [index, item] of items.entries()) {
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
          if (item.reservationId) {
            // A reserved unit can only be sold through its own reservation.
            const reservation = await tx.stockReservation.findFirst({
              where: {
                id: String(item.reservationId),
                businessId,
                status: 'ACTIVE',
              },
              select: { instanceId: true },
            });
            if (!reservation) {
              throw new ConflictException('Reservation is not active');
            }
            const reservedInstance = await tx.productInstance.findFirst({
              where: { id: reservation.instanceId, productId: product.id },
              select: { id: true },
            });
            if (!reservedInstance) {
              throw new BadRequestException(
                `Reservation does not match ${product.name}`,
              );
            }
            reservedInstanceIds.set(index, reservedInstance.id);
          } else {
            const available = await tx.productInstance.count({
              where: { productId: product.id, status: 'AVAILABLE' },
            });
            if (available < item.quantity) {
              throw new BadRequestException(
                `Not enough stock for ${product.name}. Only ${available} left.`,
              );
            }
          }
          secureProducts[item.productId] = product;
          const unitPrice: M.Money =
            item.price !== undefined && item.price !== null
              ? M.money(item.price)
              : product.basePrice;
          if (
            product.minSalePrice !== null &&
            product.minSalePrice !== undefined &&
            M.lt(unitPrice, product.minSalePrice)
          ) {
            if (isStaff) {
              throw new ForbiddenException(
                `Minimum price for ${product.name} is Rs ${product.minSalePrice.toString()}. Ask the owner or manager.`,
              );
            }
            const reason =
              typeof item.priceOverrideReason === 'string'
                ? item.priceOverrideReason.trim()
                : '';
            if (!reason) {
              throw new BadRequestException(
                'A reason is required to sell below the minimum price',
              );
            }
            overrideReasons.set(index, reason);
          }
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

        let dueDate: Date | null = null;
        if (
          calculatedPaymentStatus !== 'PAID' &&
          orderStatus !== 'ESTIMATE' &&
          orderStatus !== 'CANCELLED'
        ) {
          const today = D.startOfKarachiDay();
          if (data.dueDate) {
            const requested = new Date(data.dueDate);
            if (Number.isNaN(requested.getTime())) {
              throw new BadRequestException('Invalid due date');
            }
            if (D.startOfKarachiDay(requested) < today) {
              throw new BadRequestException('Due date cannot be in the past');
            }
            dueDate = requested;
          } else {
            const [customer, business] = await Promise.all([
              customerId
                ? tx.customer.findFirst({
                    where: { id: customerId, businessId },
                    select: { paymentTermsDays: true },
                  })
                : Promise.resolve(null),
              tx.business.findUnique({
                where: { id: businessId },
                select: { defaultReceivableDays: true },
              }),
            ]);
            dueDate = D.addDays(
              today,
              customer?.paymentTermsDays ??
                business?.defaultReceivableDays ??
                7,
            );
          }
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
            dueDate,
            createdBy: userId,
            items: {
              create: items.map((item: any, index: number) => ({
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
                priceOverrideReason: overrideReasons.get(index) ?? null,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        if (orderStatus !== 'ESTIMATE') {
          for (const [index, item] of items.entries()) {
            if (item.isService) continue;

            const instanceStatus: 'SOLD' | 'MEMO_LOCKED' =
              orderStatus === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';

            const reservedId = reservedInstanceIds.get(index);
            if (reservedId) {
              // Sell through the reservation: ACTIVE -> CONVERTED, then the
              // instance moves RESERVED -> sold in the same transaction.
              await this.reservations.convertInTx(
                tx,
                businessId,
                String(item.reservationId),
                reservedId,
              );
              const claimedReserved = await tx.productInstance.updateMany({
                where: { id: reservedId, status: 'RESERVED' },
                data: { status: instanceStatus },
              });
              if (claimedReserved.count !== 1) {
                throw new ConflictException('Reserved item is no longer held');
              }
              const reservedRow = await tx.productInstance.findUnique({
                where: { id: reservedId },
                select: { cabinetId: true },
              });
              await tx.inventoryMovement.create({
                data: {
                  productId: item.productId,
                  cabinetId: reservedRow?.cabinetId || null,
                  quantity: 1,
                  direction: 'OUT',
                  referenceType: orderStatus === 'MEMO' ? 'MEMO' : 'ORDER',
                  referenceId: order.id,
                  userId,
                  businessId,
                },
              });
              continue;
            }

            // Pick candidates inside the tx, locking them and skipping rows other
            // concurrent sales already hold, so parallel sales get different units.
            // Active-branch units come first, then any branch.
            const instances = branchId
              ? await tx.$queryRaw<{ id: string; cabinetId: string | null }[]>(
                  Prisma.sql`SELECT "id", "cabinetId" FROM "ProductInstance"
                    WHERE "productId" = ${item.productId} AND "status" = 'AVAILABLE'
                    ORDER BY ("branchId" = ${branchId}) DESC, "createdAt" ASC
                    LIMIT ${item.quantity}
                    FOR UPDATE SKIP LOCKED`,
                )
              : await tx.$queryRaw<{ id: string; cabinetId: string | null }[]>(
                  Prisma.sql`SELECT "id", "cabinetId" FROM "ProductInstance"
                    WHERE "productId" = ${item.productId} AND "status" = 'AVAILABLE'
                    ORDER BY "createdAt" ASC
                    LIMIT ${item.quantity}
                    FOR UPDATE SKIP LOCKED`,
                );

            if (instances.length < item.quantity) {
              throw new BadRequestException(
                `Not enough available instances for product ${secureProducts[item.productId]?.name || item.productId}.`,
              );
            }

            // Claim the candidates atomically: only rows still AVAILABLE are updated,
            // so a concurrent sale cannot take the same instances.
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
      const trimmedSearch = String(search).trim();
      const searchNum = /^\d+$/.test(trimmedSearch)
        ? parseInt(trimmedSearch, 10)
        : NaN;
      const orConditions: any[] = [
        { id: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
        { walkInName: { contains: search, mode: 'insensitive' } },
        { walkInPhone: { contains: search, mode: 'insensitive' } },
      ];
      if (!isNaN(searchNum) && searchNum <= 2147483647) {
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
          await this.moveInstances(
            tx,
            instances.map((i) => i.id),
            'AVAILABLE',
            instanceStatus,
          );

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
          await this.moveInstances(
            tx,
            instances.map((i) => i.id),
            'MEMO_LOCKED',
            'AVAILABLE',
          );

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
          await this.moveInstances(
            tx,
            instances.map((i) => i.id),
            instanceStatus,
            'AVAILABLE',
          );

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
        await this.moveInstances(
          tx,
          instances.map((i) => i.id),
          'MEMO_LOCKED',
          'SOLD',
        );
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

  async recordPayment(userId: string, data: any, id?: string) {
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
          ...(id ? { id } : {}),
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
    if (
      order.status !== 'FINAL' &&
      order.status !== 'COMPLETED' &&
      order.status !== 'MEMO'
    ) {
      throw new BadRequestException('Can only return FINAL or MEMO orders');
    }

    if (!itemsToReturn || itemsToReturn.length === 0) {
      throw new BadRequestException('No items provided to return');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Serialise concurrent returns on the same order so the remaining
        // quantities and the refunded total below cannot go stale.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
        const lockedOrder = await tx.order.findUnique({
          where: { id },
          select: { status: true },
        });
        if (
          !lockedOrder ||
          (lockedOrder.status !== 'FINAL' &&
            lockedOrder.status !== 'COMPLETED' &&
            lockedOrder.status !== 'MEMO')
        ) {
          throw new BadRequestException('Can only return FINAL or MEMO orders');
        }

        // Units already returned per product (earlier partial returns).
        const priorMovements = await tx.inventoryMovement.groupBy({
          by: ['productId'],
          where: {
            businessId: order.businessId,
            referenceType: 'RETURN',
            referenceId: order.id,
            direction: 'IN',
          },
          _sum: { quantity: true },
        });
        const returnedQty = new Map<string, number>();
        for (const m of priorMovements) {
          returnedQty.set(m.productId, m._sum.quantity ?? 0);
        }
        const orderedQty = new Map<string, number>();
        for (const i of order.items) {
          if (!i.productId || i.isService) continue;
          orderedQty.set(
            i.productId,
            (orderedQty.get(i.productId) ?? 0) + i.quantity,
          );
        }

        let returnedGross: M.Money = M.ZERO;

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

          const purchasedQty =
            orderedQty.get(returnItem.productId) ?? orderItem.quantity;
          const alreadyReturned = returnedQty.get(returnItem.productId) ?? 0;
          const remainingQty = purchasedQty - alreadyReturned;
          if (returnItem.quantity > remainingQty) {
            throw new BadRequestException(
              `Return quantity (${returnItem.quantity}) cannot exceed remaining returnable quantity (${remainingQty}) for product ${returnItem.productId}`,
            );
          }
          returnedQty.set(
            returnItem.productId,
            alreadyReturned + returnItem.quantity,
          );

          returnedGross = M.add(
            returnedGross,
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

          await this.moveInstances(
            tx,
            instances.map((i) => i.id),
            instanceStatus,
            targetStatus,
          );

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

        // The order is fully returned only when no sold units remain.
        const fullyReturned = [...orderedQty.entries()].every(
          ([productId, qty]) => (returnedQty.get(productId) ?? 0) >= qty,
        );
        if (fullyReturned) {
          await tx.order.update({
            where: { id },
            data: { status: 'RETURNED' },
          });
        }

        // Refund the discounted price, never exceeding what is still
        // refundable after earlier partial returns.
        const grossTotal = M.sum(
          order.items.map((i) => M.mul(i.price, i.quantity)),
        );
        const netTotal = M.max(M.ZERO, M.sub(grossTotal, order.discount));
        const hasServiceLines = order.items.some(
          (i) => i.isService || !i.productId,
        );

        const priorPostings = await tx.posting.findMany({
          where: {
            transaction: {
              businessId: order.businessId,
              type: 'RETURN',
              referenceId: `RET-${order.id}`,
            },
            accountType: { in: ['REVENUE', 'ASSET'] },
            accountId: { in: ['REVENUE', 'CASH'] },
          },
          select: { accountId: true, amount: true },
        });
        const previouslyRefunded = M.sum(
          priorPostings
            .filter((p) => p.accountId === 'REVENUE')
            .map((p) => p.amount),
        );
        const cashAlreadyRefunded = M.neg(
          M.sum(
            priorPostings
              .filter((p) => p.accountId === 'CASH')
              .map((p) => p.amount),
          ),
        );
        const refundable = M.max(M.ZERO, M.sub(netTotal, previouslyRefunded));

        let refundAmount: M.Money;
        if (M.lte(grossTotal, 0)) {
          refundAmount = refundable;
        } else if (
          (fullyReturned && !hasServiceLines) ||
          M.gte(returnedGross, grossTotal)
        ) {
          refundAmount = refundable;
        } else {
          refundAmount = M.min(
            refundable,
            M.round2(M.money(returnedGross).times(netTotal).div(grossTotal)),
          );
        }

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
          const cashRefundable = M.max(
            M.ZERO,
            M.sub(totalPaid, cashAlreadyRefunded),
          );
          const cashRefund = M.min(refundAmount, cashRefundable);
          if (M.gt(cashRefund, 0)) {
            postings.push({
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: M.neg(cashRefund),
            });
          }

          const remainingRefund = M.sub(refundAmount, cashRefund);
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
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
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
