import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessLogQueryDto } from './analytics.dto';

/** What the tenant sees: when support looked at their data. The admin is never named. */
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
@Controller('settings/access-log')
export class AccessLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Tenant() t: TenantContext, @Query() q: AccessLogQueryDto) {
    const rows = await this.prisma.adminAccessLog.findMany({
      where: { businessId: t.businessId },
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 50,
      select: { createdAt: true, action: true, route: true },
    });
    const adminName = `Support (${process.env.APP_NAME || 'DeepKhata'})`;
    return rows.map((r) => ({ ...r, adminName }));
  }
}
