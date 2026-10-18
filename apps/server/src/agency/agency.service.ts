import {
  Injectable,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import * as M from '../common/money';
import { BusinessStatus, Role, SubscriptionStatus } from '@prisma/client';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import {
  SignupsQueryDto,
  TasksQueryDto,
  UpdateSignupDto,
  UpdateTaskDto,
} from '../lifecycle/dto/agency-signups.dto';
import { addDays, daysBetween, karachiDateOnly } from '../common/dates';

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
    private readonly planLimits: PlanLimitsService,
    private readonly subscriptions: SubscriptionsService,
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

        // Trial plan; also mirrors Business.status/subscriptionExpiresAt.
        await this.subscriptions.startTrial(business.id, tx);

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

  /** Subscription + last-30-day usage per tenant (one grouped query, no per-tenant scans). */
  private async enrichment(businessIds: string[]) {
    const since = addDays(karachiDateOnly(new Date()), -29);
    const [subs, usage] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { businessId: { in: businessIds } },
        select: {
          businessId: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          plan: { select: { code: true, name: true } },
        },
      }),
      this.prisma.tenantDailyUsage.groupBy({
        by: ['businessId'],
        where: { businessId: { in: businessIds }, date: { gte: since } },
        _sum: { ordersCount: true, gmv: true },
      }),
    ]);
    return {
      subs: new Map(subs.map((x) => [x.businessId, x])),
      usage: new Map(usage.map((x) => [x.businessId, x])),
    };
  }

  private enrich<T extends { id: string }>(
    b: T,
    e: Awaited<ReturnType<AgencyService['enrichment']>>,
  ) {
    const sub = e.subs.get(b.id);
    const u = e.usage.get(b.id);
    return {
      ...b,
      subscription: sub
        ? {
            status: sub.status,
            planCode: sub.plan.code,
            planName: sub.plan.name,
            trialEndsAt: sub.trialEndsAt,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      usage30: {
        orders: u?._sum.ordersCount ?? 0,
        gmv: M.round2(u?._sum.gmv ?? 0),
      },
    };
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
    const e = await this.enrichment(businesses.map((b) => b.id));
    return businesses.map(({ status, subscriptionExpiresAt, ...rest }) =>
      this.enrich({ ...rest, status, subscriptionExpiresAt }, e),
    );
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
    const e = await this.enrichment([business.id]);
    return this.enrich({ ...rest, status, subscriptionExpiresAt }, e);
  }

  /**
   * Support "view as tenant": a 1 h Session for the tenant's owner with
   * impersonatedBy = the admin. SessionGuard makes such sessions read-only.
   * The VIEW_AS access-log row is written by AdminAccessLogInterceptor.
   */
  async createViewAsSession(businessId: string, adminId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, ownerId: true },
    });
    if (!business) {
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const token = randomBytes(32).toString('hex');
    await this.prisma.session.create({
      data: {
        id: randomUUID(),
        token,
        userId: business.ownerId,
        expiresAt,
        impersonatedBy: adminId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const frontend = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return { token, url: `${frontend}/dashboard?viewAs=1`, expiresAt };
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

    // The kill switch reads the Subscription, so its status moves together with
    // Business.status. Dates are left alone: an agency status change is not a renewal.
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { businessId },
        data: { status: status as SubscriptionStatus },
      });
      await tx.business.update({
        where: { id: businessId },
        data: { status: status as BusinessStatus },
      });
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

        // Subscription follows the same paid-through date (period end = paymentDate).
        await this.subscriptions.extend(
          businessId,
          { until: paymentDate },
          tx,
        );

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

    // The agency is SUPER_ADMIN by definition; exceeding the plan needs an explicit override.
    if (data?.override !== true) {
      await this.planLimits.assert(businessId, 'branches');
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

  /** Signup feed for the agency: newest first, with owner contact and trial days left. */
  async getSignups(query: SignupsQueryDto) {
    const now = new Date();
    const businesses = await this.prisma.business.findMany({
      where: {
        ...(query.status ? { followUpStatus: query.status } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        name: true,
        city: true,
        market: true,
        source: true,
        phone: true,
        createdAt: true,
        followUpStatus: true,
        followUpNotes: true,
        owner: { select: { name: true, email: true, phone: true } },
        subscription: {
          select: { status: true, trialEndsAt: true, plan: { select: { code: true } } },
        },
      },
    });
    return businesses.map((b) => {
      const trialEndsAt = b.subscription?.trialEndsAt ?? null;
      const onTrial = b.subscription?.status === 'TRIALING';
      return {
        businessId: b.id,
        businessName: b.name,
        ownerName: b.owner.name,
        ownerEmail: b.owner.email,
        phone: b.phone ?? b.owner.phone ?? null,
        city: b.city,
        market: b.market,
        source: b.source,
        createdAt: b.createdAt,
        followUpStatus: b.followUpStatus,
        followUpNotes: b.followUpNotes,
        subscriptionStatus: b.subscription?.status ?? null,
        trialEndsAt,
        trialDaysLeft:
          onTrial && trialEndsAt ? Math.max(0, daysBetween(now, trialEndsAt)) : null,
      };
    });
  }

  async updateSignup(businessId: string, body: UpdateSignupDto) {
    const exists = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Business not found');
    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(body.followUpStatus !== undefined
          ? { followUpStatus: body.followUpStatus }
          : {}),
        ...(body.followUpNotes !== undefined
          ? { followUpNotes: body.followUpNotes }
          : {}),
      },
      select: { id: true, followUpStatus: true, followUpNotes: true },
    });
    return {
      businessId: updated.id,
      followUpStatus: updated.followUpStatus,
      followUpNotes: updated.followUpNotes,
    };
  }

  async getTasks(query: TasksQueryDto) {
    return this.prisma.agencyTask.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 500,
      include: {
        business: {
          select: { id: true, name: true, phone: true, city: true, market: true },
        },
      },
    });
  }

  async completeTask(id: string, body: UpdateTaskDto) {
    const task = await this.prisma.agencyTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.agencyTask.update({
      where: { id },
      data: {
        status: 'DONE',
        doneAt: task.doneAt ?? new Date(),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
  }
}
