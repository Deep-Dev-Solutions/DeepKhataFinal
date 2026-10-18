import { Controller, Post, Body, Res, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

function extractClientIp(req: Request): string {
  // req.ip honours X-Forwarded-For only from proxies listed in `trust proxy`.
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Post('login')
  async login(@Body() body: any, @Res() res: Response, @Req() req: Request) {
    const ip = extractClientIp(req);
    return this.authService.login(body, res, ip);
  }

  @Post('agency-login')
  async agencyLogin(
    @Body() body: any,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const ip = extractClientIp(req);
    return this.authService.agencyLogin(body, res, ip);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any, @Res() res: Response) {
    return this.authService.logout(req.user, res);
  }
}
