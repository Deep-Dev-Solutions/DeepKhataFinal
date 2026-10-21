import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [TeamModule],
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
