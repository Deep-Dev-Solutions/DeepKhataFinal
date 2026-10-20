import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AnalyticsController } from './analytics.controller';
import { AccessLogController } from './access-log.controller';
import { ViewAsController } from './view-as.controller';
import { AnalyticsService } from './analytics.service';
import { UsageRollupService } from './usage-rollup.service';
import { AdminAccessLogInterceptor } from './access-log.interceptor';

@Module({
  controllers: [AnalyticsController, AccessLogController, ViewAsController],
  providers: [
    AnalyticsService,
    UsageRollupService,
    { provide: APP_INTERCEPTOR, useClass: AdminAccessLogInterceptor },
  ],
  exports: [UsageRollupService, AnalyticsService],
})
export class AnalyticsModule {}
