import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { KhataEntriesController } from './khata-entries.controller';
import { KhataEntriesService } from './khata-entries.service';

@Module({
  imports: [LedgerModule],
  controllers: [KhataEntriesController],
  providers: [KhataEntriesService],
  exports: [KhataEntriesService],
})
export class KhataEntriesModule {}
