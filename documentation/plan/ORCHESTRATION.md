# Orchestration: Opus plans, Haiku builds

## Setup (once)

1. Install the agent and skill files from `docs/plan/claude-setup/` into `.claude/` (run at the repo root):
   ```bash
   mkdir -p .claude/agents .claude/skills
   cp docs/plan/claude-setup/agents/*.md .claude/agents/
   cp -r docs/plan/claude-setup/skills/run-phase .claude/skills/
   ```
   That gives you:
   - `.claude/agents/scout.md`, `implementer.md`, `test-writer.md`, `verifier.md` (all haiku)
   - `.claude/agents/senior-implementer.md` (sonnet, escalation only)
   - `.claude/skills/run-phase/SKILL.md` (the orchestrator playbook)
   Commit `.claude/agents` and `.claude/skills/run-phase` so the whole team gets them.
2. Restart Claude Code once so it picks up the new agents directory.
3. Start the main session on Opus: `claude --model opus` (or `/model opus` inside a session).
4. Optional: if you want every unnamed subagent (including built-in general-purpose) to default to Haiku, add to `.claude/settings.local.json`:
   ```json
   { "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "haiku" } }
   ```
   Agents with a `model:` in their frontmatter keep their own model.
5. Fix the Phase 0 blocker first (see `STATUS.md`). Orchestrating on top of a broken seed wastes every worker's tokens.

## Running

```
/run-phase 0
```

The orchestrator: reads the phase → sends parallel scouts → writes a task table in `docs/plan/runs/phase-0.md` → you approve → it runs waves of haiku workers (max 3 writers at once) → a haiku verifier runs builds and tests → Opus reviews the diff and commits per task → updates STATUS.md.

Between phases: `/clear`, then `/run-phase <next>`.

## Why this beats the relay script

- **Workers are real subagents in the same session.** Each has its own context window, but they don't pay for a fresh CLI process each time, and several run in parallel when the orchestrator sends them in one message.
- **Scouts do the reading, not Opus.** Opus tokens cost the most, so Opus reads summaries and diffs only.
- **Verifier keeps logs out of context.** Test and build output is the biggest silent token sink; a haiku verifier returns 25 lines.
- **Precise briefs.** Haiku is fast and cheap but weak at inferring intent. The brief template hands it file paths, interfaces and an acceptance command, so it doesn't explore or guess.
- **Escalation, not stubbornness.** Two haiku failures → sonnet → Opus. Some tasks (auth migration in Phase 6, Decimal migration in Phase 2, sync engine in Phase 9) go straight to sonnet; they're too cross-cutting for haiku.
- **Resume instead of restart.** Retries go to the same worker via SendMessage, so it keeps what it learned.

## Expected model mix per phase

| Phase | Mostly haiku | Sonnet | Opus does itself |
| --- | --- | --- | --- |
| 0 Foundation | e2e harness, scripts, CI, env examples | schema/migration/seed repair | decide on item condition |
| 1 E2E + bug bash | writing specs, simple fixes, testids | tenancy fixes across controllers | triage, severity, review |
| 2 Correctness | indexes, small refactors | Decimal migration, TenantContext guard | review money diffs line by line |
| 3 Deployment | Dockerfiles, compose, Caddyfile, docs | CI deploy with rollback | security review of bootstrap script |
| 4 Dues | UI pages, DTOs, notification settings UI | ledger postings for KhataEntry, scheduler | rule design review |
| 5 Stock finder | UI, product form fields | search query and indexes | permissions review (no cost to staff) |
| 6 Auth | email templates, team UI | Better Auth migration | session and cookie review |
| 7 Billing | invoice UI, plan meters | Subscription migration, limits service | pricing logic review |
| 8 Analytics | admin pages, charts | nightly aggregation job | transparency and audit log review |
| 9 Offline | Dexie tables, status UI | sync engine and conflicts | conflict-rule review |
| 10 Electron | packaging config, tray UI | process orchestration, licence | release checklist |

## Cost guardrails

- Max 3 parallel writers. More causes file conflicts and rate-limit stalls, and doesn't finish faster.
- `maxTurns` caps on every agent (scout 25, implementer 40, verifier 15, senior 60).
- Keep root `CLAUDE.md` under ~120 lines: every subagent loads it (the verifier skips it).
- If a phase burns tokens without progress, stop, `/clear`, and re-run with a smaller task graph.
