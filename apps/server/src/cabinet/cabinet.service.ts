import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CabinetService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private async requireBusinessId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId)
      throw new BadRequestException(
        'User does not have an associated business',
      );
    return user.businessId;
  }

  private buildLocation(data: any, currentLocation?: string | null) {
    const parts = [
      data.rack ? `Rack ${data.rack}` : null,
      data.shelf ? `Shelf ${data.shelf}` : null,
      data.bin ? `Bin ${data.bin}` : null,
    ].filter(Boolean);

    const location = parts.length ? parts.join(' -> ') : (currentLocation ?? '');
    const name =
      (data.name?.trim() && data.name.trim()) ||
      parts.join(' / ') ||
      'General Cabinet';
    return {
      name,
      location,
      rack: data.rack?.trim() || null,
      shelf: data.shelf?.trim() || null,
      bin: data.bin?.trim() || null,
    };
  }

  async getCabinets(userId: string, query?: any) {
    const businessId = await this.requireBusinessId(userId);

    const where: any = { businessId };
    if (query?.branchId) {
      where.branchId = query.branchId;
    }

    const branchKey = query?.branchId || 'all';
    const cacheKey = `cabinets:${businessId}:branch:${branchKey}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const cabinets = await this.prisma.cabinet.findMany({
      where,
      include: {
        _count: { select: { instances: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const result = { success: true, cabinets };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async addCabinet(userId: string, data: any) {
    const businessId = await this.requireBusinessId(userId);

    const branchId = data?.branchId;
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId },
    });
    if (!branch) throw new BadRequestException('Branch not found');

    const { name, location, rack, shelf, bin } = this.buildLocation(data);

    const cabinet = await this.prisma.cabinet.create({
      data: {
        name,
        location,
        rack,
        shelf,
        bin,
        businessId,
        branchId,
      },
    });

    await this.redis.delete(`cabinets:${businessId}:branch:${branchId}`);

    return {
      success: true,
      message: 'Cabinet created successfully',
      cabinet,
    };
  }

  async updateCabinet(userId: string, id: string, data: any) {
    const businessId = await this.requireBusinessId(userId);

    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id, businessId },
    });
    if (!cabinet) throw new NotFoundException('Cabinet not found');

    const { name, location, rack, shelf, bin } = this.buildLocation(
      data,
      cabinet.location,
    );

    const updated = await this.prisma.cabinet.update({
      where: { id },
      data: {
        ...(data.name?.trim() ? { name } : {}),
        ...(data.rack !== undefined ? { rack } : {}),
        ...(data.shelf !== undefined ? { shelf } : {}),
        ...(data.bin !== undefined ? { bin } : {}),
        ...(data.rack !== undefined ||
        data.shelf !== undefined ||
        data.bin !== undefined ||
        data.name?.trim()
          ? { location }
          : {}),
      },
    });

    await this.redis.delete(`cabinets:${businessId}:branch:${cabinet.branchId}`);

    return {
      success: true,
      message: 'Cabinet updated successfully',
      cabinet: updated,
    };
  }

  async deleteCabinet(userId: string, id: string) {
    const businessId = await this.requireBusinessId(userId);

    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id, businessId },
    });
    if (!cabinet) throw new NotFoundException('Cabinet not found');

    const result = await this.prisma.$transaction(async (tx) => {
      // Detach movement history so it survives the cabinet deletion.
      const movementsDetached = await tx.inventoryMovement.updateMany({
        where: { cabinetId: id },
        data: { cabinetId: null },
      });

      // Cascade: destroying a cabinet permanently destroys the stock inside it.
      const instancesDestroyed = await tx.productInstance.deleteMany({
        where: { cabinetId: id },
      });

      await tx.cabinet.delete({ where: { id } });

      return { instancesDestroyed: instancesDestroyed.count, movementsDetached: movementsDetached.count };
    });

    await this.redis.delete(`cabinets:${businessId}:branch:${cabinet.branchId}`);

    return {
      success: true,
      message: 'Cabinet deleted successfully',
      instancesDestroyed: result.instancesDestroyed,
    };
  }
}