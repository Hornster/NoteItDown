<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Per-file Check Hook

- **Plan**: context/changes/per-file-check-hook/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated re-run on 2026-10-10: `npm run test:hooks` 31/31 passed; `npm run lint` clean; `npm run test:unit` 91/91 passed; `git check-ignore` printed nothing; the Stop baseline on the clean tree exited 0; per-edit lint took 2.8 s and related-tests 0.7 s on `src/lib/relation-notice.ts`, both under the 10 s budget. Every planned contract item was verified as MATCH apart from F4.

## Findings

### F1 — Stop sweep with a very large file list exits 2 with an empty report

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.sh:96, .claude/hooks/end-of-turn.sh:101
- **Detail**: Every changed or untracked lintable file goes into a single `npx` argv with no cap. In an empirical test with about 6000 untracked, non-ignored files, both calls failed with "Argument list too long". The hook printed only the headers, with no body, and exited 2. The agent was sent back with nothing it could act on. The `stop_hook_active` guard limits this to one wasted retry. A realistic trigger is an output directory that isn't gitignored.
- **Fix A ⭐ Recommended**: Skip the sweep when there are more than N lintable files (for example 200). Print a stderr note and exit 0, leaving whole-tree lint to CI.
  - Strength: Keeps the sweep fast and within the 120 s timeout. Type-aware ESLint over thousands of files would time out anyway, which counts as a silent non-blocking pass.
  - Tradeoff: Unusually large dirty trees get no end-of-turn check.
  - Confidence: HIGH — this is a simple guard with no change to the normal path.
  - Blind spot: An exit-0 note may never be seen by the agent, so add it to the proof as well.
- **Fix B**: Batch the files through `xargs -0 -n 200`, and treat empty tool output on a non-zero exit as a hook error.
  - Strength: Every file still gets checked.
  - Tradeoff: Many ESLint processes, each re-paying the 2–3 s startup for the type program, will likely blow the 120 s timeout.
  - Confidence: MED — the throughput cost hasn't been measured.
  - Blind spot: How the timeout interacts with the result.
- **Decision**: FIXED (Fix A — cap via HOOK_SWEEP_MAX_FILES, default 200; proof case added)

### F2 — Stop sweep silently passes staged files in a repo without HEAD

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.sh:53, .claude/hooks/end-of-turn.sh:68
- **Detail**: `git diff --name-only HEAD` fails with its stderr hidden when there is no commit. A `git add`ed file in a fresh repo is then neither in the diff nor untracked, so the sweep exits 0 without running ESLint (empirically verified). This repo always has a HEAD, so the practical risk is low.
- **Fix**: When `git rev-parse --verify -q HEAD` fails, diff against the empty-tree hash (`git hash-object -t tree /dev/null`) in both places.
- **Decision**: FIXED (empty-tree fallback for unborn HEAD; proof case added)

### F3 — Unplanned prompt template committed with the change

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/prompts/m3l2-ad-hoc-testing.md
- **Detail**: A 20-line Polish prompt template for writing unit tests, with `@PLIK`/`@TECH_STACK`/`@PRD` placeholders, landed in commit 7521a71. It has nothing to do with hooks, nothing references it, and it has no runtime effect. It looks like a course artifact swept into the commit.
- **Fix**: Keep it, and note it as an unrelated course artifact in the plan's Progress or the commit history. Or move it out in a separate commit.
- **Decision**: FIXED (kept; recorded as an unrelated M3L2 course prompt template that rode along in 7521a71 — out of scope for this change, no code impact)

### F4 — Proof case "failing related-test marker" doesn't assert the exit code or isolate vitest

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/hooks/agent-hooks.test.ts:271
- **Detail**: The plan requires "failing related-test marker → exit 2". The test asserts only the stderr text. The ESLint stub fails on the same marker, so the case can't tell whether a vitest-only failure would still exit 2. More generally, the proof doesn't cover a missing `jq`, `loop_count > 0`, or session-id sanitization: the guards could be removed and the proof would stay green.
- **Fix**: Add `expect(res.code).toBe(2)`. Give the vitest stub its own marker, or use an ESLint-clean file, so the failure comes only from vitest.
- **Decision**: FIXED (exit-code assertion + vitest-only TEST_MARKER)

### F5 — Untracked-file fingerprint uses size plus whole-second mtime

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.sh:70
- **Detail**: Rewriting an untracked file within the same second with the same size is fingerprinted as unchanged. The next sweep is skipped, which is a silent pass; this was reproduced with `touch -d`. In real use it is rare.
- **Fix**: Use `git hash-object` on each untracked lintable file instead of `stat`, so untracked files are compared by content just as tracked files already are through `git diff HEAD`.
- **Decision**: FIXED (content hash via git hash-object --stdin-paths; same-size/same-mtime proof case added)

### F6 — Sweep passes repo-relative paths without `--`, and newline-separated lists

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.sh:79, .claude/hooks/end-of-turn.sh:92, .claude/hooks/end-of-turn.sh:96
- **Detail**: A file named `-x.ts` reaches ESLint and vitest as an option, which causes a false exit 2. A filename containing a newline is split by the `printf '%s\n'` / `mapfile` round-trip. The per-edit hooks use absolute paths and aren't affected. Neither kind of name is plausible in this repo.
- **Fix**: Prefix each sweep path with `./`.
- **Decision**: FIXED (sweep paths prefixed with ./ — covers leading-dash names; newline-in-name split left as accepted, implausible here)

### F7 — Hook script resolved from the session cwd's git toplevel

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .claude/settings.json:9, .claude/settings.json:14, .claude/settings.json:25
- **Detail**: If the session cwd drifts into a different git repo, the hook executes that repo's `.claude/hooks/*.sh`, or fails with exit 127 noise when the script isn't there. This follows the plan, which prescribed the form so that worktrees work after `EnterWorktree`. The trust boundary is the repo the agent is already working in, so the risk is low.
- **Fix**: Accept as designed (it's the plan's worktree trade-off) and record the reasoning. Hardening alternative: check that the resolved toplevel shares a `--git-common-dir` with `$CLAUDE_PROJECT_DIR` before executing anything.
  - Strength: Keeps worktree support, which the plan's Key Discoveries require.
  - Tradeoff: Leaves a theoretical execution path into a foreign checkout.
  - Confidence: MED — this wasn't exercised in the Claude runtime.
  - Blind spot: How Claude Code resolves the hook cwd after a Bash `cd`.
- **Decision**: ACCEPTED (as designed — cwd-toplevel resolution is the plan's worktree trade-off; $CLAUDE_PROJECT_DIR goes stale after EnterWorktree, and any repo the agent cd's into is one it already works in)

### F8 — Shared state dir in /tmp with a predictable `nosession` fallback

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.sh:19-36, .claude/hooks/lint-edited-file.sh:28-32
- **Detail**: `${TMPDIR:-/tmp}/claude-hooks` is created with umask defaults (755), and roots read from it are `cd`'d into before running `npx eslint`. On a multi-user host, another user could plant `nosession.roots`. On this single-user dev box the risk is negligible.
- **Fix**: `mkdir -m 700`, and skip the roots file entirely when `session_id` is empty.
- **Decision**: FIXED (state dir created with mkdir -m 700; sweep reads no roots file without session_id; proof case added)

### F9 — Toolchain portability assumptions undocumented (bash ≥ 4, git ≥ 2.31)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.sh:92, .claude/hooks/lint-edited-file.sh:21-22
- **Detail**: `mapfile` needs bash 4; stock macOS ships 3.2, even though the script carries a BSD `stat -f` fallback. `--path-format=absolute` needs git 2.31: on an older git, `REPO` is empty and every per-edit check exits 0 silently. Fedora and CI are fine.
- **Fix**: Note "bash ≥ 4, git ≥ 2.31" next to the jq requirement in TESTING.md.
- **Decision**: FIXED (requirements documented in TESTING.md and CLAUDE.md)

### F10 — Roadmap S-03 status left at in-progress

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (S-03 row and slice section)
- **Detail**: The roadmap edit wasn't in the plan; it is benign bookkeeping. S-03 still reads `in-progress` even though every Progress box is `[x]` and test-plan.md says implemented.
- **Fix**: Flip S-03 to done when the change is archived.
- **Decision**: DEFERRED (flip S-03 to done at archive time via /10x-archive or /10x-roadmap)

## Triage summary (2026-10-10)

- Fixed: F1 (Fix A), F2, F3 (recorded, kept), F4, F5, F6, F8, F9
- Accepted: F7 (as designed — worktree trade-off)
- Deferred: F10 (archive time)
- Post-fix: `npm run test:hooks` 35/35 (4 new proof cases); real-repo Stop sweep with real eslint/vitest exits 0.
