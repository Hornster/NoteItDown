<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Constants Sweep (S-04), Phase 2 (UI sweep)

- **Plan**: context/changes/constants-sweep/plan.md
- **Scope**: Phase 2 only
- **Mode**: Deep (claims verified inline against the code; no sub-agent)
- **Date**: 2026-10-13
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 21/21 paths ✓, 4/4 existing keys ✓ (`NETWORK_ERROR`, `NOTE_NOT_FOUND`, `NOTICE_DISMISS_LABEL`, `FOOTER_LICENSES_LINK`), 30/30 §1 table values byte-match the current literals ✓, 8/8 page 404 sites ✓, greps 2.5/2.6/2.7 hit only phase 1–2 sites ✓, e2e accessible names and hydration sentinels untouched ✓, Progress↔Phase 2 9/9 ✓, brief↔plan ✓. Phase 1 is not yet implemented; the keys Phase 2 consumes (`NOTE_SAVE_FAILED`, `CAMPAIGN_SAVE_FAILED`, `LICENSES_LABEL`, …) come from it, as the phase order intends.

## Findings

### F1 — Phase 2 skips the only suite covering all 8 page 404s

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Success Criteria (2.4)
- **Detail**: Phase 2 rewrites the 8 `Astro.response.status = 404` sites in 6 pages. `tests/http/forged-id.test.ts:180-259` checks every one of them, including the second 404 branch in `notes/[noteId].astro:40` and `notes/[noteId]/edit.astro:37`. e2e checks only one (`notes-relations.spec.ts:202`). Phase 2 ran e2e but not `test:http`, and grep 2.5 only proves the literal is gone, not that the status is still 404.
- **Fix**: Change 2.4 to `npm run build && npm run test:http && npm run test:e2e`.
- **Decision**: FIXED — criterion and Progress 2.4 now run the http matrices and e2e on one build.

### F2 — Nothing checks that the repeated labels were moved

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Success Criteria (2.6)
- **Detail**: The Desired End State says every UI string used 2+ times comes from `MESSAGES`, and S-05 relies on it. Grep 2.6 checks messages only. A label left inline (Topbar `Sign in`, the forms' `you@example.com`) passes every Phase 2 check, because the text is the same either way and e2e stays green. The phase 4 ESLint rule covers statuses only.
- **Fix**: Add a label and client-validation coverage grep as criterion/Progress 2.8; renumber the manual items to 2.9/2.10.
- **Decision**: FIXED — grep added as 2.8 (run verbatim from the plan against today's tree: 60 hits, all in phase 2's 17 files, no false positives); manual items renumbered to 2.9/2.10.

### F3 — The duplication boundary doesn't say whether interpolated strings count

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Implementation Approach — Duplication boundary; Phase 2 §1
- **Detail**: `Rename ${campaign.name}` is both the title (`campaigns/[campaignId]/edit.astro:25`) and the h1 (`:33`): the same rendered text twice in one file, which the boundary ("counting repeats within the same file") makes a key. "What We're NOT Doing" listed `Rename` as single-use, and the boundary never said whether interpolated strings count, so the implementer's choice would become the rule S-05 inherits.
- **Fix**: Add `renameCampaignTitle(name)` to the §1 table; state in the boundary that a repeated interpolated string counts by its rendered template and gets a helper.
- **Decision**: FIXED — boundary sentence added; `renameCampaignTitle(name)` in the §1 table; §2 Intent names `edit.astro:25,33`; "NOT Doing" now says "the `Rename` link"; the 2.8 grep includes the rename pattern.

### F4 — §5 lists Layout.astro with nothing to do; §2 doesn't mention LICENSES_LABEL

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 and §5
- **Detail**: Phase 1 §2 already updates `Layout.astro:40` during the `FOOTER_LICENSES_LINK` → `LICENSES_LABEL` rename. §5 still listed Layout with no change. §2 lists `licenses.astro`, whose title (`:33`) and h1 (`:37`) should use `LICENSES_LABEL`, but its Intent didn't say so.
- **Fix**: Remove Layout from §5; add a §2 bullet for `licenses.astro`.
- **Decision**: FIXED — §5 renamed "Notice and dialog" with a note that Layout was done in phase 1; §2 Intent gains the `LICENSES_LABEL` bullet.
