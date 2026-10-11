---
name: run-phase
description: Orchestrate one DeepKhata build phase from docs/plan with Opus as planner and reviewer and haiku subagents as workers. Use when asked to run, continue or resume a phase.
---

# Run a phase (orchestrator playbook)

You are the orchestrator, running on Opus. You plan, split, brief, review and commit.
Workers (subagents in `.claude/agents/`) read and write code. Keep your own context small:
you should rarely open a file longer than 150 lines yourself.

Argument: the phase number (e.g. `/run-phase 1`). If missing, read `docs/plan/STATUS.md` and take the first unfinished phase.

## 1. Load (keep it short)

- Read `docs/plan/README.md` (global rules), `docs/plan/STATUS.md`, and the phase file.
- If STATUS lists a blocker or open question for this phase, stop and ask the user before planning.

## 2. Map (parallel scouts)

Launch 2 to 4 `scout` subagents **in the same message** so they run in parallel, one per area
the phase touches (e.g. server module, client pages, schema, tests). Each brief asks a precise
question: "Which files implement X, what pattern do they use, what's missing for Y?"
Do not explore yourself.

## 3. Plan (written task graph, user approves)

Write `docs/plan/runs/phase-<n>.md` with a table of tasks:

| Id | Task | Worker | OWNS (files) | Depends on | Acceptance command |

Rules for the graph:
- One task = one reviewable change, ideally under 300 changed lines.
- Two tasks in the same wave must not own the same file. Shared files (schema.prisma, app.module.ts, package.json, migrations) belong to one task only, scheduled in an early wave.
- Worker choice: `implementer` (haiku) for well-specified tasks; `test-writer` (haiku) for specs; `senior-implementer` (sonnet) for migrations with backfills, auth, sync engine, money refactors, or anything touching more than ~6 files.
- Every task has a runnable acceptance command (a specific test file, `npm run build -w server`, a curl against the dev server).

Show the user the table and wait for approval. If they say "go", don't ask again until the phase ends unless something is destructive.

## 4. Execute in waves

For each wave:
1. Send every task in the wave to its worker **in one message** (max 3 parallel writers; scouts and verifiers don't count). Use the brief template below.
2. When workers return, run a `verifier` with: `npm run lint`, the relevant `npm run build -w <app>`, and the wave's acceptance commands.
3. Review: run `git diff --stat`, then read only risky hunks (tenant scoping, money, auth, migrations, deleted tests). Reject anything that weakens an assertion or takes businessId from the request.
4. On failure: resume the same worker with `SendMessage` (it keeps its context) and paste the verifier's failure lines. Max 2 retries, then hand the task to `senior-implementer`, then do it yourself.
5. Commit each accepted task yourself (workers never commit): `git add <owned files> && git commit -m "<type>(phase-<n>): <task id> <summary>"`.

## 5. Close the phase

- `verifier`: full lint, build of all apps, API tests, full P0 E2E suite.
- Check every acceptance criterion in the phase file; tick it in `docs/plan/runs/phase-<n>.md`.
- Update `docs/plan/STATUS.md`: what shipped, what was deferred, new bugs, new open questions, and a row in the phase log.
- Tell the user in under 10 lines: shipped, deferred, anything they must decide or run themselves (e.g. production commands).

## Brief template (send exactly this shape)

```
TASK <id>: <one-line goal>
CONTEXT: <2-5 lines: why, and the relevant facts from the scout map, with file:line refs>
OWNS: <files this worker may edit or create>
READ: <files to read first, max 5>
DO:
1. <concrete step>
2. <concrete step>
INTERFACES: <exact function signatures, DTO shapes, endpoint paths, enum values to use>
DON'T: <specific traps: e.g. "don't change the Order DTO", "don't touch client/src/lib/sync.ts">
ACCEPTANCE: <command(s) that must pass>
RETURN: the format in your agent definition
```

A brief that makes the worker search for context is a bad brief: the scout already found it,
so paste the facts in. Haiku does well with precise briefs and badly with vague ones.

## Token discipline

- Never paste whole files into briefs; give paths and line ranges.
- Never ask workers to return code; read `git diff` for the parts you need.
- Long command output always goes through `verifier`.
- Between phases, the user should `/clear`; STATUS.md and the runs file are the memory.
