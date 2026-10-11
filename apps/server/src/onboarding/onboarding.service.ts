import { randomUUID } from 'node:crypto';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getAccessTokenSecret } from '../auth/jwt-secrets';

@Injectable()
export class OnboardingService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async businessOnboarding(ownerId: string, data: any) {
    const { name, industry, teamSize, currency, phone, address, slug } = data;

    if (!ownerId) {
      throw new UnauthorizedException('Authentication required');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, businessId: true },
    });
    if (!owner) {
      throw new UnauthorizedException('Authentication required');
    }
    if (owner.businessId) {
      throw new ConflictException('User already belongs to a business');
    }

    const existingBusiness = await this.prisma.business.findUnique({
      where: { slug },
    });

    if (existingBusiness) {
      throw new BadRequestException('Business Slug Already Exists');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const newBusiness = await tx.business.create({
        data: {
          name,
          industry,
          teamSize,
          currency,
          slug,
          phone,
          address,
          ownerId,
        },
      });

      await tx.user.update({
        where: { id: ownerId },
        data: {
          role: 'OWNER',
          businessId: newBusiness.id,
        },
      });

      // Auto-provision default branch
      await tx.branch.create({
        data: {
          name: 'Main Branch',
          businessId: newBusiness.id,
          phone: phone || null,
          location: address || null,
        },
      });

      return newBusiness;
    });

    const accessToken = this.jwtService.sign(
      {
        id: ownerId,
        role: 'OWNER',
        businessId: result.id,
      },
      {
        secret: getAccessTokenSecret(),
        jwtid: randomUUID(),
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

    return {
      message: 'Business Onboarding Successful',
      business: result,
      accessToken,
    };
  }
}
