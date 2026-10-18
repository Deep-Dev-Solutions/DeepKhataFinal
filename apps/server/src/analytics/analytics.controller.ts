import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { TenantsAnalyticsQueryDto, UsageStatementQueryDto } from './analytics.dto';

/** SUPER_ADMIN only. The tenant is addressed by :id and validated to exist. */
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('agency/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.analytics.getOverview();
  }

  @Get('tenants')
  async tenants(
    @Query() q: TenantsAnalyticsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.analytics.listTenants(q);
    if (q.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tenants-analytics.csv"',
      });
      return new StreamableFile(Buffer.from(this.analytics.tenantsToCsv(rows), 'utf8'));
    }
    return rows;
  }

  @Get('tenants/:id')
  tenantDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.getTenantDetail(id);
  }

  @Get('tenants/:id/usage-statement.pdf')
  async usageStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: UsageStatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'json') {
      return this.analytics.getUsageStatement(id, q.from, q.to);
    }
    const file = await this.analytics.buildUsageStatementPdf(id, q.from, q.to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.buffer);
  }
}
