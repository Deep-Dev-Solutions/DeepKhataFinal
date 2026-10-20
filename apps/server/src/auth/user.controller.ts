import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';

@Controller('user')
@UseGuards(SessionGuard)
export class UserController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }
}
