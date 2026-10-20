import { Module } from '@nestjs/common';
import { KhataEntriesModule } from '../khata-entries/khata-entries.module';
import { DuesController } from './dues.controller';
import { DuesService } from './dues.service';

@Module({
  imports: [KhataEntriesModule],
  controllers: [DuesController],
  providers: [DuesService],
  exports: [DuesService],
})
export class DuesModule {}
