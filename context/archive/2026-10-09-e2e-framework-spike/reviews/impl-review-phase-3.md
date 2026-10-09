<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: E2E Framework Spike

- **Plan**: context/changes/e2e-framework-spike/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-10-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated: `npm run lint` passes (exit 0). `git ls-remote --heads origin 'e2e-proof/*'` prints nothing. `proof-runs.md` lists P1–P6 with run URLs, and each observed result matches the expected column (P5 failed with no extra guard needed).

## Findings

### F1 — Post-proof CI change has never run in CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:53-56; context/changes/e2e-framework-spike/proof-runs.md (Notes)
- **Detail**: The Phase 2 triage commit da390fe changed the artifact upload condition to `failure() && steps.e2e.outcome == 'failure'` after the proof runs. Local `main` is 4 commits ahead of `origin/main`, and the latest CI runs are the proof dispatches on 1f94969. `proof-runs.md` says "The `if: failure()` upload step ran in all five red runs", which describes the old condition. No CI run has exercised the new one yet. The expression looks correct, but the recorded evidence no longer matches the workflow on `main`.
- **Fix**: After the user-approved push of `main`, dispatch the existing P2 change once more (or check that the push run is green). Then add one line to proof-runs.md Notes saying the upload condition changed in da390fe, with the confirming run URL.
- **Decision**: FIXED — main pushed (run 37992157807: ci, local-stack, deploy all green); P2 recheck run 37992166514 red at e2e with playwright-report uploaded under the new condition; recorded in proof-runs.md; recheck branch deleted

### F2 — Cookbook points at the re-export, not the shared seed helper

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md §6.3 ("Seed" bullet)
- **Detail**: The cookbook names `tests/integration/helpers.ts` as the home of `createTestUser`. Plan addendum F3 moved it to `tests/support/test-user.ts`, and `tests/e2e/signin.spec.ts:3` imports it from there. An agent following the cookbook would import the e2e seed from the integration folder.
- **Fix**: Change the path to `tests/support/test-user.ts`, which `tests/integration/helpers.ts` re-exports.
- **Decision**: DISMISSED — reviewer error: the path was already corrected in 1ad89f8 (phase 1 triage); the review read the 1890c72 diff instead of HEAD

### F3 — test-plan edits beyond the named sections

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md §4 "Stack grounding tools", §5 gates table
- **Detail**: The contract said "prose edits in the named sections only" (§3 row 1, §4 e2e row, §6.3). The commit also updated the Context7 grounding line and two §5 gate rows (`smoke` → `local-stack`, e2e gate marked wired). These edits are accurate and keep the doc consistent with the job rename.
- **Fix**: Accept as-is; no change needed.
- **Decision**: ACCEPTED — edits accurate and consistent with the job rename

### F4 — Manual 3.5 (P2 trace opened) has no recorded evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/e2e-framework-spike/plan.md:347
- **Detail**: Progress 3.5 is ticked. `proof-runs.md` records that the P2 artifact contains `trace.zip` and a screenshot, but nothing records that the user opened it with `npx playwright show-trace`. It may simply not have been written down.
- **Fix**: Confirm with the user. If done, add "(trace opened by user, 2026-10-09)" to 3.5; if not, open it now or annotate it as waived.
- **Decision**: FIXED — user confirmed; 3.5 annotated
