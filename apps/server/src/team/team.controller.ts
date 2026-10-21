import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { InviteStaffDto, UpdateRoleDto } from './dto/team.dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('team')
@UseGuards(ThrottlerGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post('invite')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async inviteStaff(@Req() req: any, @Body() body: InviteStaffDto) {
    let businessId: string | null | undefined = req.user.businessId;
    if (!businessId) {
      const dbUser = await this.teamService.getUserBusinessId(req.user.id);
      businessId = dbUser;
    }
    if (!businessId) {
      throw new ForbiddenException('You do not belong to a business.');
    }
    return this.teamService.inviteStaff(
      { id: req.user.id, role: req.user.role, businessId },
      {
        email: body.email,
        role: body.role,
        allBranches: body.allBranches,
        branchIds: body.branchIds,
      },
    );
  }

  @Get('invite/:token')
  async invitedByToken(@Param('token') token: string) {
    return this.teamService.invitedByToken(token);
  }

  @Post('join')
  async acceptInviteJoin(@Body() body: any) {
    return this.teamService.acceptInvite(body);
  }

  @Post('accept-invite')
  async acceptInvite(@Body() body: any) {
    return this.teamService.acceptInvite(body);
  }

  @Get('activemembers')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async activeMembersTeam(@Req() req: any) {
    return this.teamService.activeMembers(req.user.id);
  }

  @Get('active')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async activeMembers(@Req() req: any) {
    return this.teamService.activeMembers(req.user.id);
  }

  @Get('pendinginvites')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async pendingInvitesTeam(@Req() req: any) {
    return this.teamService.pendingInvites(req.user.id);
  }

  @Get('pending')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async pendingInvites(@Req() req: any) {
    return this.teamService.pendingInvites(req.user.id);
  }

  @Patch('updaterole')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async updateRolePatch(@Req() req: any, @Body() body: UpdateRoleDto) {
    return this.teamService.updateRole(req.user.id, body);
  }

  @Put('role')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async updateRole(@Req() req: any, @Body() body: UpdateRoleDto) {
    return this.teamService.updateRole(req.user.id, body);
  }

  @Delete('removemember')
  @UseGuards(SessionGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async removeMemberTeam(@Req() req: any, @Body() body: any) {
    return this.teamService.removeMember(req.user.id, body);
  }

  @Delete('remove')
  @UseGuards(SessionGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async removeMember(@Req() req: any, @Body() body: any) {
    return this.teamService.removeMember(req.user.id, body);
  }

  @Post('resendinvite')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async resendInviteTeam(@Req() req: any, @Body() body: any) {
    return this.teamService.resendInvite(req.user.id, body);
  }

  @Post('resend-invite')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async resendInvite(@Req() req: any, @Body() body: any) {
    return this.teamService.resendInvite(req.user.id, body);
  }

  @Delete('cancelinvite')
  @UseGuards(SessionGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async cancelInviteTeam(@Req() req: any, @Body() body: any) {
    return this.teamService.cancelInvite(req.user.id, body);
  }

  @Delete('cancel-invite')
  @UseGuards(SessionGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async cancelInvite(@Req() req: any, @Body() body: any) {
    return this.teamService.cancelInvite(req.user.id, body);
  }
}
