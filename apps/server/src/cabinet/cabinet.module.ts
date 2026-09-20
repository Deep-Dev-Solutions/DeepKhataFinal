import { Module } from '@nestjs/common';
import { CabinetService } from './cabinet.service.js';
import { CabinetController } from './cabinet.controller.js';

@Module({
  providers: [CabinetService],
  controllers: [CabinetController],
  exports: [CabinetService],
})
export class CabinetModule {}