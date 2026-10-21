import { randomUUID } from 'node:crypto';
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { createEmailVerificationToken, isAPIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionsService } from './auth-sessions.service';
import { sendVerificationMail } from './auth-mail';
import type { RegisterDto } from './dto/register.dto';
import {
  auth,
  CLIENT_IP_HEADER,
  REQUIRE_ROLE_HEADER,
} from './better-auth';
import { CAPTCHA_HEADER } from '../captcha/captcha';
import { assertEmailAllowed } from '../common/disposable-email';

const FORWARDED_CODES = new Set([
  'CAPTCHA_REQUIRED',
  'CAPTCHA_INVALID',
  'EMAIL_DOMAIN_NOT_ALLOWED',
]);

interface SignInOptions {
  message: string;
  requiredRole?: Role;
  includeBusiness: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private authSessions: AuthSessionsService,
  ) {}

  /** Maps a Better Auth APIError onto the Nest exception the old routes threw. */
  private toHttpException(err: unknown): never {
    if (!isAPIError(err)) throw err;
    const body = err.body as { message?: string; code?: string } | undefined;
    const message = body?.message ?? err.message;
    if (err.statusCode === 400 && body?.code && FORWARDED_CODES.has(body.code)) {
      throw new BadRequestException({ code: body.code, message });
    }
    switch (err.statusCode) {
      case 400:
        throw new BadRequestException(message);
      case 401:
        throw new UnauthorizedException(message);
      case 403:
        throw new ForbiddenException(message);
      default:
        throw new HttpException(message, err.statusCode || HttpStatus.BAD_REQUEST);
    }
  }

  async register(data: RegisterDto, req?: Request) {
    const { name, password, phone } = data;
    const email = data.email.trim().toLowerCase();
    assertEmailAllowed(email);

    const existinguser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existinguser) {
      throw new BadRequestException('Email Already Exist');
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, phone: phone?.trim() || null, emailVerified: false },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: created.id,
          providerId: 'credential',
          userId: created.id,
          password: hashPassword,
        },
      });
      return created;
    });

    const { token } = await this.authSessions.createSessionFor(newUser.id, {
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });

    await this.sendVerification(newUser);

    const { password: _, ...userWithoutPassword } = newUser;
    return { user: userWithoutPassword, accessToken: token };
  }

  /** Mails a fresh 24 h verification link; mail failures never fail the caller. */
  private async sendVerification(user: {
    email: string;
    name: string;
  }): Promise<void> {
    try {
      const ctx = await auth.$context;
      const token = await createEmailVerificationToken(
        ctx.secret,
        user.email,
        undefined,
        60 * 60 * 24,
      );
      await sendVerificationMail(user, token);
    } catch {
      // MailService already logs and retries delivery failures.
    }
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailVerified: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }
    await this.sendVerification(user);
    return { success: true, message: 'Verification email sent' };
  }

  /**
   * Compatibility shim over Better Auth sign-in. Lockouts and the suspended
   * business check run in the Better Auth hooks (better-auth.ts); this sets the
   * session cookie and returns the session token as `accessToken` (valid as
   * `Authorization: Bearer`).
   */
  private async signIn(
    data: any,
    req: Request,
    res: Response,
    opts: SignInOptions,
  ) {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const headers = fromNodeHeaders(req.headers);
    headers.delete('authorization');
    headers.delete('cookie');
    headers.delete(REQUIRE_ROLE_HEADER);
    headers.set(CLIENT_IP_HEADER, ip);
    if (opts.requiredRole) headers.set(REQUIRE_ROLE_HEADER, opts.requiredRole);
    // The captcha token may come in the body instead of the header.
    if (!headers.get(CAPTCHA_HEADER) && typeof data?.captchaToken === 'string') {
      headers.set(CAPTCHA_HEADER, data.captchaToken);
    }

    const { email, username: rawUsername, password } = data ?? {};
    const username =
      typeof rawUsername === 'string' ? rawUsername.trim() : rawUsername;
    let out;
    try {
      out =
        typeof email !== 'string' && typeof username === 'string'
          ? await auth.api.signInUsername({
              body: { username, password },
              headers,
              returnHeaders: true,
            })
          : await auth.api.signInEmail({
              body: {
                email: typeof email === 'string' ? email.trim() : '',
                password,
              },
              headers,
              returnHeaders: true,
            });
    } catch (err) {
      this.toHttpException(err);
    }

    const token = out.response.token as string;
    for (const cookie of out.headers.getSetCookie()) {
      res.append('Set-Cookie', cookie);
    }

    const existinguser = await this.prisma.user.findUnique({
      where: { id: out.response.user.id },
      include: opts.includeBusiness
        ? { business: { select: { status: true } } }
        : undefined,
    });
    const { password: _, ...userWithoutPassword } = existinguser;

    return res.json({
      message: opts.message,
      accessToken: token,
      user: userWithoutPassword,
    });
  }

  async login(data: any, req: Request, res: Response) {
    return this.signIn(data, req, res, {
      message: 'Login successful',
      includeBusiness: true,
    });
  }

  async agencyLogin(data: any, req: Request, res: Response) {
    return this.signIn(data, req, res, {
      message: 'Agency login successful',
      requiredRole: Role.SUPER_ADMIN,
      includeBusiness: false,
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        businessId: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
        business: {
          select: {
            id: true,
            status: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async logout(session: { token?: string } | undefined, res: Response) {
    if (session?.token) {
      await this.authSessions.revokeSession(session.token);
    }
    const ctx = await auth.$context;
    const cookie = ctx.authCookies.sessionToken;
    // Same name/domain/path as when set, or the browser keeps the cookie.
    res.clearCookie(cookie.name, {
      path: cookie.attributes.path ?? '/',
      domain: cookie.attributes.domain,
      httpOnly: cookie.attributes.httpOnly,
      secure: cookie.attributes.secure,
      sameSite: cookie.attributes.sameSite as 'lax' | 'strict' | 'none' | undefined,
    });
    return res.json({ message: 'Logout successful' });
  }
}
