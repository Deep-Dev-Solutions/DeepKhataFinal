import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('dashboard')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboarddata')
  async getDashboardDataFull(@Req() req: any, @Query() query: any) {
    return this.dashboardService.getDashboardData(req.user.id, query);
  }

  @Get()
  async getDashboardData(@Req() req: any, @Query() query: any) {
    return this.dashboardService.getDashboardData(req.user.id, query);
  }
}
