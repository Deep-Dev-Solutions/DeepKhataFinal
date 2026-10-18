import { Controller, Post, Get, Body, UseGuards, Req, Query } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncPullService } from './sync-pull.service';
import { SyncPullQueryDto } from './dto/sync-pull.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Tenant } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';

@Controller()
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly pullService: SyncPullService,
  ) {}

  @Get('sync/pull')
  async pull(@Tenant() t: TenantContext, @Query() query: SyncPullQueryDto) {
    return this.pullService.pull(t, query);
  }

  // The branch header is validated against the business by JwtAuthGuard
  // (req.tenant.branchId); it is never read from the body.
  @Post('sync/batch')
  async syncBatch(@Req() req: any, @Body() body: any) {
    return this.syncService.processSyncBatch(
      req.user.id,
      body,
      req.tenant?.branchId ?? null,
    );
  }

  @Post('sync')
  async sync(@Req() req: any, @Body() body: any) {
    return this.syncService.processSyncBatch(
      req.user.id,
      body,
      req.tenant?.branchId ?? null,
    );
  }

  @Post('order/sync')
  async orderSync(@Req() req: any, @Body() body: any) {
    return this.syncService.processSyncBatch(
      req.user.id,
      body,
      req.tenant?.branchId ?? null,
    );
  }
}
