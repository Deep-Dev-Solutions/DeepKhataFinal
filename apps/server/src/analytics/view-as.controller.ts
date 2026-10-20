import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { serializeSignedCookie } from 'better-call';
import { auth } from '../auth/better-auth';
import { SessionGuard } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';

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
    res.append('Set-Cookie', value);

    return {
      ok: true,
      expiresAt: session.expiresAt,
      businessName: session.user.business?.name ?? null,
    };
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
