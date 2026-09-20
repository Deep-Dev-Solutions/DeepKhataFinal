import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async getBusinessInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });

    if (!user || !user.business) {
      throw new NotFoundException('Business info not found for this user');
    }

    return {
      success: true,
      business: {
        name: user.business.name,
        address: user.business.address,
        phone: user.business.phone,
      },
    };
  }
}
