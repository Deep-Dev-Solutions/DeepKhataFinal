import {
  BadRequestException,
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CAPTCHA_HEADER,
  CAPTCHA_MESSAGES,
  captchaEnabled,
  checkCaptcha,
} from './captcha';

@Injectable()
export class CaptchaService implements OnModuleInit {
  private readonly logger = new Logger(CaptchaService.name);

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'production' && !captchaEnabled()) {
      this.logger.warn(
        '!!! TURNSTILE_SECRET_KEY is not set: captcha is DISABLED. Register, forgot-password, resend-verification and sign-in-after-failures are unprotected against bots. Set it in production.',
      );
    }
  }

  isEnabled(): boolean {
    return captchaEnabled();
  }

  /** Token from the `x-captcha-response` header, else the `captchaToken` body field. */
  tokenFrom(req: Request, bodyToken?: unknown): string | undefined {
    const header = req.headers?.[CAPTCHA_HEADER];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader;
    return typeof bodyToken === 'string' ? bodyToken : undefined;
  }

  /** Throws 400 { code: CAPTCHA_REQUIRED | CAPTCHA_INVALID } unless the request carries a valid token. */
  async assert(req: Request, bodyToken?: unknown): Promise<void> {
    if (!captchaEnabled()) return;
    const ip = req.ip || req.socket?.remoteAddress || undefined;
    const code = await checkCaptcha(this.tokenFrom(req, bodyToken), ip);
    if (code) {
      throw new BadRequestException({ code, message: CAPTCHA_MESSAGES[code] });
    }
  }
}

@Global()
@Module({ providers: [CaptchaService], exports: [CaptchaService] })
export class CaptchaModule {}
