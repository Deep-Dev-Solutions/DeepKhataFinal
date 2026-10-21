import { Module } from '@nestjs/common';
import { TeamService } from './team.service.js';
import { TeamController } from './team.controller.js';
import { TeamMembersService } from './team-members.service';
import { TeamMembersController } from './team-members.controller';

@Module({
  providers: [TeamService, TeamMembersService],
  controllers: [TeamController, TeamMembersController],
  exports: [TeamService],
})
export class TeamModule {}
