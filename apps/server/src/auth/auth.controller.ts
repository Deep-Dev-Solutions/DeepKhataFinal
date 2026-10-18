import { Controller, Post, Body, Res, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SessionGuard } from './guards/session.guard';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any, @Req() req: Request) {
    return this.authService.register(body, req);
  }

  @Post('login')
  async login(@Body() body: any, @Res() res: Response, @Req() req: Request) {
    return this.authService.login(body, req, res);
  }

  @Post('agency-login')
  async agencyLogin(
    @Body() body: any,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    return this.authService.agencyLogin(body, req, res);
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: any, @Res() res: Response) {
    return this.authService.logout(req.session, res);
  }
}
