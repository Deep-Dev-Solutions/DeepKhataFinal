import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessStatus, Role } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import { TenantCacheService } from '../../tenant/tenant-cache.service';
import { ALLOW_WITHOUT_BUSINESS_KEY } from '../../tenant/allow-without-business.decorator';
import { TenantContext } from '../../tenant/tenant.types';
import { authDb } from '../auth-db';
import { auth } from '../better-auth';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

/** userId -> last time lastActiveAt was written (per process). */
const lastActivityWrite = new Map<string, number>();

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tenantCache: TenantCacheService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Better Auth session from the cookie or an Authorization: Bearer token.
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!result?.session || !result.user) {
      throw new UnauthorizedException('Not authorized, no session or session invalid');
    }
    const { session } = result;
    const sessionUser: any = result.user;

    // 2. Role, business and standing come from the database (30 s cache), so
    // demotion, removal, ban and deactivation take effect without waiting.
    let live = await this.tenantCache.getUserAuth(sessionUser.id);
    if (live && (live.businessId ?? null) !== (sessionUser.businessId ?? null)) {
      // Onboarding may have attached a business the cached row does not know.
      this.tenantCache.invalidateUser(sessionUser.id);
      live = await this.tenantCache.getUserAuth(sessionUser.id);
    }
    if (!live) {
      throw new UnauthorizedException('Session has ended');
    }
    const bannedNow =
      live.banned && (!live.banExpires || live.banExpires > new Date());
    if (bannedNow || live.deactivatedAt) {
      throw new UnauthorizedException('Session has ended');
    }

    const user = {
      id: sessionUser.id as string,
      role: live.role,
      businessId: live.businessId,
    };
    request.user = user;
    request.session = session;

    this.touchActivity(user.id, user.businessId);

    // 3. Support view-as-tenant sessions are read-only.
    const method: string = request.method;
    const isLogout =
      method === 'POST' && !!request.path?.endsWith('/auth/logout');
    if (
      (session as any).impersonatedBy &&
      !READ_ONLY_METHODS.has(method) &&
      !isLogout
    ) {
      throw new ForbiddenException('Read-only while viewing as tenant');
    }

    // (b) Super admins have no tenant.
    if (user.role === Role.SUPER_ADMIN) return true;

    // (c) Business-less users may only reach explicitly allowed routes.
    if (!user.businessId) {
      const allowed =
        this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_BUSINESS_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) || this.isAuthPath(request);
      if (!allowed) {
        throw new ForbiddenException('Complete business onboarding first');
      }
      return true;
    }

    // (d) Tenant kill switch, served from a 60 s cache.
    const business = await this.tenantCache.getBusinessStatus(user.businessId);

    if (!business || business.status === BusinessStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Account suspended. Contact DeepKhata administration.',
      );
    }

    const isExpired =
      business.subscriptionExpiresAt &&
      new Date() > business.subscriptionExpiresAt;

    if (business.status === BusinessStatus.READ_ONLY || isExpired) {
      const allowedInReadOnly =
        READ_ONLY_METHODS.has(method) ||
        // Logout must always work, even in read-only mode.
        isLogout;

      if (!allowedInReadOnly) {
        throw new ForbiddenException(
          'Subscription expired. System is in read-only mode.',
        );
      }
    }

    // (e) A supplied branch header must belong to the user's business.
    const rawBranch = request.headers?.['x-branch-id'];
    const branchId =
      typeof rawBranch === 'string' && rawBranch.trim()
        ? rawBranch.trim()
        : null;
    if (
      branchId &&
      !(await this.tenantCache.isBranchInBusiness(user.businessId, branchId))
    ) {
      throw new ForbiddenException('Invalid branch');
    }

    // (f) Expose the validated tenant context.
    const tenant: TenantContext = {
      businessId: user.businessId,
      branchId,
      userId: user.id,
      role: user.role,
    };
    request.tenant = tenant;

    return true;
  }

  /** User and business lastActiveAt, written at most once per 5 minutes per user. */
  private touchActivity(userId: string, businessId: string | null): void {
    const now = Date.now();
    const last = lastActivityWrite.get(userId);
    if (last && now - last < ACTIVITY_THROTTLE_MS) return;
    lastActivityWrite.set(userId, now);
    if (lastActivityWrite.size > 10_000) {
      for (const [k, v] of lastActivityWrite) {
        if (now - v >= ACTIVITY_THROTTLE_MS) lastActivityWrite.delete(k);
      }
    }
    const at = new Date(now);
    const db = authDb();
    void db.user
      .update({ where: { id: userId }, data: { lastActiveAt: at } })
      .catch(() => {});
    if (businessId) {
      void db.business
        .update({ where: { id: businessId }, data: { lastActiveAt: at } })
        .catch(() => {});
    }
  }

  private isAuthPath(request: any): boolean {
    const raw: string = request.path || request.url || '';
    const path = raw.split('?')[0];
    return path.startsWith('/auth/');
  }
}
