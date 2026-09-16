import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class WorkOrdersService {
  constructor(
    private prisma: PrismaService,
    private ledgerService: LedgerService,
  ) {}

  async createWorkOrder(userId: string, data: any) {
    const { deviceInfo, issueDescription, laborCost, technicianId } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');
      
    const parsedLaborCost = Number(laborCost) || 0;

    return this.prisma.workOrder.create({
      data: {
        businessId: currentUser.businessId,
        deviceInfo,
        issueDescription,
        laborCost: parsedLaborCost,
        technicianId: technicianId || null,
        status: 'INTAKE',
      },
    });
  }

  async getWorkOrders(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    
    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    return this.prisma.workOrder.findMany({
      where: { businessId: currentUser.businessId },
      include: {
        technician: true,
        consumedParts: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkOrderById(userId: string, id: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    
    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, businessId: currentUser.businessId },
      include: {
        technician: true,
        consumedParts: { include: { product: true } },
      },
    });

    if (!workOrder) throw new NotFoundException('Work Order not found');

    return workOrder;
  }

  async addPart(userId: string, id: string, data: any) {
    const { productId, condition = 'ORIGINAL_PULL', quantity = 1 } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    
    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, businessId: currentUser.businessId },
    });

    if (!workOrder) throw new NotFoundException('Work Order not found');

    if (workOrder.status === 'DELIVERED') {
      throw new BadRequestException('Cannot add parts to a DELIVERED work order');
    }

    return this.prisma.$transaction(async (tx) => {
      // Find available instances
      const instances = await tx.productInstance.findMany({
        where: {
          productId,
          status: 'AVAILABLE',
          condition,
          product: { businessId: currentUser.businessId },
        },
        take: quantity,
      });

      if (instances.length < quantity) {
        throw new BadRequestException(
          `Insufficient available stock for condition ${condition}`,
        );
      }

      await tx.product.update({
        where: { id: productId },
        data: { stock: { decrement: quantity } },
      });

      await tx.productInstance.updateMany({
        where: { id: { in: instances.map((i) => i.id) } },
        data: {
          status: 'CONSUMED',
          workOrderId: id,
        },
      });

      return tx.workOrder.findUnique({
        where: { id },
        include: { consumedParts: { include: { product: true } } },
      });
    });
  }

  async updateStatus(userId: string, id: string, data: any) {
    const { status } = data;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    
    if (!currentUser?.businessId)
      throw new BadRequestException('User does not belong to a workspace');

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, businessId: currentUser.businessId },
      include: { consumedParts: { include: { product: true } } },
    });

    if (!workOrder) throw new NotFoundException('Work Order not found');

    if (workOrder.status === 'DELIVERED') {
      throw new BadRequestException('Cannot update a DELIVERED work order');
    }

    if (status === 'DELIVERED') {
      const partsCost = workOrder.consumedParts.reduce(
        (sum, part) => sum + part.product.price,
        0
      );
      const totalAmount = workOrder.laborCost + partsCost;

      const transaction = await this.ledgerService.createBalancedTransaction({
        businessId: currentUser.businessId,
        referenceId: id,
        type: 'SERVICE_JOB',
        description: `Work Order ${id} delivered`,
        postings: [
          {
            accountId: 'CASH',
            accountType: 'CASH',
            amount: totalAmount, // Debit cash
          },
          {
            accountId: 'REVENUE',
            accountType: 'REVENUE',
            amount: -totalAmount, // Credit revenue
          },
        ],
      });

      return this.prisma.workOrder.update({
        where: { id },
        data: {
          status,
          transactionId: transaction.id,
        },
      });
    } else {
      return this.prisma.workOrder.update({
        where: { id },
        data: { status },
      });
    }
  }
}
