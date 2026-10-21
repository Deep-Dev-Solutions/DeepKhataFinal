import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Observable, from, mergeMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_LOG_ACTION_KEY } from './access-log.decorator';
import {
  SUPPORT_READ_ACTION,
  firstHitInSession,
  isUnloggedSelfRoute,
  routeTemplate,
} from './view-as-log';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** /agency/tenants/:id and /agency/analytics/tenants/:id[/...] address a tenant by :id. */
const TENANT_ID_ROUTE = /^\/agency\/(?:analytics\/)?tenants\/[^/]+/;

function asId(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v : null;
}

/**
 * Records every SUPER_ADMIN access to a tenant's data in AdminAccessLog, which
 * the tenant can read at GET /settings/access-log:
 *  - agency routes that name a tenant (tenants/:id, analytics/tenants/:id,
 *    :businessId params, or a businessId in the query/body of billing routes);
 *  - a support view-as (impersonated) session: the VIEW_AS start row comes from
 *    the agency endpoint; later requests are logged once per (session, method,
 *    route template), never for self/background routes (/auth/*, /user/me).
 *    Refused writes are logged by SessionGuard.
 * The row is written before the response is released, after the handler succeeded.
 */
@Injectable()
export class AdminAccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminAccessLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const target = this.resolveTarget(req);
    if (!target) return next.handle();

    const action = target.impersonated
      ? SUPPORT_READ_ACTION
      : (this.reflector.get<string>(ACCESS_LOG_ACTION_KEY, context.getHandler()) ??
        context.getHandler().name);
    const route = target.impersonated
      ? routeTemplate(req)
      : String(req.originalUrl ?? req.url ?? '').split('?')[0];

    return next.handle().pipe(
      mergeMap((value) =>
        from(
          this.prisma.adminAccessLog
            .create({
              data: {
                adminId: target.adminId,
                businessId: target.businessId,
                action,
                route,
                method: String(req.method),
              },
            })
            .catch((e: Error) => {
              this.logger.error(`Access log write failed: ${e.message}`);
            })
            .then(() => value),
        ),
      ),
    );
  }

  private resolveTarget(
    req: any,
  ): { adminId: string; businessId: string; impersonated?: true } | null {
    const user = req.user;
    if (!user) return null;

    const impersonatedBy: string | undefined = req.session?.impersonatedBy ?? undefined;
    if (impersonatedBy) {
      if (!user.businessId) return null;
      const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
      if (isUnloggedSelfRoute(path)) return null;
      const token: string | undefined = req.session?.token;
      if (!token || !firstHitInSession(token, String(req.method), routeTemplate(req))) {
        return null;
      }
      return { adminId: impersonatedBy, businessId: user.businessId, impersonated: true };
    }

    if (user.role !== Role.SUPER_ADMIN) return null;
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    if (!path.startsWith('/agency/')) return null;

    const businessId =
      asId(req.params?.businessId) ??
      (TENANT_ID_ROUTE.test(path) ? asId(req.params?.id) : null) ??
      (path.startsWith('/agency/billing')
        ? (asId(req.query?.businessId) ?? asId(req.body?.businessId))
        : null);
    return businessId ? { adminId: user.id, businessId } : null;
  }
}
