import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service.js';
import { VendorsController } from './vendors.controller.js';

@Module({
  providers: [VendorsService],
  controllers: [VendorsController],
})
export class VendorsModule {}
