import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { bindAuthDb } from './auth-db';
import { assertAuthSecret, auth } from './better-auth';

export interface SessionRequestInfo {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCache: TenantCacheService,
  ) {
    assertAuthSecret();
    bindAuthDb(prisma);
  }

  /** Ends every session of the user at once (role change, removal, ban). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
    this.tenantCache.invalidateUser(userId);
  }

  /** Ends one session by its token (logout). */
  async revokeSession(token: string): Promise<void> {
    const ctx = await auth.$context;
    await ctx.internalAdapter.deleteSession(token);
  }

  /**
   * Opens a session without a password check, for flows that already proved
   * identity (invite accept, onboarding). The token works as a Bearer token.
   */
  async createSessionFor(
    userId: string,
    req?: SessionRequestInfo,
  ): Promise<{ token: string }> {
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(
      userId,
      false,
      req
        ? { ipAddress: req.ip ?? undefined, userAgent: req.userAgent ?? undefined }
        : undefined,
    );
    return { token: session.token };
  }
}
