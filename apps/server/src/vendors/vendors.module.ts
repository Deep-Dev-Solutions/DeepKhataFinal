import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service.js';
import { VendorsController } from './vendors.controller.js';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  providers: [VendorsService],
  controllers: [VendorsController],
})
export class VendorsModule {}
