import { Module } from '@nestjs/common';
import { TeamService } from './team.service.js';
import { TeamController } from './team.controller.js';

@Module({
  providers: [TeamService],
  controllers: [TeamController]
})
export class TeamModule {}
