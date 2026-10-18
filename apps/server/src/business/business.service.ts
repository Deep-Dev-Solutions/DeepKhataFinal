import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BusinessService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getBusinessInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });

    if (!user || !user.business) {
      throw new NotFoundException('Business info not found for this user');
    }

    const cacheKey = `business:${user.business.id}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const result = {
      success: true,
      business: {
        name: user.business.name,
        address: user.business.address,
        phone: user.business.phone,
      },
    };

    await this.redis.set(cacheKey, result, 3600);
    return result;
  }
}
