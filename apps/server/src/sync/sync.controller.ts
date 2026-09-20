import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller()
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('sync/batch')
  async syncBatch(@Req() req: any, @Body() body: any) {
    return this.syncService.processSyncBatch(req.user.id, body);
  }

  @Post('sync')
  async sync(@Req() req: any, @Body() body: any) {
    return this.syncService.processSyncBatch(req.user.id, body);
  }

  @Post('order/sync')
  async orderSync(@Req() req: any, @Body() body: any) {
    return this.syncService.processSyncBatch(req.user.id, body);
  }
}
