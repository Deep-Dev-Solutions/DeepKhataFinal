import { Module } from '@nestjs/common';
import { StockFinderController } from './stock-finder.controller';
import { StockFinderService } from './stock-finder.service';

@Module({
  controllers: [StockFinderController],
  providers: [StockFinderService],
  exports: [StockFinderService],
})
export class StockFinderModule {}
