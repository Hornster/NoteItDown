<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Landing Page Copy Implementation Plan

- **Plan**: context/changes/landing-page-copy/plan.md
- **Mode**: Deep (claims verified inline; no sub-agent — copy-only plan, 4 files)
- **Date**: 2026-10-20
- **Verdict**: REVISE (light — all fixes are one-line plan edits) → SOUND after triage (F1–F4 fixed in plan)
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 6/6 paths ✓ (Welcome.astro, Layout.astro, messages.ts, TESTING.md, README.md, public/template.png), 4/4 symbols ✓ (`MESSAGES` already imported in Layout.astro:6, default title Layout.astro:12, only `src/pages/index.astro` relies on the default title, no test asserts "10x Astro Starter"), PRD copy ✓ (prd-v3.md FR-001/FR-002 match verbatim), brief↔plan ✓, contract surfaces: no surface touched beyond an additive `MESSAGES` key.

## Findings

### F1 — Criterion 2.2 grep can never return nothing

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Success Criteria (Progress 2.2)
- **Detail**: `grep -rn "template.png" --exclude-dir=node_modules --exclude-dir=.git .` scans `context/`, where plan.md, plan-brief.md and this review all mention `template.png`. The criterion fails even after a correct implementation, and the "re-grep before deleting" step in Phase 2 §2 gives the same false hit.
- **Fix**: Add `--exclude-dir=context` to both greps (criterion 2.2 and the pre-delete re-grep).
- **Decision**: FIXED

### F2 — Production check gates Phase 1 but needs a merge to main

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Manual Verification (Progress 1.9) + Implementation Note
- **Detail**: 1.9 "Live production landing page shows the new copy" is a Phase 1 manual gate, and the Implementation Note pauses before Phase 2 until manual testing passes. Production deploys only on push to `main` (CI `deploy` job), and CLAUDE.md says to merge after impl-review or archiving. So 1.9 can't be ticked until both phases, impl-review and the merge are done. Either Phase 2 is blocked behind a merge, or 1.9 is left open or ticked early. Nothing in the plan says who merges, or by when, to make the 2026-11-04 deadline.
- **Fix**: Move 1.9 out of Phase 1 into a final post-merge step, e.g. a Phase 2 manual item "After merge to `main` and the CI `deploy` job, the live landing page shows the new copy (deadline 2026-11-04)". Add one line to Migration Notes: merge after impl-review, no later than ~2026-11-02, so a failed deploy still has slack.
  - Strength: Phase gates stay checkable on the branch, and the deadline-critical step is named explicitly.
  - Tradeoff: Phase 1 is no longer "deadline-proven" on its own; the deadline now depends on finishing both phases (Phase 2 is small).
  - Confidence: HIGH — the deploy job condition in CLAUDE.md CI section confirms main-only deploys.
  - Blind spot: Whether the user prefers merging Phase 1 alone early (then Phase 2 would need a follow-up branch).
- **Decision**: FIXED

### F3 — "Panels contain no links or buttons" has no locator

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 — Landing e2e spec
- **Detail**: The card `<div>`s have no role, landmark or test id, and the hero buttons sit outside them, so a page-wide "no links" check is wrong. The implementer has to guess how to scope "the panels" (and might add markup the plan says not to change).
- **Fix**: Specify the scope in the contract: for each panel, `page.getByRole("heading", { level: 3, name }).locator("..")`, then assert `getByRole("link")` and `getByRole("button")` count 0 inside it. No markup changes.
- **Decision**: FIXED

### F4 — Case-insensitive "starter" body check is broader than the PRD

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 — Landing e2e spec
- **Detail**: The PRD acceptance criterion is "no starter-template text". A bare case-insensitive `starter` on the body also fails on future legitimate copy (e.g. "starter campaign"). It would also catch the config banner, whose text could change independently of this slice. The explicit list (`10x Astro Starter`, the three old headings) plus the old subtitle already pins the removal.
- **Fix**: Replace the bare `starter` oracle with the old subtitle fragment `production-ready starter` (literal), keeping the explicit list.
- **Decision**: FIXED
