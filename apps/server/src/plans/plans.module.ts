import { Global, Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';
import { SubscriptionsService } from './subscriptions.service';
import { PlansController } from './plans.controller';

@Global()
@Module({
  providers: [PlanLimitsService, SubscriptionsService],
  controllers: [PlansController],
  exports: [PlanLimitsService, SubscriptionsService],
})
export class PlansModule {}
