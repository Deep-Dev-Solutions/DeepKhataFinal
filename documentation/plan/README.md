# DeepKhata Build Plan (for Claude Code)

This folder is the execution plan for Claude Code. Each phase file is self-contained:
goal, context, tasks, tests, and acceptance criteria. Work one phase at a time.

## How to run a phase

**Preferred:** run the main session on Opus and type `/run-phase <n>`. Opus plans and reviews; haiku subagents do the work. See `ORCHESTRATION.md`. Current progress and blockers live in `STATUS.md`.

**Manual alternative:**

1. Start a fresh Claude Code session (or `/clear`) at the repo root.
2. Prompt: `Read docs/plan/README.md and docs/plan/<phase-file>.md. Enter plan mode, inspect the code the phase touches, then propose the task breakdown before writing code.`
3. Approve the plan, let it execute task by task, one commit per task.
4. A phase is done only when its **Acceptance criteria** all pass and the full P0 E2E suite is green.
5. Update `docs/plan/STATUS.md` (create it in Phase 0) with what shipped, what was deferred, and any new bugs found.

## Phase order

| # | File | Outcome | Depends on |
| --- | --- | --- | --- |
| 0 | `00-foundation.md` | Local dev stack, Prisma migrations baseline, seed data, test harness, root CLAUDE.md | none |
| 1 | `01-e2e-and-bug-bash.md` | Full P0 E2E suite written, every failure triaged and fixed | 0 |
| 2 | `02-correctness-and-performance.md` | Money as Decimal, tenant guard, fast product queries, updatedAt everywhere | 1 |
| 3 | `03-vps-deployment.md` | Production on the Hostinger VPS with Docker, backups, CI deploy, smoke monitor | 2 |
| 4 | `04-dues-and-reminders.md` | Lena/Dena (receivables and payables) with due dates, reminders, notification centre and settings | 3 |
| 5 | `05-stock-finder.md` | Cross-branch stock finder for staff, part numbers and compatibility, reserve and transfer | 3 |
| 6 | `06-accounts-email-auth.md` | Better Auth, revocable sessions, email service, invites, staff username+PIN login, password reset | 3 |
| 7 | `07-trial-plans-billing.md` | Plans and limits, 30-day trial self-signup, agency alerts, lifecycle emails, invoices, payment confirmation | 6 |
| 8 | `08-agency-admin-analytics.md` | Tenant usage and sales analytics, plan-fit, audit log, read-only view-as | 7 |
| 9 | `09-client-cache-offline.md` | Dexie delta sync, TanStack Query, offline queue for all write types, conflict handling | 2 |
| 10 | `10-electron-desktop.md` | Windows desktop "Shop Server" edition with embedded Postgres and cloud sync | 0, 2, 9 |

Phases 4 and 5 are the two problems GM Traders actually hired us for (forgotten payments and
"is it in stock at the other branch"). Ship them before the SaaS plumbing.

Store-type modules (pharmacy, bakery) are **out of scope** for this plan on purpose. Do not add
`storeType` fields or batch/expiry logic unless a later plan file says so.

## Global rules (apply to every phase)

**Multi-tenancy**
- `businessId` always comes from the authenticated session (`req.user.businessId`). Never from the request body, query or a header.
- `branchId` from the `x-branch-id` header must be validated as belonging to that business (Phase 2 adds a guard; until then, validate in the service).
- Every new endpoint that takes an `:id` gets a cross-tenant isolation test (tenant A's user requests tenant B's record → 404).

**Money**
- After Phase 2, all money is `Decimal(14,2)` in Prisma and handled with `Prisma.Decimal` / `decimal.js` in code. No JS `number` arithmetic on money.
- Ledger postings must always balance (sum of postings per transaction = 0). Any new money flow writes a balanced `Transaction` + `Posting`s inside one `$transaction`.

**Database**
- After Phase 0, schema changes go through `prisma migrate dev --name <change>` only. `prisma db push` is banned.
- Every migration must be safe on existing production data (backfill steps written explicitly).

**Tests**
- Every feature ships with: API tests (Vitest + Supertest in `apps/server/test`) and at least one Playwright E2E spec in `apps/e2e`.
- Never weaken, skip or delete an assertion to make a test pass. If an assertion is wrong, explain why in the commit message.
- Use `data-testid` selectors in E2E. Add them to components as needed.

**Code**
- Read `node_modules/next/dist/docs/` before Next.js changes (see `apps/client/AGENTS.md`): this Next version has breaking changes.
- Keep NestJS modules per domain. DTOs with `class-validator` for every body. No `any` in new DTOs.
- User-facing copy: English with Roman Urdu shop terms where the app already uses them (udhar, galla, khata, lena, dena, maal).
- Remove leftover "BizFlow" branding wherever touched; product name is configurable via `APP_NAME` env (rename pending).

**Git**
- Branch per phase: `phase-<n>-<slug>`. Commit per task, conventional commits (`feat:`, `fix:`, `test:`, `chore:`).
- Never commit `.env*` files. Add new variables to `.env.example` files with placeholder values.

**When blocked**
- If a task needs a product decision not covered here, write the question into `docs/plan/STATUS.md` under "Open questions", pick the conservative option, and continue.

## Definition of done (every phase)

- [ ] Acceptance criteria in the phase file all pass
- [ ] `npm run lint` and `npm run build` pass in every app touched
- [ ] Server unit and API tests pass
- [ ] P0 E2E suite passes locally
- [ ] `.env.example` updated, `docs/plan/STATUS.md` updated
