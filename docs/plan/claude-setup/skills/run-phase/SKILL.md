---
name: run-phase
description: Orchestrate one or more DeepKhata build phases from docs/plan with Opus as planner, reviewer and committer, Sonnet as the default builder and Haiku only for scouting, verification and mechanical edits. Use when asked to run, continue or resume phases.
---

# Run phases (orchestrator playbook)

You are the orchestrator, on Opus. You decide, split, brief, review and commit.
Workers write code. Your two jobs that matter most: **routing each task to the right model**
and **handing off so precisely that the worker never has to explore.** Weak handoffs are
where orchestration loses tokens: a vague brief makes a worker read 20 files, guess, fail
and retry.

Arguments: one or more phase numbers (`/run-phase 4 5`). If none, take the first unfinished
phase in `docs/plan/STATUS.md`. Multiple phases are planned as **one task graph** so shared
files are touched once.

## 0. State lives in files, not in your context

- Working file: `docs/plan/runs/phase-<n>[-<m>].md`. It holds the task table, wave status,
  worker results (the short return blocks only) and decisions. Update it after every wave.
- If your context gets long, you can re-orient by reading only this file and `git log --oneline -20`.
- Never paste worker transcripts or long logs into your reasoning; keep the return blocks.

## 1. Load

Read `docs/plan/README.md`, `docs/plan/STATUS.md`, the phase file(s), and the runs file if it
exists (resume from it). If STATUS lists a blocker that affects these phases, resolve it first
as Wave 0 or stop and ask the user.

## 2. Map with parallel scouts (haiku)

Launch 2-4 `scout` agents **in one message**. One per area (server module, schema, client
pages, tests/fixtures). Each gets a precise question and must return the FILES / KEY SYMBOLS /
PATTERNS / RISKS block. You do not explore yourself. Save their blocks into the runs file.

## 3. Plan the task graph (user approves once)

Table columns: `Id | Task | Agent | Model | OWNS | READ | Depends | Acceptance`.

Sizing:
- One task = one reviewable change, ideally under 300 changed lines and under 6 owned files.
- A worker should need **at most 5 files of reading**. If a task needs more, split it or paste
  the needed facts into the brief.

Shared files belong to you (the orchestrator) or to exactly one early task:
- `schema.prisma` + the migration: one task, first wave, covering every model change for all phases in this run.
- `app.module.ts`, `package.json`, `config/permissions.ts`, client sidebar/nav and command palette registry: **you** make these tiny edits yourself between waves.

### Model routing rubric (apply per task, write the reason in the table)

| Use | Agent | Model | When |
| --- | --- | --- | --- |
| Map code | `scout` | haiku | Always for reading/searching |
| Run checks | `verifier` | haiku | Always for lint/build/test output |
| Mechanical edit | `quick-implementer` | haiku | ALL true: copies an existing pattern shown in the brief, no business rule, no money/auth/tenant/query/migration logic, ≤ 3 files, ≤ 80 lines. Examples: add data-testids, add form fields mirroring existing ones, env examples, nav links |
| Real logic | `implementer` | sonnet | Default for everything else: services, endpoints, DTO validation, ledger postings, scheduler jobs, search queries, React pages with state, migrations |
| Tests | `test-writer` | sonnet | All specs. Haiku writes flaky or hollow tests |
| Hard/ambiguous | you (Opus) | opus | Design decisions, cross-cutting refactors where a wrong call cascades, reviewing money/auth/tenancy diffs, anything a sonnet worker failed twice |

When in doubt between haiku and sonnet, choose **sonnet**: a haiku hallucination costs a retry
plus your review time, which is more than the sonnet price difference.

Show the table. After the user says go, don't ask again unless something is destructive
(dropping data, force-push, touching production).

## 4. The handoff contract (most important section)

Every brief uses this exact shape. A brief is good when the worker could finish it without
opening any file not listed.

```
TASK <id>: <one-line outcome, stated as the end state>
WHY: <1-2 lines of business context so the worker makes sensible small calls>
OWNS: <exact paths the worker may edit or create>
READ: <max 5 paths, with line ranges for files over 300 lines>
FACTS: <what the scout found that this worker needs, pasted, not referenced:
        - existing function signatures it must call (with file:line)
        - the 10-30 line snippet of the exact spot to change, if the change is surgical
        - enum values, DTO shapes, route paths, permission names already in use
        - the pattern to copy: "follow apps/server/src/vendors/vendors.controller.ts:12-40">
INTERFACES: <exact new signatures/endpoints/DTO fields/testids this task must produce;
             other tasks will be built against them, so they are fixed>
DO:
1. <imperative, concrete step>
2. ...
DON'T: <the specific traps for this task>
ACCEPTANCE: <exact commands; each must be runnable as-is from repo root>
STOP IF: <conditions that mean report back instead of improvising, e.g. "the Vendor model
          has no payable concept", "you need to edit a file outside OWNS">
RETURN: the block format from your agent definition
```

Rules for writing briefs:
- Paste facts; don't say "look at X to understand Y".
- Fix the interfaces before launching parallel tasks that depend on each other, so they can
  run at the same time against agreed contracts.
- Give acceptance commands that test only this task (a single spec file or test name), not the
  whole suite.

## 5. Execute in waves

Per wave:
1. Launch up to **3 writers in one message** (scouts and verifiers don't count). No two writers
   own the same file.
2. Collect return blocks into the runs file.
3. Make your own shared-file edits (module registration, permissions, nav).
4. One `verifier`: `npm run lint -w <apps touched>`, `npm run build -w <apps touched>`, plus
   each task's acceptance commands.
5. Review: `git diff --stat`, then read only the risky hunks: tenancy, money, auth, migrations,
   deleted or loosened assertions. Reject `businessId` from request input on sight.
6. Failures:
   - Small fix and the worker's context is still small (it read ≤ 5 files): `SendMessage` the
     same worker with the verifier's exact error lines.
   - Worker context is large, or it went off-track: **don't resume**. Write a corrected,
     tighter brief and start a fresh worker. Resuming a bloated context is the most expensive
     move in this whole system.
   - Second failure on the same task: escalate one level (haiku → sonnet → you).
7. Commit each accepted task yourself:
   `git add <owned files> && git commit -m "<type>(p<n>): <task id> <summary>"`.
   Workers never commit.

## 6. Close

- `verifier`: lint and build for all apps, API tests, full E2E suite.
- Tick every acceptance criterion from the phase file(s) in the runs file; anything unmet is
  either fixed now or listed as deferred with a reason.
- Update `docs/plan/STATUS.md` (shipped, deferred, new bugs, open questions, phase-log row).
- Report to the user in under 12 lines: shipped, deferred, decisions they must make, commands
  they must run themselves (anything touching production).

## Token discipline checklist

- [ ] You never read a file over 150 lines in full; scouts and grep with ranges do it.
- [ ] Every worker brief has FACTS pasted and ≤ 5 READ files.
- [ ] Long outputs only through `verifier`.
- [ ] No resume of a worker that has read > 8 files; re-brief fresh instead.
- [ ] Runs file updated after every wave, so a `/clear` loses nothing.
