# Per-file Check Hook — Plan Brief

> Full plan: `context/changes/per-file-check-hook/plan.md`

## What & Why

Roadmap slice S-03 / PRD FR-006: the developer gets lint and the related unit tests run automatically for a modified file, finishing within ~10 s, while integration tests stay on push/CI. Faster feedback at edit time — a slow hook gets disabled, so the budget is the main risk.

## Starting Point

No agent hooks exist (no `.claude/settings.json`, none in user settings). The only local gate is Husky → lint-staged (`eslint --fix` / `prettier`, no tests) at commit. Measured today: ESLint on one file 2.7–3.5 s, `vitest related <file> --run --project unit` ~0.6 s, whole unit suite ~0.75 s.

## Desired End State

Every agent `Write`/`Edit` lints the edited file (check-only) and runs its related unit tests; failures reach the agent via exit 2 + stderr. At end of turn a `Stop` sweep re-checks all changed files once (catching Bash-written edits). A committed proof test exercises every script and runs in CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Hook surface | Claude Code PostToolUse (`Write\|Edit`) + Stop sweep | Errors reach the agent immediately; the sweep covers files rewritten through Bash. |
| Human editor edits | Not covered (existing lint-staged + CI remain) | Keeps the change scoped; no Husky/lint-staged changes. |
| Related-test resolution | `vitest related <file> --run --project unit` | Follows the import graph, ~0.6 s; no match exits 0. |
| Lint mode | Check-only `eslint --quiet --no-warn-ignored`, no `--fix` | `--fix` rewrites the file behind the agent and breaks its next Edit. |
| Typecheck | Not in hooks; `astro check` stays in CI | Keeps the sweep fast. |
| Proof test | `tests/hooks/agent-hooks.test.ts` as Vitest project `hooks`, `npm run test:hooks`, in `npm test` and one CI `ci` step | Unit suite stays app-only; hooks proof still runs on every push. |
| Template | `10x-configure-hook` Claude Code reference (bash + `jq`) | Documented signal channel, worktree-safe path resolution, retry guard. |

## Scope

**In scope:** `.claude/settings.json`, `.claude/hooks/{lint-edited-file,related-tests,end-of-turn}.sh`, `hooks` Vitest project + proof test, `test:hooks` script, one CI step, docs (CLAUDE.md, TESTING.md, test-plan §3/§5/§6.1).

**Out of scope:** file watcher, pre-commit/lint-staged changes, typecheck in hooks, integration/e2e in hooks, `--fix`, other harnesses (Cursor/Codex/Copilot), new CI jobs, any `src/` changes.

## Architecture / Approach

`.claude/settings.json` registers two PostToolUse command hooks (lint 30 s, related tests 60 s timeouts) and one Stop hook (120 s), each resolved via `git rev-parse --show-toplevel`. Scripts read the JSON payload with `jq`, resolve the edited file's own checkout (worktree-safe), skip uncovered types/other repos, and use `npx --no-install` so a missing tool fails loudly. The Stop script sweeps `git diff HEAD` + untracked files across the session's registered checkouts, honours `stop_hook_active`, and exits early when nothing changed. The proof runs the real scripts in a temp git repo with stubbed `eslint`/`vitest` binaries.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Per-edit hook + proof harness | PostToolUse lint + related tests, `hooks` Vitest project with per-edit cases | Output on the wrong channel → agent never sees errors (proof asserts exit 2 + stderr) |
| 2. End-of-turn sweep | Stop hook over changed files, one-retry guard, sweep proof cases | Loops or blocks on a clean tree (guard case + baseline check) |
| 3. Wiring, budget check and docs | `test:hooks`, CI step, deliberate-break check, ≤ 10 s timing, docs | ESLint type-aware startup creeping past the budget |

**Prerequisites:** none (standalone slice); `jq` and git on the developer machine and CI runner.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- ESLint per-file time (2.7–3.5 s) is dominated by the type-aware program; as the codebase grows it may approach the budget — first lever is a lighter rule set for hook runs.
- Hooks only see agent tool edits; human editor edits remain covered by lint-staged at commit and by CI only.
- Settings changes need a session restart to load — manual verification depends on it.

## Success Criteria (Summary)

- Agent edits with a lint error or a broken related test are reported back to the agent and fixed in the same turn.
- Per-edit checks finish in ≤ 10 s; pure Q&A turns are unaffected.
- `npm run test:hooks` proves the scripts and runs in CI on every push.
