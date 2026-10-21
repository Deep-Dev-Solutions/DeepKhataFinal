import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessLogQueryDto } from './analytics.dto';
import { VIEW_AS_ACTION } from './view-as-log';

/** What the tenant sees: when support looked at their data. The admin is never named. */
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
@Controller('settings/access-log')
export class AccessLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Tenant() t: TenantContext, @Query() q: AccessLogQueryDto) {
    const take = q.limit ?? 50;
    const select = { createdAt: true, action: true, route: true } as const;
    // The start of a visit (VIEW_AS) must never be pushed out by later rows:
    // always include the newest VIEW_AS rows, fill the rest with the newest others.
    const starts = await this.prisma.adminAccessLog.findMany({
      where: { businessId: t.businessId, action: VIEW_AS_ACTION },
      orderBy: { createdAt: 'desc' },
      take,
      select,
    });
    const others =
      take > starts.length
        ? await this.prisma.adminAccessLog.findMany({
            where: { businessId: t.businessId, action: { not: VIEW_AS_ACTION } },
            orderBy: { createdAt: 'desc' },
            take: take - starts.length,
            select,
          })
        : [];
    const rows = [...starts, ...others].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const adminName = `Support (${process.env.APP_NAME || 'DeepKhata'})`;
    return rows.map((r) => ({ ...r, adminName }));
  }
}
