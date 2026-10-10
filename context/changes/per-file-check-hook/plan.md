# Per-file Check Hook Implementation Plan

## Overview

Give the developer (and the coding agent) automatic per-file feedback: after every agent `Write`/`Edit`, the edited file is linted (check-only) and its related unit tests run, finishing well inside ~10 s; at the end of each agent turn a sweep re-checks every file changed in that turn. Integration and e2e tests stay on push/CI. Roadmap slice S-03, PRD FR-006, test-plan §3 Phase 4 ("Per-file feedback gate").

## Current State Analysis

- No agent hooks exist: there is no `.claude/settings.json` in the project and `~/.claude/settings.json` defines no `hooks`.
- The only local gate is Husky pre-commit → `npx lint-staged` (`.husky/pre-commit`), which runs `eslint --fix` on staged `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}` (`package.json` `lint-staged` block). No tests run before commit.
- Vitest 5 with two projects in `vitest.config.ts`: `unit` (`src/**/*.test.ts`) and `integration` (`tests/integration/**/*.test.ts`, local Supabase, serial).
- ESLint 10 flat config with type-checked rules (`eslint.config.js:16-40`, `projectService: true`); file groups cover `**/*.{js,jsx,ts,tsx}`, `**/*.astro` and `scripts/**/*.mjs`. Ignores come from `.gitignore` via `includeIgnoreFile`, which includes the `10x*` / `.10x*` patterns.
- CI `ci` job (`.github/workflows/ci.yml:19-24`): `npm ci` → `astro sync` → lint → `test:unit` → `astro check` → build.
- `jq` is installed (`/usr/bin/jq`); `.claude/settings.json` and `.claude/hooks/` are **not** gitignored (`git check-ignore` prints nothing).

Measured on this machine (2026-10-10):

| Check | Time |
| --- | --- |
| `npx eslint <one .ts file>` | 2.7–3.5 s |
| `npx eslint <one .astro file>` | ~2.6 s |
| `npx vitest related <file> --run --project unit` | ~0.6 s |
| `npm run test:unit` (91 tests) | ~0.75 s |

`vitest related <file> --run --project unit` exits **0** when no test depends on the file (verified with `src/pages/dashboard.ts`).

## Desired End State

- Editing any lintable file through the agent's `Write`/`Edit` tools runs `eslint` (no `--fix`) on that file and `vitest related <file> --run --project unit`; any failure is fed back to the agent via exit 2 + stderr naming the file and the problem. A clean edit produces no output.
- At the end of a turn, a `Stop` hook lints and runs related unit tests for every changed or untracked file in the checkout(s) this session touched — including files rewritten through Bash — and sends the agent back **once** if anything fails.
- A committed proof test (`tests/hooks/agent-hooks.test.ts`, Vitest project `hooks`) exercises every script against broken/clean/skipped/empty inputs; it runs via `npm run test:hooks`, as part of `npm test`, and in the CI `ci` job.
- Docs (CLAUDE.md commands, `TESTING.md`, test-plan §5/§6.1) describe the hooks and how to run the proof.

Verify by: `npm run test:hooks` green; a live session where the agent edits a file with a lint error and is told about it; per-edit hooks finishing under ~10 s.

### Key Discoveries:

- Claude Code only shows hook output to the agent on **exit 2 + stderr** (PostToolUse and Stop); exit 1 reaches nobody (`.claude/skills/10x-configure-hook/references/anthropic.md`, "Signal channel").
- `$CLAUDE_PROJECT_DIR` goes stale after `EnterWorktree`; scripts must resolve the checkout from the edited file / payload `cwd`, and the settings command finds scripts via `git rev-parse --show-toplevel` (same reference, "Paths, shell, Windows" and "Minimal example").
- `Stop` fires after every response, including pure Q&A → the sweep must exit early when nothing changed, and honour `stop_hook_active` to avoid loops.
- ESLint ignores `10x*` paths (from `.gitignore`), so an agent edit under `.claude/skills/10x-*` passes an ignored file explicitly — use `--no-warn-ignored` so that is a silent pass, not a warning.
- `eslint --fix` on the just-edited file causes the agent's next `Edit` to fail on stale content (reference "Gotchas") — check-only per the user decision.

## What We're NOT Doing

- No checks for edits made outside the agent (editor saves, manual git work) — no file watcher, no lint-staged/pre-commit changes. Human edits keep relying on the existing Husky lint-staged gate and CI.
- No typecheck (`astro check` / `tsc`) in any hook — stays in CI.
- No integration or e2e tests in hooks (PRD FR-006 resolution).
- No `eslint --fix` in hooks.
- No hooks for Cursor/Codex/Copilot — Claude Code only.
- No new CI job — one step added to the existing `ci` job.
- No changes to application code under `src/`.

## Implementation Approach

Follow the `10x-configure-hook` skill's Claude Code contract (its `references/anthropic.md` minimal example is the template), adapted to this repo: ESLint check-only on `.ts/.tsx/.js/.jsx/.mjs/.cjs/.astro`, `vitest related --run --project unit` for related tests, bash + `jq` scripts in `.claude/hooks/`, registered in a new committed `.claude/settings.json`. Each phase lands its scripts together with their proof cases in a dedicated Vitest `hooks` project, so the proof grows with the hooks.

## Critical Implementation Details

- **Signal contract**: every script prints failures to **stderr** and exits **2**; exit 0 only for "checked and clean" or "nothing to check" (no path, uncovered extension, missing file, other repository, no changes). A missing `jq`, or ESLint/Vitest not installed (`npx --no-install …` failing to resolve), is exit 2 with a message — never a silent pass.
- **Plain output**: scripts export `NO_COLOR=1 FORCE_COLOR=0`; hook output is read by a model.
- **Proof isolation**: proof cases run the real scripts inside a throwaway git repo under the OS temp dir, never against the developer's tree. Stub `eslint`/`vitest` as executables on the temp repo's `node_modules/.bin` (e.g. eslint stub fails when the file contains a marker) so the proof is fast and deterministic; keep git, `jq` and the scripts real. Scripts therefore must invoke the tools through the checkout's local binaries (`npx --no-install`, which resolves `node_modules/.bin`) so stubs are picked up.

## Phase 1: Per-edit hook + proof harness

### Overview

Register `PostToolUse` hooks on `Write|Edit` that lint the edited file and run its related unit tests, and stand up the `hooks` Vitest project with the per-edit proof cases.

### Changes Required:

#### 1. Hook registration

**File**: `.claude/settings.json` (new)

**Intent**: Commit project-level hook config so every Claude Code session in this repo loads the per-edit checks.

**Contract**: `hooks.PostToolUse[0]` with `matcher: "Write|Edit"` and two `command` hooks — `lint-edited-file.sh` (timeout 30) and `related-tests.sh` (timeout 60), each invoked as `"$(git rev-parse --show-toplevel 2>/dev/null || echo "$CLAUDE_PROJECT_DIR")"/.claude/hooks/<script>`. Timeouts in seconds. No other settings keys.

#### 2. Lint the edited file

**File**: `.claude/hooks/lint-edited-file.sh` (new, executable)

**Intent**: Lint only the file the agent just edited, check-only, and feed errors back to the agent.

**Contract**: reads the PostToolUse JSON from stdin; path from `.tool_input.file_path` (fallback `.tool_input.notebook_path`), relative paths resolved against payload `.cwd`. Exit 0 when: path empty/unparseable payload, extension not in `ts|tsx|js|jsx|mjs|cjs|astro`, file missing, or the file's git common dir differs from the session's (`cwd`) repository. Otherwise `cd` to the file's checkout root, register that root in `${TMPDIR:-/tmp}/claude-hooks/<session_id>.roots` (session id sanitized to `[A-Za-z0-9_-]`), and run `npx --no-install eslint --quiet --no-warn-ignored <file>`; on non-zero → `ESLint reported errors in <file>:` + output on stderr, exit 2. Missing `jq` → exit 2 with message.

#### 3. Related unit tests for the edited file

**File**: `.claude/hooks/related-tests.sh` (new, executable)

**Intent**: Run the unit tests that depend on the edited file (Vitest import graph) and feed failures back.

**Contract**: same payload parsing, path resolution, repository guard and "nothing to check" exits as the lint script; covered extensions `ts|tsx|js|jsx|mjs|cjs` (`.astro` excluded — the unit project has no `.astro` tests). Runs `npx --no-install vitest related <file> --run --project unit`; on non-zero → `Related unit tests failed for <file>:` + output on stderr, exit 2. No-match (exit 0 from Vitest) is a pass.

#### 4. `hooks` Vitest project

**File**: `vitest.config.ts`

**Intent**: Add a third project so the hook proof runs separately from the app unit suite.

**Contract**: new project `{ extends: true, test: { name: "hooks", include: ["tests/hooks/**/*.test.ts"] } }`. `unit` and `integration` unchanged.

#### 5. Per-edit proof cases

**File**: `tests/hooks/agent-hooks.test.ts` (new)

**Intent**: Prove the per-edit scripts' exit codes and output channels against a throwaway git repo with stubbed `eslint`/`vitest` binaries.

**Contract**: helper that creates a temp git repo — `git init` plus a baseline commit made with `-c user.name=hooks-proof -c user.email=proof@example.invalid -c commit.gpgsign=false` (CI runners have no git identity; `git diff HEAD` needs a commit) — (with a fake `node_modules/.bin/eslint` and `node_modules/.bin/vitest` that fail when the target file contains a marker string, and an `eslint` stub variant that is absent for the missing-tool case), pipes a payload into the real script from the repo's `.claude/hooks/`, and returns `{ code, stdout, stderr }`. Cases for **each** per-edit script:
- broken file → exit 2, stderr names the file;
- clean file → exit 0, empty stderr;
- uncovered type (`README.md`) → exit 0;
- nonexistent path → exit 0;
- payload `{}` and `not json` → exit 0;
- relative path resolved against `cwd` → checked;
- file in a different git repository → exit 0 (skipped);
- tool not installed (no stub on `node_modules/.bin`) → exit 2.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project hooks` passes with all per-edit cases
- `npm run lint` passes (including the new test file)
- `npm run test:unit` still passes unchanged
- `git check-ignore .claude/settings.json .claude/hooks/lint-edited-file.sh .claude/hooks/related-tests.sh` prints nothing

#### Manual Verification:

- After restarting the Claude Code session, `/hooks` lists both PostToolUse hooks from `.claude/settings.json`
- Asking the agent to add an unused variable to a `src/lib/*.ts` file makes it receive the ESLint error and fix it in the same turn
- Asking the agent to break an assertion-relevant line in `src/lib/relation-notice.ts` makes it receive the failing related test

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: End-of-turn sweep

### Overview

Add a `Stop` hook that re-checks every file changed in the turn (covering Bash-written files the per-edit hook never sees), with a one-retry guard, and extend the proof.

### Changes Required:

#### 1. Stop hook registration

**File**: `.claude/settings.json`

**Intent**: Register the end-of-turn sweep alongside the existing PostToolUse entry.

**Contract**: `hooks.Stop[0].hooks[0]` — `command` hook running `.claude/hooks/end-of-turn.sh` via the same `git rev-parse` resolution, timeout 120. PostToolUse entry unchanged.

#### 2. End-of-turn sweep

**File**: `.claude/hooks/end-of-turn.sh` (new, executable)

**Intent**: Before the agent finishes, lint and run related unit tests for all files changed this turn, sending it back once on failure.

**Contract**:
- Exit 0 immediately when `.stop_hook_active == true` (also honour `.loop_count > 0`).
- Checkouts to sweep: the payload `.cwd`'s checkout plus every root registered in `${TMPDIR:-/tmp}/claude-hooks/<session_id>.roots` (deduplicated, skipping roots that no longer exist).
- Per checkout: changed files = `git diff --name-only HEAD` ∪ `git ls-files --others --exclude-standard`, filtered to existing files. None anywhere → exit 0 without running any tool.
- Unchanged since the last green sweep → skip. This is uncommitted work, not "this turn", so without the skip every turn of a multi-turn job (Q&A included) re-lints the same dirty files. Fingerprint per checkout = `sha1sum` of `git diff HEAD` + the untracked lintable paths with their mtimes, stored in `${TMPDIR:-/tmp}/claude-hooks/<session_id>.<root-hash>.fp`. If every checkout's fingerprint equals the stored one → exit 0 without running any tool. Write fingerprints only after a green sweep, so a red result is re-checked next turn.
- Lint the subset with lint extensions (`ts|tsx|js|jsx|mjs|cjs|astro`) in **one** `npx --no-install eslint --quiet --no-warn-ignored <files…>` call; run `npx --no-install vitest related <test-ext files…> --run --project unit` in one call.
- Collect all failures into one stderr message (header per check, naming the checkout) → exit 2; otherwise exit 0.
- On green: truncate the session's `.roots` file, so a sibling checkout touched once isn't swept on every later turn, and write the fingerprints.
- No typecheck. Same `jq` / missing-tool rules as Phase 1.

#### 3. Sweep proof cases

**File**: `tests/hooks/agent-hooks.test.ts`

**Intent**: Prove the sweep's guard, early exit and Bash-edit coverage.

**Contract**: added cases:
- file with a lint marker written directly to disk (no per-edit payload) → Stop exits 2 and names it;
- a **modified tracked** file (committed in the baseline) with a lint marker → exit 2;
- second Stop on the same dirty-but-green tree → exit 0 and neither stub invoked (fingerprint skip); after the file changes again → tools run;
- green Stop → the session's `.roots` file is empty afterwards;
- failing related-test marker → exit 2;
- clean changed file → exit 0;
- no changed files → exit 0 and neither stub invoked (stubs record invocations to a file);
- `stop_hook_active: true` with a broken file present → exit 0;
- broken file in a second checkout registered via the `.roots` file → swept, exit 2;
- `$CLAUDE_PROJECT_DIR` pointing at another checkout that holds an error, session `cwd` clean → exit 0.

#### 4. Baseline check

**File**: none (verification step)

**Intent**: Ensure the Stop hook does not block on the untouched tree.

**Contract**: on a clean working tree of the real repo, `echo '{"cwd":"<repo>","session_id":"baseline"}' | .claude/hooks/end-of-turn.sh` exits 0.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project hooks` passes with per-edit and sweep cases
- Stop script exits 0 on the clean real-repo baseline payload
- `npm run lint` passes

#### Manual Verification:

- After restarting the session, `/hooks` lists the Stop hook
- Asking the agent to rewrite a `.ts` file via a Bash heredoc with an unused variable makes the Stop hook send it back once; it fixes the file and the turn ends
- A pure Q&A turn (clean tree, or a dirty tree unchanged since the last green sweep) ends with no visible hook delay or output

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wiring, budget check and docs

### Overview

Make the proof part of the regular test commands and CI, confirm the ~10 s budget and the proof's sensitivity, and document the hooks.

### Changes Required:

#### 1. npm scripts

**File**: `package.json`

**Intent**: Give the proof a named command; `npm test` keeps running every Vitest project.

**Contract**: add `"test:hooks": "vitest run --project hooks"`. `test` (`vitest run`) already runs all projects — leave it. `test:unit` stays `--project unit` only.

#### 2. CI step

**File**: `.github/workflows/ci.yml`

**Intent**: Run the hook proof on every push/PR without a new job.

**Contract**: in the `ci` job, a `- run: npm run test:hooks` step directly after `npm run test:unit`. No other job changes.

#### 3. Docs

**File**: `CLAUDE.md`, `TESTING.md`, `context/foundation/test-plan.md`

**Intent**: Record what the hooks do, how to verify them, and update the test plan's gate status.

**Contract**:
- `CLAUDE.md` `## Commands`: add `npm run test:hooks` and a short "Agent hooks" note (per-edit lint + related unit tests, Stop sweep, files in `.claude/hooks/`, restart session after editing settings, `/hooks` to inspect); mention it in the `## CI` `ci` bullet.
- `TESTING.md`: a section for the hook proof (`npm run test:hooks`, what it stubs, needs `jq` + git).
- `test-plan.md` §5 per-file hook row → wired by §3 Phase 4; §3 Phase 4 row status/change folder; §6.1 pattern note: related tests are resolved by Vitest's import graph (`vitest related`), so a new unit test is picked up for a file as long as it imports it.

#### 4. Deliberate-break and budget check

**File**: none (verification step)

**Intent**: Prove the proof catches regressions and the per-edit hooks fit the budget.

**Contract**: temporarily remove the `stop_hook_active` guard from `end-of-turn.sh` → `npm run test:hooks` goes red on the guard case → restore. Time both per-edit scripts on a real `src/lib/*.ts` file with a realistic payload: combined wall time ≤ 10 s.

### Success Criteria:

#### Automated Verification:

- `npm run test:hooks` passes
- `npm test` includes the `hooks` project (output lists it) and passes for unit + hooks (integration requires local Supabase)
- `npm run lint` passes
- Removing the `stop_hook_active` guard turns `npm run test:hooks` red; restoring turns it green
- Per-edit lint + related-tests on a real `src/lib/*.ts` file complete in ≤ 10 s combined
- `git status` shows only the intended files changed

#### Manual Verification:

- The CI `ci` job on the pushed branch shows the `npm run test:hooks` step passing
- CLAUDE.md, TESTING.md and test-plan updates read correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `tests/hooks/agent-hooks.test.ts` (Vitest `hooks` project) is the proof: real scripts, real git and `jq`, stubbed `eslint`/`vitest` in a temp repo. Cases enumerated in Phase 1 §5 and Phase 2 §3.

### Integration Tests:

- None — the hooks run no integration tests and touch no Supabase state.

### Manual Testing Steps:

1. Restart the Claude Code session; run `/hooks` and confirm PostToolUse (×2) and Stop come from `.claude/settings.json`.
2. Ask the agent to introduce an unused variable in a `src/lib/` file via Edit → it gets the ESLint error and fixes it.
3. Ask it to break `src/lib/relation-notice.ts` behaviour → it gets the failing related test.
4. Ask it to rewrite a file through a Bash heredoc with a lint error → the Stop hook sends it back once.
5. Ask a pure question → no hook output, no delay.

## Performance Considerations

Per-edit budget ~10 s (roadmap S-03 risk: a slow hook gets disabled). Measured: ESLint 2.7–3.5 s per file (type-aware rules dominate), related tests ~0.6 s; the two PostToolUse hooks run in parallel. The Stop sweep lints all changed files in one ESLint process (amortizing the type-program startup) and is capped at a 120 s timeout. If lint time grows past budget later, the first lever is dropping type-aware rules for the hook run, not removing the hook.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd-v2.md:137` (FR-006)
- Test plan: `context/foundation/test-plan.md` §3 Phase 4, §5
- Hook contract and minimal example: `.claude/skills/10x-configure-hook/SKILL.md`, `.claude/skills/10x-configure-hook/references/anthropic.md`
- Vitest projects: `vitest.config.ts`
- ESLint file groups and ignores: `eslint.config.js:16-80`
- CI: `.github/workflows/ci.yml:19-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Per-edit hook + proof harness

#### Automated

- [x] 1.1 `npx vitest run --project hooks` passes with all per-edit cases — afc2a1c
- [x] 1.2 `npm run lint` passes (including the new test file) — afc2a1c
- [x] 1.3 `npm run test:unit` still passes unchanged — afc2a1c
- [x] 1.4 `git check-ignore .claude/settings.json .claude/hooks/lint-edited-file.sh .claude/hooks/related-tests.sh` prints nothing — afc2a1c

#### Manual

- [x] 1.5 After restarting the Claude Code session, `/hooks` lists both PostToolUse hooks from `.claude/settings.json` — afc2a1c
- [x] 1.6 Asking the agent to add an unused variable to a `src/lib/*.ts` file makes it receive the ESLint error and fix it in the same turn — afc2a1c
- [x] 1.7 Asking the agent to break an assertion-relevant line in `src/lib/relation-notice.ts` makes it receive the failing related test — afc2a1c

### Phase 2: End-of-turn sweep

#### Automated

- [x] 2.1 `npx vitest run --project hooks` passes with per-edit and sweep cases
- [x] 2.2 Stop script exits 0 on the clean real-repo baseline payload
- [x] 2.3 `npm run lint` passes

#### Manual

- [x] 2.4 After restarting the session, `/hooks` lists the Stop hook
- [x] 2.5 Asking the agent to rewrite a `.ts` file via a Bash heredoc with an unused variable makes the Stop hook send it back once; it fixes the file and the turn ends
- [x] 2.6 A pure Q&A turn (clean tree, or a dirty tree unchanged since the last green sweep) ends with no visible hook delay or output

### Phase 3: Wiring, budget check and docs

#### Automated

- [ ] 3.1 `npm run test:hooks` passes
- [ ] 3.2 `npm test` includes the `hooks` project (output lists it) and passes for unit + hooks (integration requires local Supabase)
- [ ] 3.3 `npm run lint` passes
- [ ] 3.4 Removing the `stop_hook_active` guard turns `npm run test:hooks` red; restoring turns it green
- [ ] 3.5 Per-edit lint + related-tests on a real `src/lib/*.ts` file complete in ≤ 10 s combined
- [ ] 3.6 `git status` shows only the intended files changed

#### Manual

- [ ] 3.7 The CI `ci` job on the pushed branch shows the `npm run test:hooks` step passing
- [ ] 3.8 CLAUDE.md, TESTING.md and test-plan updates read correctly
