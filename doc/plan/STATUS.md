# Build Status

Last audited: 2026-10-11 (by reading the repo on branch `final-fixes`). The orchestrator updates this file at the end of every phase.

## Where the code is

- Active branch: `final-fixes`. It merged `phase-0-foundation` work and `claude/cloudflare-skills-integration-*`.
- Stale: worktree `.claude/worktrees/plan-mode-tasks-cd3f48` (branch `claude/plan-mode-tasks-cd3f48`) and branch `claude/haiku-orchestration-skill-6fa7da`. Remove the worktree after confirming nothing unmerged is needed: `git worktree remove .claude/worktrees/plan-mode-tasks-cd3f48`.
- Cloudflare skills are installed in `.claude/skills/` and `.agents/skills/` (16 skills, tracked by `skills-lock.json`).

## Product features that exist today

POS checkout with service/labour lines, memo (amanat), invoice page and print CSS, WhatsApp text receipts, galla (cash register, petty expenses, Z-report), customer khata and payments, vendors, restock hub, cabinets with rack/shelf/bin, multi-branch with cross-branch "available elsewhere" badge, global stock lookup modal, categories, reports tabs, team invites (email), RBAC (owner, manager, staff), subscription kill switch (read-only, suspended), agency admin app (tenants, status, billing log, add branch), PWA shell (Serwist), Dexie offline queue for order creation.

## Phase progress

### Phase 0: Foundation, partially done, BLOCKED

Done:
- [x] `docker-compose.dev.yml` (Postgres 17 + test DB init script, Mailpit, optional Redis profile)
- [x] Root npm workspaces and scripts (`dev`, `db:*`, `test:*`, `lint`, `build`)
- [x] `prisma/migrations/0000_baseline` and `prisma:migrate` script
- [x] `GET /health` and `GET /health/db`
- [x] `apps/e2e/fixtures/users.ts` (deterministic users and tenants)
- [x] `prisma/seed.ts` (two tenants, deterministic IDs)

Blocker (fix first):
- [ ] **Schema / migration / seed mismatch.** `schema.prisma` on `final-fixes` has no `ItemCondition` enum and no `condition` fields, and `OrderStatus` includes `COMPLETED` and `PENDING`. The baseline migration and `seed.ts` were generated from the older schema in the plan-mode worktree, which has `ItemCondition`, `ProductInstance.condition` and `InventoryMovement.fromCondition/toCondition`. Result: the seed will crash and `prisma migrate dev` will report drift. **Decision needed (see Open questions #1).** Then regenerate the baseline from the chosen schema and fix the seed to match.

Not done:
- [ ] Root `CLAUDE.md`
- [ ] `apps/e2e` is not a workspace yet: no `package.json`, no `playwright.config.ts`, no setup project, no helpers. `npm run test:e2e` currently fails.
- [ ] Seed `--large` mode for benchmarks
- [ ] Redis optional: `RedisService` still connects eagerly to `localhost:6379` and `deleteByPattern` still uses `KEYS`
- [ ] API test harness against `deepkhata_test`
- [ ] CI workflow (`.github/workflows/ci.yml`)
- [ ] `.env.example` files
- [ ] `apps/server/AGENTS.md` still describes Vercel serverless rules

### Phase 1: E2E and bug bash, not started

Known bugs still open (verified 2026-10-11):
- K1 hardcoded JWT fallback secret in `auth/strategies/jwt.strategy.ts`
- K2 unauthenticated `POST /onboard/onboarding` trusting `ownerId` from the body
- K3 `POST /team/invite` trusting `businessId` from the body
- K5 sync batch ignores `UPDATE_ORDER_STATUS` (items stuck in `syncing`)
- K4, K6 to K10 not yet audited

### Phases 2 to 10: not started

## Open questions

1. **Item condition tracking.** README and the client restock flow describe conditions (Original Pull, Minor Scratches, Dead Donor, Defective). The current schema has none. Was it removed on purpose, or lost in a merge? GM Traders sells used "latt" parts, so condition matters for price and for the Phase 5 stock finder. Default if unanswered: **restore `ItemCondition`** from the worktree schema via a proper migration.
2. Production domain name (needed for Phase 3 cookies and Caddy).
3. Hosting provider (see the hosting section in the Infra doc).

## Phase log

| Date | Phase | Result | Notes |
| --- | --- | --- | --- |
| 2026-10-11 | 0 | Partial | Audit by Claude; blocker on schema mismatch |
