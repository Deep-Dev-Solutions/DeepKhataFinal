import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncPullService } from './sync-pull.service';
import { OrdersModule } from '../orders/orders.module';
import { KhataEntriesModule } from '../khata-entries/khata-entries.module';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [OrdersModule, KhataEntriesModule, CashModule],
  controllers: [SyncController],
  providers: [SyncService, SyncPullService],
  exports: [SyncService, SyncPullService],
})
export class SyncModule {}
