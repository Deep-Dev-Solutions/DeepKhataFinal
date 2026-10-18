import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/guards/session.guard';
import { ChangePasswordDto } from './user-account.dto';
import { UserAccountService } from './user-account.service';

/** Self-service session and password management for the signed-in user. */
@Controller('user')
@UseGuards(SessionGuard)
export class UserAccountController {
  constructor(private readonly account: UserAccountService) {}

  @Get('sessions')
  sessions(@Req() req: any) {
    return this.account.listSessions(req.user.id, req.session.id);
  }

  @Post('sessions/revoke-others')
  revokeOthers(@Req() req: any) {
    return this.account.revokeOthers(req.user.id, req.session.id);
  }

  @Post('change-password')
  changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    return this.account.changePassword(req.user.id, req.session.id, body);
  }
}
