# Kickoff prompt: Phases 4 + 5

Start Claude Code at the repo root with `claude --model opus`, then paste everything below the line.

---

You are the orchestrator for this run. Load the `run-phase` skill and follow it exactly. Run phases **4 and 5 together** as one task graph.

Inputs, in this order:
1. `docs/plan/README.md` (global rules)
2. `docs/plan/STATUS.md` (current state and the Phase 0 blocker)
3. `docs/plan/04-dues-and-reminders.md` and `docs/plan/05-stock-finder.md`
4. `docs/plan/runs/phase-4-5.md`: a **draft** task graph with verified facts and fixed design decisions. Treat the "Facts" and "Design decisions" sections as true unless a scout proves otherwise. Use the draft graph as your starting point instead of re-planning from zero.

Decisions from me:
- Item condition: **RESTORE** `ItemCondition` (ORIGINAL_PULL, COPY, MINOR_SCRATCHES, WORKING, DEAD_DONOR, DEFECTIVE) on ProductInstance and InventoryMovement. <!-- change to DROP if it was removed on purpose -->
- Wave 0 (unblock) is in scope for this run.
- Production is out of scope: no deploys, nothing against Supabase.

How I want you to work:
- Routing: Haiku only for `scout`, `verifier` and truly mechanical `quick-implementer` tasks. Anything with logic goes to the Sonnet `implementer`; all tests go to the Sonnet `test-writer`. If unsure, choose Sonnet. You handle design calls, shared files (app.module.ts, permissions.ts, Header/Sidebar registrations), reviews and commits yourself.
- Handoffs: every brief follows the contract in the skill: pasted FACTS with file:line, fixed INTERFACES, at most 5 READ files, exact ACCEPTANCE commands, STOP IF conditions. A worker should never need to explore.
- Parallelism: up to 3 writers per wave in one message; no two writers own the same file.
- Retries: resume a worker only if its context is small; otherwise write a tighter brief and start fresh. Two failures → escalate one model up.
- Keep your own context lean: scouts read, verifier runs commands, you read only `git diff --stat` and risky hunks (money, tenancy, auth, migrations, test assertions).
- Commit each accepted task yourself on branch `phase-4-5-dues-stockfinder` (create it from `final-fixes`).
- After every wave, update the wave log in `docs/plan/runs/phase-4-5.md`.

Start now: create the branch, launch the scouts in parallel to confirm the draft, then show me the final task table with a one-line routing reason per task. After I say go, run all waves to the end without asking again unless something is destructive. Finish by updating `docs/plan/STATUS.md` and giving me a report of under 12 lines: shipped, deferred, bugs found, decisions I need to make.
