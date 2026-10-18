import { Module } from '@nestjs/common';
import { DuesModule } from '../dues/dues.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './email.channel';

@Module({
  imports: [DuesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
