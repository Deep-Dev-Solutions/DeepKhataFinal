import { Controller, Post, Body, Res, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import { SessionGuard } from './guards/session.guard';
import { RegisterDto } from './dto/register.dto';
import { AuthThrottle } from '../common/throttle';
import { CaptchaService } from '../captcha/captcha.service';
import { CaptchaBodyDto } from '../captcha/captcha.dto';

@Controller('auth')
@AuthThrottle()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captcha: CaptchaService,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    await this.captcha.assert(req, body.captchaToken);
    return this.authService.register(body, req);
  }

  @Post('resend-verification')
  @UseGuards(SessionGuard)
  async resendVerification(@Req() req: any, @Body() body: CaptchaBodyDto) {
    await this.captcha.assert(req, body?.captchaToken);
    return this.authService.resendVerification(req.user.id);
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
