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
} from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async inviteStaff(@Req() req: any, @Body() body: any) {
    return this.teamService.inviteStaff(body);
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async activeMembersTeam(@Req() req: any) {
    return this.teamService.activeMembers(req.user.id);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async activeMembers(@Req() req: any) {
    return this.teamService.activeMembers(req.user.id);
  }

  @Get('pendinginvites')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async pendingInvitesTeam(@Req() req: any) {
    return this.teamService.pendingInvites(req.user.id);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async pendingInvites(@Req() req: any) {
    return this.teamService.pendingInvites(req.user.id);
  }

  @Patch('updaterole')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async updateRolePatch(@Req() req: any, @Body() body: any) {
    return this.teamService.updateRole(req.user.id, body);
  }

  @Put('role')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async updateRole(@Req() req: any, @Body() body: any) {
    return this.teamService.updateRole(req.user.id, body);
  }

  @Delete('removemember')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async removeMemberTeam(@Req() req: any, @Body() body: any) {
    return this.teamService.removeMember(req.user.id, body);
  }

  @Delete('remove')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async removeMember(@Req() req: any, @Body() body: any) {
    return this.teamService.removeMember(req.user.id, body);
  }

  @Post('resendinvite')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async resendInviteTeam(@Req() req: any, @Body() body: any) {
    return this.teamService.resendInvite(req.user.id, body);
  }

  @Post('resend-invite')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage:team')
  async resendInvite(@Req() req: any, @Body() body: any) {
    return this.teamService.resendInvite(req.user.id, body);
  }

  @Delete('cancelinvite')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async cancelInviteTeam(@Req() req: any, @Body() body: any) {
    return this.teamService.cancelInvite(req.user.id, body);
  }

  @Delete('cancel-invite')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('OWNER')
  @RequirePermissions('manage:team')
  async cancelInvite(@Req() req: any, @Body() body: any) {
    return this.teamService.cancelInvite(req.user.id, body);
  }
}
