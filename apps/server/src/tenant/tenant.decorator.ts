import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { TenantContext } from './tenant.types';

/** Resolves the validated tenant context set by JwtAuthGuard (req.tenant). */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.tenant) {
      throw new ForbiddenException('Tenant context unavailable');
    }
    return request.tenant as TenantContext;
  },
);
