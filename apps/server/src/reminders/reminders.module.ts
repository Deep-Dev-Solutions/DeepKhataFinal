import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DuesModule } from '../dues/dues.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [NotificationsModule, DuesModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
