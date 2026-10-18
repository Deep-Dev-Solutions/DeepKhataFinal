# Server rules (apps/server)

The server is a long-running Node process, deployed as Docker on a VPS. The Vercel entry `apps/server/api/index.ts` is legacy until cutover.

- In-process scheduled jobs are allowed via `@nestjs/schedule`. Keep them idempotent with a unique log table, because a restart can re-run a tick.
- In-memory caches are allowed, but must have a TTL and must be safe to lose.
- Redis is optional. `RedisService` is a no-op without `REDIS_URL`. Do not make features depend on Redis.
- `DATABASE_URL` and `DIRECT_URL` both point at Postgres. Do not add pgbouncer flags locally.
- Long work must not block request handlers.
- Every controller uses `ThrottlerGuard` and `JwtAuthGuard`. Business routes also use `PermissionsGuard` with `@RequirePermissions`.
- Tenancy comes from `req.user` / `@Tenant()`, never from request input.
