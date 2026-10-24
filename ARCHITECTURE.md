# DeepKhata architecture

Four deployable parts, one Postgres database. Cloud runs as containers on a single
VPS; shops that must run without internet get the two Electron editions.

## Parts and containers

| Part | Stack | Container | Port |
| --- | --- | --- | --- |
| API | NestJS 11, Prisma 6, Better Auth | `api` (image `deepkhata-api`) | 5000 |
| Shop client | Next.js 16 PWA (Dexie, Serwist) | `client` | 3000 |
| Agency admin | Next.js super-admin console | `admin` | 3001 |
| Database | Postgres 17 | `postgres` | 5432 internal (5434 on the `full` profile) |
| Dev email | Mailpit | `mailpit` | 1025 / 8025 UI (8027 on the `full` profile) |

- Dev: `docker-compose.dev.yml` (Postgres + Mailpit) plus `npm run dev` for the three Node processes.
- Staging/production shape: root `docker-compose.yml` `--profile full` (`npm run stack:up/down/logs`), or `deploy/docker-compose.prod.yml` with Caddy + nightly R2 backups on the VPS.
- Electron: `apps/desktop-online` (thin shell → the cloud app, adds local receipt printing and cash-drawer kick) and `apps/desktop` (On-Premises: API + Postgres embedded, offline-first).

## Request flow (cloud)

1. Browser → Next client at :3000. API calls go straight to :5000 with Better Auth HTTP-only cookies.
2. API: CORS from `CORS_ORIGINS` → `mountAuth` first (Better Auth owns `/api/auth/*` including Turnstile hooks and rate limits; it needs the raw body) → Nest JSON body parser → `SessionGuard` (cookie session) → `PermissionsGuard` (`@RequirePermissions`) inside a business context → domain controller.
3. Tenancy: `req.user` carries `businessId`(+ branch). Controllers use `@Tenant()`; request input can never set businessId. `x-branch-id` is validated against the business. Cross-tenant reads must return 404.
4. Money: `Decimal(14,2)`, arithmetic via `Prisma.Decimal` / `src/common/money.ts`; ledger posts in the same `$transaction` as the business change and always sums to 0.
5. Schema: `apps/server/prisma/schema.prisma`, migrations only (`prisma migrate dev`), numbered `0000_…`; API container runs `migrate deploy` at boot.
6. Background jobs: `@nestjs/schedule` in-process, idempotent via their own log tables. Redis is optional (`RedisService` is a no-op without `REDIS_URL`).

## Auth

Better Auth (`apps/server/src/auth/better-auth.ts`) issue HTTP-only cookie sessions shared across app/api/admin via `COOKIE_DOMAIN`. Client keeps the session in TanStack Query (`src/lib/auth-client.ts`); admin has its own client. Roles/permissions: server-managed (`auth/guards`, agency `view-as` impersonation). Captcha: Turnstile on sign-up / sign-in / forgot-password (off when the key is unset).

## Offline (client PWA)

`src/lib/db.ts` holds the Dexie cache (products, customers, khata, orders, sync state); `src/lib/sync/*` is the queue: writes are recorded offline, replayed on reconnect (`pull.ts`, `merge.ts`), conflicts surface via `components/sync/ConflictDialog.tsx`. Server side: `src/sync/*` (push/pull endpoints, last-write rules). Search falls back to the cached list with zero network (`lib/search`). The On-Premises desktop edition talks to its embedded API against the inner Postgres.

## Where each feature lives (server module → client folder)

| Feature | Nest module (`apps/server/src/…`) | Client (`apps/client/src/app/…`) |
| --- | --- | --- |
| POS / orders | `orders` | `(dashboard)/orders/new`, `orders/[id]` |
| Products & inventory | `products`, `category`, `inventory`, `stock-transfers`, `reservations` | `(dashboard)/products`, `inventory/*` |
| Customers / khata / dues | `customers`, `khata-entries`, `dues` | `(dashboard)/customers/*`, `dues` |
| Vendors / restock | `vendors` | `(dashboard)/vendors/*`, `inventory/restock` |
| Cash / galla / Z-report | `cash` | `(dashboard)/cash`, `(dashboard)/reports` |
| Dashboard | `dashboard`, `analytics` | `(dashboard)/dashboard` |
| Billing / plans / deals | `plans`, `billing`, `agency` | admin console (agency-admin) |
| Agency super admin | `agency`, `analytics/view-as` | `apps/agency-admin` |
| Desktop licensing | `desktop` | `apps/desktop`, `apps/desktop-online` |
| Settings / cabinets | `settings`, `cabinet` | `(dashboard)/settings/*` |
| Reminders / mail | `reminders`, `mail`, `notifications` | mail goes via Mailpit / SMTP |

## Testing

- API/integration: Vitest + Supertest, `apps/server/test/*.e2e-spec.ts` against `deepkhata_test`.
- Unit: `npm test -w server`, `npm test -w desktop`.
- Browser: Playwright in `apps/e2e` against `deepkhata_e2e` (all selectors are `data-testid`).
- Load: k6 in `apps/bench` against staging only.
