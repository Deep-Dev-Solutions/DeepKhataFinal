import { Module } from '@nestjs/common';
import { BillingController, PublicInvoicesController } from './billing.controller';
import { BillingService } from './billing.service';
import { RenewalsService } from './renewals.service';

@Module({
  controllers: [BillingController, PublicInvoicesController],
  providers: [BillingService, RenewalsService],
  exports: [BillingService, RenewalsService],
})
export class BillingModule {}
