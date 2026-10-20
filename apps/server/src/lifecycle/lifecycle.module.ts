import { Module } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';

// PrismaService, MailService and SubscriptionsService come from global modules.
@Module({
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
