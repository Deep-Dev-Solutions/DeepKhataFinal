import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.types';
import { CreateReservationDto } from './reservations.dto';

const STALE = 'Stock changed, please retry';

const reservationInclude = {
  instance: {
    select: {
      id: true,
      condition: true,
      productId: true,
      product: { select: { id: true, name: true } },
    },
  },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.StockReservationInclude;

type ReservationRow = Prisma.StockReservationGetPayload<{
  include: typeof reservationInclude;
}>;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toView(r: ReservationRow) {
    return {
      id: r.id,
      instanceId: r.instanceId,
      status: r.status,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      productId: r.instance.productId,
      productName: r.instance.product.name,
      condition: r.instance.condition,
      branch: r.branch,
    };
  }

  async create(t: TenantContext, dto: CreateReservationDto) {
    if (!dto.instanceId && !dto.productId) {
      throw new BadRequestException('instanceId or productId is required');
    }
    const hours = dto.hours ?? 24;

    return this.prisma.$transaction(async (tx) => {
      let instanceId: string;
      let branchId: string;

      if (dto.instanceId) {
        const inst = await tx.productInstance.findFirst({
          where: {
            id: dto.instanceId,
            product: { businessId: t.businessId },
          },
          select: { id: true, branchId: true, status: true },
        });
        if (!inst) throw new NotFoundException('Item not found');
        if (inst.status !== 'AVAILABLE') throw new ConflictException(STALE);
        instanceId = inst.id;
        branchId = inst.branchId;
      } else {
        const targetBranch = dto.branchId ?? t.branchId;
        if (!targetBranch) {
          throw new BadRequestException('Select your branch first');
        }
        const product = await tx.product.findFirst({
          where: { id: dto.productId, businessId: t.businessId },
          select: { id: true },
        });
        if (!product) throw new NotFoundException('Product not found');
        const branch = await tx.branch.findFirst({
          where: { id: targetBranch, businessId: t.businessId },
          select: { id: true },
        });
        if (!branch) throw new NotFoundException('Branch not found');
        const inst = await tx.productInstance.findFirst({
          where: {
            productId: product.id,
            branchId: branch.id,
            status: 'AVAILABLE',
            ...(dto.condition ? { condition: dto.condition } : {}),
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (!inst) throw new ConflictException('No available unit to reserve');
        instanceId = inst.id;
        branchId = branch.id;
      }

      const locked = await tx.productInstance.updateMany({
        where: { id: instanceId, status: 'AVAILABLE' },
        data: { status: 'RESERVED' },
      });
      if (locked.count !== 1) throw new ConflictException(STALE);

      const created = await tx.stockReservation.create({
        data: {
          businessId: t.businessId,
          instanceId,
          branchId,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone?.trim() || null,
          expiresAt: new Date(Date.now() + hours * 3600 * 1000),
          status: 'ACTIVE',
          createdById: t.userId,
        },
        include: reservationInclude,
      });
      return this.toView(created);
    });
  }

  async release(t: TenantContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.stockReservation.findFirst({
        where: { id, businessId: t.businessId },
        select: { id: true, instanceId: true, status: true },
      });
      if (!r) throw new NotFoundException('Reservation not found');
      if (r.status !== 'ACTIVE') {
        throw new ConflictException('Reservation is no longer active');
      }
      const upd = await tx.stockReservation.updateMany({
        where: { id: r.id, status: 'ACTIVE' },
        data: { status: 'RELEASED' },
      });
      if (upd.count !== 1) throw new ConflictException(STALE);
      const inst = await tx.productInstance.updateMany({
        where: { id: r.instanceId, status: 'RESERVED' },
        data: { status: 'AVAILABLE' },
      });
      if (inst.count !== 1) throw new ConflictException(STALE);
      const full = await tx.stockReservation.findUniqueOrThrow({
        where: { id: r.id },
        include: reservationInclude,
      });
      return this.toView(full);
    });
  }

  async list(t: TenantContext, status?: ReservationStatus) {
    const rows = await this.prisma.stockReservation.findMany({
      where: { businessId: t.businessId, ...(status ? { status } : {}) },
      include: reservationInclude,
      orderBy: { expiresAt: 'asc' },
      take: 500,
    });
    return { items: rows.map((r) => this.toView(r)) };
  }

  /**
   * Marks the ACTIVE reservation for `instanceId` as CONVERTED so the caller
   * (orders) can sell the reserved unit. The instance status deliberately
   * stays RESERVED here; the caller's sale must move it RESERVED -> SOLD
   * (status-guarded) within the same transaction.
   */
  async convertInTx(
    tx: Prisma.TransactionClient,
    businessId: string,
    reservationId: string,
    instanceId: string,
  ): Promise<void> {
    const res = await tx.stockReservation.updateMany({
      where: {
        id: reservationId,
        businessId,
        instanceId,
        status: 'ACTIVE',
      },
      data: { status: 'CONVERTED' },
    });
    if (res.count !== 1) {
      throw new ConflictException('Reservation is not active for this item');
    }
  }

  @Cron('*/5 * * * *', { timeZone: 'Asia/Karachi' })
  async expireReservations(): Promise<number> {
    const due = await this.prisma.stockReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      select: { id: true, instanceId: true },
      take: 1000,
    });
    let released = 0;
    for (const r of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const upd = await tx.stockReservation.updateMany({
            where: { id: r.id, status: 'ACTIVE' },
            data: { status: 'RELEASED' },
          });
          if (upd.count !== 1) return;
          await tx.productInstance.updateMany({
            where: { id: r.instanceId, status: 'RESERVED' },
            data: { status: 'AVAILABLE' },
          });
          released += 1;
        });
      } catch (err) {
        this.logger.error(
          `Failed to expire reservation ${r.id}: ${(err as Error).message}`,
        );
      }
    }
    if (due.length > 0) {
      this.logger.log(`Expired ${released} of ${due.length} reservations`);
    }
    return released;
  }
}
