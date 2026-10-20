import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from './plan-limits.service';

@Controller('plans')
@UseGuards(ThrottlerGuard, SessionGuard, RolesGuard)
@Roles(Role.OWNER, Role.SUPER_ADMIN)
export class PlansController {
  constructor(
    private readonly planLimits: PlanLimitsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('usage')
  async usage(@Tenant() tenant: TenantContext) {
    const { businessId } = tenant;
    const [limits, usage, sub] = await Promise.all([
      this.planLimits.getLimits(businessId),
      this.planLimits.getUsage(businessId),
      this.prisma.subscription.findUnique({
        where: { businessId },
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
        },
      }),
    ]);
    return {
      plan: limits.plan,
      limits: {
        maxBranches: limits.maxBranches,
        maxUsers: limits.maxUsers,
        maxProducts: limits.maxProducts,
      },
      usage,
      subscription: {
        status: sub?.status ?? null,
        trialEndsAt: sub?.trialEndsAt ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      },
    };
  }
}
