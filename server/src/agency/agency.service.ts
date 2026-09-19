import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class AgencyService {
  constructor(private readonly prisma: PrismaService) {}

  async onboardTenant(data: any) {
    const {
      businessName,
      ownerName,
      ownerEmail,
      ownerPassword,
      phone,
      address,
    } = data;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const existingSlug = await this.prisma.business.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictException(
        'Business name generates a conflicting slug. Please use a unique name.',
      );
    }

    try {
      const hashedPassword = await bcrypt.hash(ownerPassword, 10);

      const result = await this.prisma.$transaction(async (tx) => {
        // Create user first
        const user = await tx.user.create({
          data: {
            name: ownerName,
            email: ownerEmail,
            password: hashedPassword,
            role: Role.OWNER,
            phone: phone || null,
          },
        });

        // Create business
        const business = await tx.business.create({
          data: {
            name: businessName,
            slug,
            email: ownerEmail,
            phone: phone || null,
            address: address || null,
            ownerId: user.id,
          },
        });

        // Link business back to user
        await tx.user.update({
          where: { id: user.id },
          data: { businessId: business.id },
        });

        // Create initial default branch
        const branch = await tx.branch.create({
          data: {
            name: 'Main Branch',
            businessId: business.id,
          },
        });

        return { user, business, branch };
      });

      // Remove password before returning
      const { password, ...userWithoutPassword } = result.user;
      return {
        message: 'Tenant onboarded successfully',
        business: result.business,
        owner: userWithoutPassword,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to onboard tenant: ' + error.message,
      );
    }
  }

  async getTenants() {
    const businesses = await this.prisma.business.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: { users: true, products: true, orders: true, branches: true },
        },
        branches: {
          select: { id: true, name: true, location: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return businesses;
  }

  async addBranchToTenant(businessId: string, data: any) {
    const { name, location } = data;

    if (!name || !name.trim()) {
      throw new NotFoundException('Branch name is required');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    const branch = await this.prisma.branch.create({
      data: {
        name: name.trim(),
        location: location?.trim() || null,
        businessId,
      },
    });

    return { message: 'Branch provisioned successfully', branch };
  }
}
