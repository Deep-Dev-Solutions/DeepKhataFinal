import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { serializeSignedCookie } from 'better-call';
import { auth } from '../auth/better-auth';
import { SessionGuard } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';

/** HttpOnly cookie holding the agent's own session while a view-as session is active. */
export const ADMIN_RETURN_COOKIE = 'dk_admin_return';
const ADMIN_RETURN_MAX_AGE_S = 60 * 60;

function stashSignature(secret: string, token: string): string {
  return createHmac('sha256', secret)
    .update(`${ADMIN_RETURN_COOKIE}:${token}`)
    .digest('base64url');
}

/** `<token>.<hmac>`; the HMAC is domain-separated so it is never a valid session cookie. */
function signStash(secret: string, token: string): string {
  return `${token}.${stashSignature(secret, token)}`;
}

function readStash(secret: string, raw: string | undefined): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  if (i <= 0) return null;
  const token = raw.slice(0, i);
  const given = Buffer.from(raw.slice(i + 1));
  const want = Buffer.from(stashSignature(secret, token));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return token;
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const v = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Set-Cookie line for the stash cookie, with the session cookie's domain/path/secure. */
function serializeStashCookie(
  sessionAttrs: Record<string, unknown>,
  value: string,
  maxAge: number,
): string {
  const parts = [`${ADMIN_RETURN_COOKIE}=${encodeURIComponent(value)}`];
  parts.push(`Max-Age=${maxAge}`);
  if (maxAge === 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (sessionAttrs.domain) parts.push(`Domain=${String(sessionAttrs.domain)}`);
  parts.push(`Path=${String(sessionAttrs.path ?? '/')}`);
  parts.push('HttpOnly');
  if (sessionAttrs.secure) parts.push('Secure');
  parts.push('SameSite=Lax');
  return parts.join('; ');
}

export class ActivateViewAsDto {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;
}

/**
 * Support "view as tenant" entry points. The agency creates an impersonated
 * (read-only, 1 h) session and hands over its token; the tenant-facing client
 * exchanges it here for the normal signed Better Auth session cookie.
 */
@Controller('auth')
export class ViewAsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('view-as/activate')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async activate(
    @Body() dto: ActivateViewAsDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const invalid = () => new BadRequestException('Invalid or expired view-as link');
    const session = await this.prisma.session.findUnique({
      where: { token: dto.token },
      select: {
        token: true,
        expiresAt: true,
        impersonatedBy: true,
        user: { select: { business: { select: { name: true } } } },
      },
    });
    // Only impersonated sessions can be activated here; normal sessions never.
    if (!session || !session.impersonatedBy || session.expiresAt <= new Date()) {
      throw invalid();
    }

    const ctx = await auth.$context;
    const cookie = ctx.authCookies.sessionToken;
    const maxAge = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
    );
    const value = await serializeSignedCookie(
      cookie.name,
      session.token,
      ctx.secret,
      { ...(cookie.attributes as Record<string, unknown>), maxAge },
    );
    // Keep the agent's own session: stash it before the shared cookie is replaced.
    // Only the admin who minted this view-as session gets a return path, and an
    // existing stash (re-activation from a view-as tab) is never overwritten.
    const existing = readStash(
      ctx.secret,
      cookieValue(req.headers?.cookie, ADMIN_RETURN_COOKIE),
    );
    if (!existing) {
      const current = await auth.api
        .getSession({ headers: fromNodeHeaders(req.headers) })
        .catch(() => null);
      const cu: any = current?.user;
      if (
        current?.session &&
        !(current.session as any).impersonatedBy &&
        cu?.role === Role.SUPER_ADMIN &&
        cu.id === session.impersonatedBy
      ) {
        res.append(
          'Set-Cookie',
          serializeStashCookie(
            cookie.attributes as Record<string, unknown>,
            signStash(ctx.secret, current.session.token),
            ADMIN_RETURN_MAX_AGE_S,
          ),
        );
      }
    }
    res.append('Set-Cookie', value);

    return {
      ok: true,
      expiresAt: session.expiresAt,
      businessName: session.user.business?.name ?? null,
    };
  }

  /**
   * Ends the view-as session only: revokes the impersonated session, clears the
   * stash and puts the agent's original session cookie back (when it is still a
   * valid, non-impersonated SUPER_ADMIN session). Never signs into a tenant.
   */
  @Post('view-as/exit')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async exit(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const current = await auth.api
      .getSession({ headers: fromNodeHeaders(req.headers) })
      .catch(() => null);
    if (!current?.session || !current.user) {
      throw new UnauthorizedException('Not authorized, no session or session invalid');
    }
    const impersonatedBy = (current.session as any).impersonatedBy as string | null | undefined;
    if (!impersonatedBy) {
      throw new ForbiddenException('Not a view-as session');
    }

    const ctx = await auth.$context;
    await ctx.internalAdapter.deleteSession(current.session.token);

    const sessionCookie = ctx.authCookies.sessionToken;
    const attrs = sessionCookie.attributes as Record<string, unknown>;
    const stashToken = readStash(
      ctx.secret,
      cookieValue(req.headers?.cookie, ADMIN_RETURN_COOKIE),
    );
    // Always drop the stash and the (now dead) impersonated cookie.
    res.append('Set-Cookie', serializeStashCookie(attrs, '', 0));

    let restored = false;
    if (stashToken) {
      const admin = await this.prisma.session.findUnique({
        where: { token: stashToken },
        select: {
          token: true,
          expiresAt: true,
          impersonatedBy: true,
          userId: true,
          user: { select: { role: true, banned: true, deactivatedAt: true } },
        },
      });
      if (
        admin &&
        !admin.impersonatedBy &&
        admin.userId === impersonatedBy &&
        admin.expiresAt > new Date() &&
        admin.user.role === Role.SUPER_ADMIN &&
        !admin.user.banned &&
        !admin.user.deactivatedAt
      ) {
        const maxAge = Math.max(
          1,
          Math.floor((admin.expiresAt.getTime() - Date.now()) / 1000),
        );
        res.append(
          'Set-Cookie',
          await serializeSignedCookie(sessionCookie.name, admin.token, ctx.secret, {
            ...attrs,
            maxAge,
          }),
        );
        restored = true;
      }
    }
    if (!restored) {
      res.clearCookie(sessionCookie.name, {
        path: (attrs.path as string | undefined) ?? '/',
        domain: attrs.domain as string | undefined,
        httpOnly: attrs.httpOnly as boolean | undefined,
        secure: attrs.secure as boolean | undefined,
        sameSite: attrs.sameSite as 'lax' | 'strict' | 'none' | undefined,
      });
    }
    return { ok: true, restored };
  }

  @Get('session-info')
  @UseGuards(SessionGuard)
  async sessionInfo(@Req() req: any) {
    const session = req.session as
      | { impersonatedBy?: string | null; expiresAt?: Date | string }
      | undefined;
    if (!session?.impersonatedBy) return { impersonated: false };
    const business = req.user?.businessId
      ? await this.prisma.business.findUnique({
          where: { id: req.user.businessId },
          select: { name: true },
        })
      : null;
    return {
      impersonated: true,
      impersonatedUntil: session.expiresAt
        ? new Date(session.expiresAt).toISOString()
        : undefined,
      businessName: business?.name ?? null,
    };
  }
}
