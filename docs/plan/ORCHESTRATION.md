# Orchestration: Opus decides, Sonnet builds, Haiku reads and checks

## Setup (once, at the repo root)

```bash
mkdir -p .claude/agents .claude/skills
# the sonnet implementer replaces the old senior-implementer
rm -f docs/plan/claude-setup/agents/senior-implementer.md .claude/agents/senior-implementer.md
cp docs/plan/claude-setup/agents/*.md .claude/agents/
rm -rf .claude/skills/run-phase && cp -r docs/plan/claude-setup/skills/run-phase .claude/skills/
```

Then restart Claude Code and start the main session on Opus: `claude --model opus`.
Commit `.claude/agents` and `.claude/skills/run-phase` so the whole team uses the same setup.

Do **not** set `CLAUDE_CODE_SUBAGENT_MODEL=haiku` globally any more. Each agent file pins its
own model, and built-in general-purpose agents should inherit Opus/Sonnet, not drop to Haiku.

## The agents

| Agent | Model | Job | Max turns |
| --- | --- | --- | --- |
| `scout` | haiku | Read-only code map, max 12 file reads | 25 |
| `verifier` | haiku | Runs lint/build/tests, returns 25 lines | 15 |
| `quick-implementer` | haiku | Mechanical edits only (testids, mirrored form fields, config) | 20 |
| `implementer` | sonnet | Default builder for anything with logic | 45 |
| `test-writer` | sonnet | E2E and API tests | 40 |
| Opus (main session) | opus | Routing, briefs, shared files, review, commits, hard calls | n/a |

## Why this split

- **Haiku is cheap per token, not per task.** On anything requiring judgment it guesses,
  fails acceptance and gets retried; each retry re-reads files, and a long Haiku context gets
  expensive fast. So Haiku only gets work where guessing is impossible: reading, running
  commands, copying a shown pattern.
- **Sonnet is the default writer.** It gets a precise brief, so it rarely needs to explore.
- **Opus never explores and never writes features.** It spends tokens on what it's best at:
  deciding, writing briefs with pasted facts, and reviewing risky diff hunks.
- **The handoff contract** (`run-phase` skill, section 4) is the core of the setup: pasted
  facts, fixed interfaces, ≤ 5 files to read, exact acceptance commands, explicit stop
  conditions. Most orchestration fails at this step.
- **Fresh brief beats resume** once a worker's context is large. Resuming a worker that has
  read 15 files pays for those 15 files again on every turn.

## Running

```
/run-phase 4 5
```

or use the full kickoff prompt in `docs/plan/runs/KICKOFF-4-5.md`.

Between runs: `/clear`. The runs file and STATUS.md carry everything forward.

## Cost guardrails

- Max 3 parallel writers per wave.
- Context budgets are written into every agent (scouts 12 reads, implementers 5 + 4).
- Keep root `CLAUDE.md` under ~120 lines; every worker except the verifier loads it.
- If a wave fails twice, stop and re-plan that part of the graph instead of grinding.
- Check spend with `/cost` after each wave for the first run, so you learn where tokens go.
