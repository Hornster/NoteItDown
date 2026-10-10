<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Per-file Check Hook Implementation Plan

- **Plan**: context/changes/per-file-check-hook/plan.md
- **Mode**: Deep
- **Date**: 2026-10-10
- **Verdict**: SOUND (was SOUND with 2 warnings before triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓ (3 new paths confirmed absent), symbols ✓ (vitest projects, eslint groups, ci.yml steps, jq), brief↔plan ✓, Progress↔Phase ✓ (7/6/8), contract surfaces: none touched. Verified live: `npx --no-install` resolves `node_modules/.bin` stubs even with the real repo's `.bin` on PATH; a missing stub gives rc 1 in ~0.3 s; `git diff HEAD` with no commits gives rc 128.

## Findings

### F1 — Stop sweep checks the whole dirty tree, not just this turn's changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2, criterion 2.6
- **Detail**: `git diff --name-only HEAD` ∪ untracked files is all uncommitted work, not "this turn". So every turn of a multi-turn job (Q&A included) re-runs ESLint (≥2.7 s) and vitest related on the same dirty files, which breaks criterion 2.6.
- **Fix A ⭐ Recommended**: Fingerprint the changed set per session and checkout after a green sweep; skip with no tools run when it is unchanged.
  - Strength: Q&A turns cost nothing, even on a dirty tree.
  - Tradeoff: ~10 lines of bash, one state file.
  - Confidence: HIGH — testable with the existing stub-invocation log.
  - Blind spot: None significant.
- **Fix B**: Accept the cost and reword the end state and criterion 2.6.
  - Strength: No code.
  - Tradeoff: ~3 s+ per turn while implementing.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — fingerprint skip added to the Phase 2 §2 contract, proof case added to Phase 2 §3, criterion 2.6 reworded.

### F2 — Proof harness: temp repo needs a commit and a git identity (CI has none)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §5 helper; Phase 2 §3
- **Detail**: `git diff HEAD` fails without a commit. The CI runner has no `user.name` or `user.email`, and a global gpgsign setting would break commits.
- **Fix**: The helper commits a baseline with `-c user.name/-c user.email/-c commit.gpgsign=false`; add a modified-tracked-file sweep case.
- **Decision**: FIXED

### F3 — Clearing the .roots registry is not in the Stop contract

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2
- **Detail**: Without truncating the registry on green, a sibling checkout touched once is swept, and can block, on every later turn.
- **Fix**: Truncate the session's `.roots` on green; add a proof case.
- **Decision**: FIXED
