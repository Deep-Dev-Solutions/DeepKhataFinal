# Run log: finish-week (7-day plan)

Branch: `finish-week` (from `final-fixes` @ 6578aae). Owner work per day; report after each day.

## Day 1 — Cleanup and map (2026-10-24)

| Task | State | Commit |
| --- | --- | --- |
| Remove Vercel leftovers | done | 6ade969 |
| Remove legacy one-off test scripts (`test-phase4/rbac/masked-ip-lockout.ts`) | done | 6ade969 |
| jwt-auth.guard stub | n/a — no JWT guard exists (`auth/guards` has only session/permissions/roles + desktop device guard) |
| Prune merged worktrees | done — all 4 under `.claude/worktrees` were merged/prunable; removed |
| Root `docker-compose.yml` profile `full` + `stack:up/down/logs` | done | 6ade969 |
| `ARCHITECTURE.md` (≤2 pages) | done | (this commit) |
| Lint | pass — warnings only (pre-existing) |
| Build | pass — fixes: stale Prisma client (regenerated, fixed C010 trial-claim TS2339), missing `@typescript/typescript-linux-x64` in agency-admin's `node_modules` (local install artifact; `npm i -w agency-admin --force`) |
| Unit (server 103, desktop 40) | pass |
| API/integration (28 files, 442 tests) | pass |
| E2E full (Playwright) | in flight — first run: 167 pass / 7 fail all caused by missing `E2E_WITH_ADMIN=1` (admin server never started, `ERR_CONNECTION_REFUSED :3001`); failed set re-ran green with the flag (25 passed) |

Decisions:
- `apps/server/.env` pointed `DATABASE_URL`/`DIRECT_URL` at **Supabase production** — switched to local dev Postgres `:5433` (Supabase lines kept commented). Nothing was run against production.
- Full-profile compose defaults: Postgres host port **5434**, Mailpit **1027/8027** (project `deepkhata-full`) so it never collides with the dev compose; `STACK_*_PORT` envs override.
- Local machine note: 5432 is occupied by a system Postgres, so dev compose ran with `POSTGRES_PORT=5433` and `.env` matches.

## Day 2 — Custom deals
not started
