import {
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerOptions,
} from '@nestjs/throttler';

/**
 * Rate limiting scopes.
 *
 * ThrottlerGuard is registered once, globally (APP_GUARD in AppModule), so every
 * route gets the `default` throttler (THROTTLE_LIMIT per THROTTLE_TTL_MS, tracked
 * per route and client IP). The strict `auth` and `public` throttlers are named
 * throttlers whose `skipIf` skips every route that is not marked with
 * `@AuthThrottle()` / `@PublicThrottle()`, so they only apply where decorated.
 * The tracker is `req.ip`, which is proxy-aware (see configureTrustProxy).
 */
export const THROTTLE_SCOPE_KEY = 'dk:throttle-scope';
export type ThrottleScope = 'auth' | 'public';

/** Credential endpoints (login, register, resend, change-password). */
export const AuthThrottle = () => SetMetadata(THROTTLE_SCOPE_KEY, 'auth');
/** Unauthenticated, token-addressed endpoints (invites, public invoices). */
export const PublicThrottle = () => SetMetadata(THROTTLE_SCOPE_KEY, 'public');

function scopeOf(context: ExecutionContext): string | undefined {
  return (
    Reflect.getMetadata(THROTTLE_SCOPE_KEY, context.getHandler()) ??
    Reflect.getMetadata(THROTTLE_SCOPE_KEY, context.getClass())
  );
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Read at module-compile time so tests can set env first. */
export function buildThrottlerOptions(): ThrottlerModuleOptions {
  const ttl = intEnv('THROTTLE_TTL_MS', 60_000);
  const scoped = (name: ThrottleScope, limit: number): ThrottlerOptions => ({
    name,
    ttl,
    limit,
    skipIf: (context) => scopeOf(context) !== name,
  });
  return {
    throttlers: [
      { name: 'default', ttl, limit: intEnv('THROTTLE_LIMIT', 100) },
      scoped('auth', intEnv('THROTTLE_AUTH_LIMIT', 10)),
      scoped('public', intEnv('THROTTLE_PUBLIC_LIMIT', 30)),
    ],
  };
}

/**
 * Same as ThrottlerGuard, but a blocked response always carries a plain
 * `Retry-After` header (the stock guard suffixes it for named throttlers).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse();
    this.setResponseHeader(res, 'Retry-After', detail.timeToBlockExpire);
    await super.throwThrottlingException(context, detail);
  }
}
