import {
  Injectable,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as M from '../common/money';
import { BusinessStatus, Role } from '@prisma/client';
import { TenantCacheService } from '../tenant/tenant-cache.service';

const TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const VALID_STATUSES: BusinessStatus[] = [
  BusinessStatus.ACTIVE,
  BusinessStatus.READ_ONLY,
  BusinessStatus.SUSPENDED,
];

@Injectable()
export class AgencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCache: TenantCacheService,
  ) {}

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
            subscriptionExpiresAt: new Date(Date.now() + TRIAL_DURATION_MS),
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
    return businesses.map(({ status, subscriptionExpiresAt, ...rest }) => ({
      ...rest,
      status,
      subscriptionExpiresAt,
    }));
  }

  async getTenantById(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
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
          select: {
            users: true,
            products: true,
            orders: true,
            branches: true,
          },
        },
        branches: {
          select: { id: true, name: true, location: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        billingLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!business) {
      throw new NotFoundException(
        `Business with ID ${businessId} not found`,
      );
    }

    const { status, subscriptionExpiresAt, ...rest } = business;
    return { ...rest, status, subscriptionExpiresAt };
  }

  async updateTenantStatus(businessId: string, status: string) {
    if (!VALID_STATUSES.includes(status as BusinessStatus)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      );
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) {
      throw new NotFoundException(
        `Business with ID ${businessId} not found`,
      );
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: { status: status as BusinessStatus },
    });
    this.tenantCache.invalidateBusiness(businessId);

    return {
      message: `Tenant status updated to ${status}`,
      businessId,
      status,
    };
  }

  async logPaymentAndExtend(
    businessId: string,
    data: { amount?: number; paymentDate?: Date | string; notes?: string },
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) {
      throw new NotFoundException(
        `Business with ID ${businessId} not found`,
      );
    }

    let amount: M.Money;
    try {
      amount = M.round2(data?.amount);
    } catch {
      amount = M.ZERO;
    }
    if (!M.gt(amount, 0)) {
      throw new BadRequestException('A valid positive amount is required');
    }

    const paymentDate = data?.paymentDate ? new Date(data.paymentDate) : null;
    if (!paymentDate || isNaN(paymentDate.getTime())) {
      throw new BadRequestException('A valid payment/expiration date is required');
    }

    const { billingLog, updatedBusiness } = await this.prisma.$transaction(
      async (tx) => {
        const billingLog = await tx.agencyBillingLog.create({
          data: {
            businessId,
            amount,
            paymentDate,
            notes: data?.notes?.trim() || null,
          },
        });

        const updatedBusiness = await tx.business.update({
          where: { id: businessId },
          data: {
            subscriptionExpiresAt: paymentDate,
            // Renewal reactivates the tenant.
            status: BusinessStatus.ACTIVE,
          },
        });

        return { billingLog, updatedBusiness };
      },
    );
    this.tenantCache.invalidateBusiness(businessId);

    return {
      message:
        'Payment logged and subscription extended successfully',
      billingLog,
      subscriptionExpiresAt: updatedBusiness.subscriptionExpiresAt,
      status: updatedBusiness.status,
    };
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

    this.tenantCache.invalidateBranches(businessId);

    return { message: 'Branch provisioned successfully', branch };
  }
}
