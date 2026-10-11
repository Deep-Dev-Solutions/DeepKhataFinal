import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { BusinessStatus, Role } from '@prisma/client';
import { TenantCacheService } from '../../tenant/tenant-cache.service';
import { ALLOW_WITHOUT_BUSINESS_KEY } from '../../tenant/allow-without-business.decorator';
import { TenantContext } from '../../tenant/tenant.types';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly tenantCache: TenantCacheService,
    private readonly reflector: Reflector,
  ) {
    super();
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException('Not authorized, no token or token invalid')
      );
    }
    return user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Authenticate via passport — this populates request.user.
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true;

    // (a) Revoked access tokens (logout / session end) are rejected.
    if (user.jti && (await this.tenantCache.isRevoked(user.jti))) {
      throw new UnauthorizedException('Session has ended');
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
      const method = request.method;
      const allowedInReadOnly =
        READ_ONLY_METHODS.has(method) ||
        // Logout must always work, even in read-only mode.
        (method === 'POST' && request.path?.endsWith('/auth/logout'));

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

  private isAuthPath(request: any): boolean {
    const raw: string = request.path || request.url || '';
    const path = raw.split('?')[0];
    return path.startsWith('/auth/');
  }
}
