import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateMemberDto,
  ResetMemberPasswordDto,
  UpdateMemberDto,
} from './dto/team.dto';
import { TeamActor, TeamMembersService } from './team-members.service';

/** Owner-created members (username + password) and per-member management. */
@Controller('team/members')
@UseGuards(ThrottlerGuard, SessionGuard, PermissionsGuard, RolesGuard)
@RequirePermissions('manage:team')
export class TeamMembersController {
  constructor(private readonly members: TeamMembersService) {}

  private actor(req: any): TeamActor {
    const businessId: string | null | undefined = req.user?.businessId;
    if (!businessId) throw new ForbiddenException('You do not belong to a business.');
    return { id: req.user.id, role: req.user.role, businessId };
  }

  @Get()
  list(@Req() req: any) {
    return this.members.list(this.actor(req));
  }

  /** OWNER may create MANAGER or STAFF; MANAGER may create STAFF only (service rule). */
  @Post()
  create(@Req() req: any, @Body() body: CreateMemberDto) {
    return this.members.create(this.actor(req), body);
  }

  @Patch(':id')
  @Roles('OWNER')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateMemberDto) {
    return this.members.update(this.actor(req), id, body);
  }

  @Post(':id/reset-password')
  @Roles('OWNER')
  resetPassword(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ResetMemberPasswordDto,
  ) {
    return this.members.resetPassword(this.actor(req), id, body);
  }

  @Post(':id/sign-out-all')
  @Roles('OWNER')
  signOutAll(@Req() req: any, @Param('id') id: string) {
    return this.members.signOutAll(this.actor(req), id);
  }

  @Post(':id/deactivate')
  @Roles('OWNER')
  deactivate(@Req() req: any, @Param('id') id: string) {
    return this.members.deactivate(this.actor(req), id);
  }

  @Post(':id/reactivate')
  @Roles('OWNER')
  reactivate(@Req() req: any, @Param('id') id: string) {
    return this.members.reactivate(this.actor(req), id);
  }
}
