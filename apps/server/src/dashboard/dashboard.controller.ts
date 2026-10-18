import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BranchId } from '../auth/decorators/branch-id.decorator';

@Controller('dashboard')
@UseGuards(ThrottlerGuard, SessionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboarddata')
  async getDashboardDataFull(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query() query: any,
  ) {
    return this.dashboardService.getDashboardData(req.user.id, branchId, query);
  }

  @Get()
  async getDashboardData(
    @Req() req: any,
    @BranchId() branchId: string,
    @Query() query: any,
  ) {
    return this.dashboardService.getDashboardData(req.user.id, branchId, query);
  }
}
