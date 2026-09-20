import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('reports')
@UseGuards(ThrottlerGuard, JwtAuthGuard, PermissionsGuard, RolesGuard)
@RequirePermissions('read:reports')
@Roles(Role.OWNER, Role.SUPER_ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('financial')
  async getFinancialOverview(@Req() req: any, @Query() query: any) {
    return this.reportsService.getFinancialOverview(req.user.id, query);
  }

  @Get('inventory')
  async getInventoryInsights(@Req() req: any) {
    return this.reportsService.getInventoryInsights(req.user.id);
  }

  @Get('staff')
  async getStaffPerformance(@Req() req: any) {
    return this.reportsService.getStaffPerformance(req.user.id);
  }

  @Get('customers')
  async getCustomerInsights(@Req() req: any) {
    return this.reportsService.getCustomerInsights(req.user.id);
  }
}
