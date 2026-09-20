import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessStatus, Role } from '@prisma/client';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService) {
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

    // Public-of-auth requests, super admins, and business-less users are never throttled.
    if (!user || user.role === Role.SUPER_ADMIN || !user.businessId) {
      return true;
    }

    // 2. Tenant kill switch — every protected request is checked against the
    //    business's subscription state.
    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { status: true, subscriptionExpiresAt: true },
    });

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
      if (READ_ONLY_METHODS.has(method)) return true;

      // Logout must always work, even in read-only mode.
      if (method === 'POST' && request.path?.endsWith('/auth/logout')) {
        return true;
      }

      throw new ForbiddenException(
        'Subscription expired. System is in read-only mode.',
      );
    }

    return true;
  }
}
