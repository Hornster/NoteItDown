<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Risk Tests — Phase 4 (Smoke seams and documentation)

- **Plan**: context/changes/auth-risk-tests/plan.md (Phase 4 only)
- **Mode**: Deep (claims verified inline against code)
- **Date**: 2026-10-11
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding
Grounding: 5/5 paths ✓ (`scripts/smoke.mjs`, `TESTING.md`, `CLAUDE.md`, `context/foundation/test-plan.md`, `.github/workflows/ci.yml`), 4/4 symbols ✓ (smoke `startsWith` check at :126, signout step :107, "signin accepts correct password" :56, CLAUDE.md:47 "no e2e coverage" sentence), brief↔plan ✓, Progress↔Phase ✓ (4.1–4.5).

Verified: smoke's step tuple `[name, run, expected]` and global `jar` Map make both seam fixes a few lines each. Existing `startsWith("/auth/signin")` steps pass today, so Astro emits relative `Location` headers and the exact `"/"` comparison is safe. `scripts/**/*.mjs` is covered by ESLint (eslint.config:74). The smoke changes add no auth calls.

## Findings

### F1 — Docs still say `npm test` runs "every Vitest project"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §2 (TESTING.md, CLAUDE.md)
- **Detail**: Phase 1 adds a 4th Vitest project (`http`) and narrows `npm test` to `--project unit --project hooks --project integration`. TESTING.md ("runs every Vitest project (unit, hooks, integration)") and CLAUDE.md:42 ("runs every Vitest project: unit, hooks, integration (not e2e)") then say something false. Phase 4 only says the TESTING.md line "still says unit, hooks, integration" and doesn't touch CLAUDE.md:42. An agent reading CLAUDE.md would believe `npm test` covers the route-guard suite. README.md:58–60/185–213 is also stale (no e2e/hooks), and the plan doesn't say whether it is in scope.
- **Fix**: In §2, reword both lines to "runs the unit, hooks and integration projects; not `http` (needs a build) and not e2e", and state README.md is out of scope (already stale; CLAUDE.md/TESTING.md are canonical).
- **Decision**: Fixed

### F2 — test-plan.md update leaves stale statements

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §2 (test-plan.md)
- **Detail**: The §4 "Test-base profile" line says "no tests for middleware, API/page routes or UI", which becomes false after this change. §8 Freshness Ledger dates aren't bumped. §6.3 (e2e cookbook) doesn't mention the `UI_BASELINE` approved-wording pattern that the next wording test should reuse.
- **Fix**: Add to the test-plan.md contract: update the §4 profile line, add a §6.3 bullet ("pin UI wording via a user-approved `UI_BASELINE` literal, never `MESSAGES`"), and bump §8 "Strategy last reviewed".
- **Decision**: Fixed

### F3 — 4.3 "green on push" would deploy if pushed to main

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 Success Criteria (4.3)
- **Detail**: Work happens on `main` (current branch). The `deploy` job runs on any push to `main` after `ci` + `local-stack`. Tests-only changes make this a harmless redeploy, but 1.8 says "on the branch" while 4.3 says "on push", which is inconsistent. `workflow_dispatch` runs never deploy.
- **Fix**: Reword 4.3: "Full CI `local-stack` and `ci` jobs green on a branch push or `gh workflow run ci.yml --ref <branch>` (a push to `main` also deploys)".
- **Decision**: Fixed
