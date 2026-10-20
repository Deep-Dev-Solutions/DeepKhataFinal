import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BranchId } from '../auth/decorators/branch-id.decorator';

@Controller('reports')
@UseGuards(ThrottlerGuard, SessionGuard, PermissionsGuard)
@RequirePermissions('read:reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('financial')
  async getFinancialOverview(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query() query: any,
  ) {
    return this.reportsService.getFinancialOverview(req.user.id, {
      ...query,
      branchId,
    });
  }

  @Get('inventory')
  async getInventoryInsights(
    @Req() req: any,
    @BranchId() branchId: string,
  ) {
    return this.reportsService.getInventoryInsights(req.user.id, branchId);
  }

  @Get('staff')
  async getStaffPerformance(
    @Req() req: any,
    @BranchId() branchId: string,
  ) {
    return this.reportsService.getStaffPerformance(req.user.id, branchId);
  }

  @Get('customers')
  async getCustomerInsights(
    @Req() req: any,
    @BranchId() branchId: string,
  ) {
    return this.reportsService.getCustomerInsights(req.user.id, branchId);
  }
}
