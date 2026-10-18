import { Module } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { CategoryModule } from '../category/category.module.js';
import { CabinetModule } from '../cabinet/cabinet.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';

@Module({
  imports: [CategoryModule, CabinetModule, LedgerModule],
  providers: [ProductsService],
  controllers: [ProductsController],
})
export class ProductsModule {}