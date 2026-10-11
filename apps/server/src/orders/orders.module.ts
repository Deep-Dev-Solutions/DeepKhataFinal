import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { LedgerModule } from '../ledger/ledger.module';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [LedgerModule, ReservationsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
