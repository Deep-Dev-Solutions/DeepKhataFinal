import { Module } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { CategoryModule } from '../category/category.module.js';
import { CabinetModule } from '../cabinet/cabinet.module.js';

@Module({
  imports: [CategoryModule, CabinetModule],
  providers: [ProductsService],
  controllers: [ProductsController],
})
export class ProductsModule {}