import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemCondition, Prisma } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../config/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant.types';
import {
  CreateTransferDto,
  ListTransfersQueryDto,
} from './stock-transfers.dto';

const STALE = 'Stock changed, please retry';
const TRANSFERS_LINK = '/dashboard?panel=transfers';

const transferInclude = {
  fromBranch: { select: { id: true, name: true } },
  toBranch: { select: { id: true, name: true } },
  items: {
    select: {
      instanceId: true,
      instance: {
        select: {
          productId: true,
          condition: true,
          product: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.StockTransferRequestInclude;

type TransferRow = Prisma.StockTransferRequestGetPayload<{
  include: typeof transferInclude;
}>;

interface Group {
  productId: string;
  condition: ItemCondition;
  quantity: number;
}

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private toView(r: TransferRow) {
    const lines = new Map<
      string,
      {
        productId: string;
        productName: string;
        condition: ItemCondition;
        quantity: number;
      }
    >();
    for (const it of r.items) {
      const key = `${it.instance.productId}|${it.instance.condition}`;
      const cur = lines.get(key);
      if (cur) cur.quantity += 1;
      else
        lines.set(key, {
          productId: it.instance.productId,
          productName: it.instance.product.name,
          condition: it.instance.condition,
          quantity: 1,
        });
    }
    return {
      id: r.id,
      status: r.status,
      fromBranch: r.fromBranch,
      toBranch: r.toBranch,
      requestedAt: r.requestedAt,
      dispatchedAt: r.dispatchedAt,
      receivedAt: r.receivedAt,
      note: r.note,
      lines: [...lines.values()],
    };
  }

  private async load(
    db: Prisma.TransactionClient | PrismaService,
    businessId: string,
    id: string,
  ) {
    const row = await db.stockTransferRequest.findFirst({
      where: { id, businessId },
      include: transferInclude,
    });
    if (!row) throw new NotFoundException('Transfer not found');
    return row;
  }

  private groups(row: TransferRow): Group[] {
    const map = new Map<string, Group>();
    for (const it of row.items) {
      const key = `${it.instance.productId}|${it.instance.condition}`;
      const cur = map.get(key);
      if (cur) cur.quantity += 1;
      else
        map.set(key, {
          productId: it.instance.productId,
          condition: it.instance.condition,
          quantity: 1,
        });
    }
    return [...map.values()];
  }

  private async writeMovements(
    tx: Prisma.TransactionClient,
    t: TenantContext,
    row: TransferRow,
    direction: 'IN' | 'OUT',
    branchId: string,
    referenceType: string,
  ) {
    for (const g of this.groups(row)) {
      await tx.inventoryMovement.create({
        data: {
          productId: g.productId,
          cabinetId: null,
          quantity: g.quantity,
          direction,
          referenceType,
          referenceId: row.id,
          userId: t.userId,
          businessId: t.businessId,
          branchId,
          fromCondition: g.condition,
          toCondition: g.condition,
        },
      });
    }
  }

  async create(t: TenantContext, dto: CreateTransferDto) {
    if (!t.branchId) throw new BadRequestException('Select your branch first');
    const toBranchId = t.branchId;
    if (dto.fromBranchId === toBranchId) {
      throw new BadRequestException('Source and destination must differ');
    }

    return this.prisma.$transaction(async (tx) => {
      const branches = await tx.branch.findMany({
        where: {
          id: { in: [dto.fromBranchId, toBranchId] },
          businessId: t.businessId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      const fromBranch = branches.find((b) => b.id === dto.fromBranchId);
      const toBranch = branches.find((b) => b.id === toBranchId);
      if (!fromBranch || !toBranch)
        throw new NotFoundException('Branch not found');

      const product = await tx.product.findFirst({
        where: { id: dto.productId, businessId: t.businessId },
        select: { id: true, name: true },
      });
      if (!product) throw new NotFoundException('Product not found');

      const instances = await tx.productInstance.findMany({
        where: {
          productId: product.id,
          branchId: fromBranch.id,
          status: 'AVAILABLE',
          ...(dto.condition ? { condition: dto.condition } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: dto.quantity,
        select: { id: true },
      });
      if (instances.length < dto.quantity) {
        throw new ConflictException(
          `Only ${instances.length} available at ${fromBranch.name}`,
        );
      }

      // Instances are intentionally NOT locked at request time.
      const created = await tx.stockTransferRequest.create({
        data: {
          businessId: t.businessId,
          fromBranchId: fromBranch.id,
          toBranchId: toBranch.id,
          status: 'REQUESTED',
          note: dto.note?.trim() || null,
          requestedById: t.userId,
          items: { create: instances.map((i) => ({ instanceId: i.id })) },
        },
        include: transferInclude,
      });

      await this.notifications.notify(
        {
          businessId: t.businessId,
          branchId: fromBranch.id,
          type: 'transfer.requested',
          title: 'Maal transfer request',
          body: `${toBranch.name} ne ${dto.quantity} x ${product.name} manga hai`,
          link: TRANSFERS_LINK,
          entityType: 'TRANSFER',
          entityId: created.id,
        },
        tx,
      );
      return this.toView(created);
    });
  }

  async dispatch(t: TenantContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, t.businessId, id);
      if (row.status !== 'REQUESTED') {
        throw new ConflictException('Transfer is not in requested state');
      }
      const ids = row.items.map((i) => i.instanceId);

      const st = await tx.stockTransferRequest.updateMany({
        where: { id: row.id, status: 'REQUESTED' },
        data: {
          status: 'DISPATCHED',
          dispatchedById: t.userId,
          dispatchedAt: new Date(),
        },
      });
      if (st.count !== 1) throw new ConflictException(STALE);

      const moved = await tx.productInstance.updateMany({
        where: {
          id: { in: ids },
          status: 'AVAILABLE',
          branchId: row.fromBranchId,
        },
        data: { status: 'IN_TRANSIT' },
      });
      if (moved.count !== ids.length) throw new ConflictException(STALE);

      await this.writeMovements(
        tx,
        t,
        row,
        'OUT',
        row.fromBranchId,
        'TRANSFER',
      );

      const qty = row.items.length;
      await this.notifications.notify(
        {
          businessId: t.businessId,
          branchId: row.toBranchId,
          type: 'transfer.dispatched',
          title: 'Maal rawana ho gaya',
          body: `${row.fromBranch.name} se ${qty} item rawana hue`,
          link: TRANSFERS_LINK,
          entityType: 'TRANSFER',
          entityId: row.id,
        },
        tx,
      );
      return this.toView(await this.load(tx, t.businessId, id));
    });
  }

  async receive(t: TenantContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, t.businessId, id);
      if (row.status !== 'DISPATCHED') {
        throw new ConflictException('Transfer is not dispatched');
      }
      const ids = row.items.map((i) => i.instanceId);

      const st = await tx.stockTransferRequest.updateMany({
        where: { id: row.id, status: 'DISPATCHED' },
        data: {
          status: 'RECEIVED',
          receivedById: t.userId,
          receivedAt: new Date(),
        },
      });
      if (st.count !== 1) throw new ConflictException(STALE);

      const moved = await tx.productInstance.updateMany({
        where: { id: { in: ids }, status: 'IN_TRANSIT' },
        data: {
          status: 'AVAILABLE',
          branchId: row.toBranchId,
          cabinetId: null,
        },
      });
      if (moved.count !== ids.length) throw new ConflictException(STALE);

      await this.writeMovements(tx, t, row, 'IN', row.toBranchId, 'TRANSFER');

      await this.notifications.notify(
        {
          businessId: t.businessId,
          branchId: row.fromBranchId,
          type: 'transfer.received',
          title: 'Maal mil gaya',
          body: `${row.toBranch.name} ne ${row.items.length} item receive kar liye`,
          link: TRANSFERS_LINK,
          entityType: 'TRANSFER',
          entityId: row.id,
        },
        tx,
      );
      return this.toView(await this.load(tx, t.businessId, id));
    });
  }

  async cancel(t: TenantContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.load(tx, t.businessId, id);
      const now = new Date();

      if (row.status === 'REQUESTED') {
        const st = await tx.stockTransferRequest.updateMany({
          where: { id: row.id, status: 'REQUESTED' },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        if (st.count !== 1) throw new ConflictException(STALE);
      } else if (row.status === 'DISPATCHED') {
        if (!ROLE_PERMISSIONS[t.role]?.includes('manage:transfers')) {
          throw new ForbiddenException(
            'You do not have permission to perform this action',
          );
        }
        const ids = row.items.map((i) => i.instanceId);
        const st = await tx.stockTransferRequest.updateMany({
          where: { id: row.id, status: 'DISPATCHED' },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        if (st.count !== 1) throw new ConflictException(STALE);
        const back = await tx.productInstance.updateMany({
          where: { id: { in: ids }, status: 'IN_TRANSIT' },
          data: { status: 'AVAILABLE', branchId: row.fromBranchId },
        });
        if (back.count !== ids.length) throw new ConflictException(STALE);
        await this.writeMovements(
          tx,
          t,
          row,
          'IN',
          row.fromBranchId,
          'TRANSFER_CANCEL',
        );
      } else {
        throw new ConflictException('Transfer can no longer be cancelled');
      }
      return this.toView(await this.load(tx, t.businessId, id));
    });
  }

  async list(t: TenantContext, query: ListTransfersQueryDto) {
    const direction = query.direction ?? 'all';
    const where: Prisma.StockTransferRequestWhereInput = {
      businessId: t.businessId,
      ...(query.status ? { status: query.status } : {}),
    };
    if (t.branchId && direction === 'incoming') where.toBranchId = t.branchId;
    else if (t.branchId && direction === 'outgoing')
      where.fromBranchId = t.branchId;
    else if (t.branchId && direction === 'all') {
      where.OR = [{ toBranchId: t.branchId }, { fromBranchId: t.branchId }];
    }
    const rows = await this.prisma.stockTransferRequest.findMany({
      where,
      include: transferInclude,
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.toView(r)) };
  }

  async get(t: TenantContext, id: string) {
    return this.toView(await this.load(this.prisma, t.businessId, id));
  }
}
