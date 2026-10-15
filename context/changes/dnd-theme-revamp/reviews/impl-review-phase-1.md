<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: D&D Theme Revamp Implementation Plan

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 1 of 5
- **Reviewed phases**: 1
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Commit under review: `bb1c1ab`. None of its files changed in later phases (`git diff --stat bb1c1ab HEAD` over those paths is empty).
- `npm run lint`: exit 0.
- `npm run test:e2e`: 6/6 passed, including the new Cancel-focus assertion.
- `npm run test:e2e -- --list | grep -c "\[screenshots\]"`: 0. The screenshots project lists 17 tests, and the chromium project lists 6.
- Screenshot run: 17/17 passed into `.screenshots/theme/review-p1/` (17 PNGs). The `before` label was not reused, so the baseline is intact. An earlier attempt failed in `beforeAll` because two review runs were using the shared port 4322 and `test-results/` at the same time (see F3). It is not a code defect.
- Manual 1.5: `.screenshots/theme/before/` holds 17 PNGs. A spot check of `note-saved-notice.png` shows the pre-theme purple UI with a note, its notice and the image.
- Manual 1.6: `bb1c1ab` touches no `src/` file.
- The plan-drift sweep returned MATCH for all three planned changes: screenshot project, `theme.shot.ts` (every contract clause), and the Cancel-focus assertion.

## Findings

### F1 — Seeding `beforeAll` gates the signed-out shots too

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/screenshots/theme.shot.ts:153-156
- **Detail**: `test.beforeAll` sits at file level, so it runs before the "signed out" describe as well. If seeding fails (a sign-in or upload error, or a server hiccup), all 17 shots fail, including the 5 signed-out pages that need no seed. This works against the plan's "each shot is its own test so one failure does not hide the others". Each failure also restarts the worker and re-seeds: that costs 2 more auth calls and leaves another throwaway user. The file comment documents this.
- **Fix**: Move the `beforeAll` inside `test.describe("signed in", …)`, so signed-out shots never depend on seeding.
- **Decision**: FIXED — beforeAll moved into the "signed in" describe; eslint clean, screenshot run 17/17.

### F2 — Unplanned rename of `layout-example.tsx` leaves stale references

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/materials/layout-example.tsx.txt; context/changes/dnd-theme-revamp/research.md:12,223,233,328-329
- **Detail**: The plan does not list this rename. It is benign and justified: the file is a Next.js example that broke `astro check`. The commit message records it, but research.md still cites the old `.tsx` name. The roadmap and change.md edits are expected bookkeeping.
- **Fix**: Update the research.md references to `layout-example.tsx.txt`, or accept the rename as documented by the commit message.
- **Decision**: FIXED — 5 references in research.md updated to `layout-example.tsx.txt`.

### F3 — e2e and screenshot runs cannot run concurrently

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: playwright.config.ts:24-32; TESTING.md:29
- **Detail**: Both projects share the port 4322 preview server (`reuseExistingServer` locally) and `test-results/`. Two runs at once caused an ENOENT on trace artifacts and `beforeAll` failures, which this review reproduced by accident. Nothing documents the constraint.
- **Fix**: Add one sentence to TESTING.md: do not run `test:e2e` and `test:screenshots` (or two screenshot runs) at the same time.
- **Decision**: FIXED — concurrency note added to the `test:screenshots` entry in TESTING.md.

### F4 — `signInViaUi` / `createNoteViaUi` duplicated from notes-relations.spec.ts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/screenshots/theme.shot.ts:90-122
- **Detail**: `signInViaUi` is byte-identical to the local helper in `notes-relations.spec.ts`. `createNoteViaUi` adds an optional image parameter. Neither is a shared helper today, so no existing helper was bypassed. The plan itself said to follow the pattern of `signInViaUi`.
- **Fix**: Extract both into `tests/e2e/support/` when a third consumer appears; no action now.
- **Decision**: FIXED — extracted now (user's choice) into `tests/e2e/support/ui-flows.ts` (optional image + heading assertion kept); both files import it. e2e 6/6, screenshots 17/17.

## Triage summary

- Fixed: F1, F2, F3, F4 (4)
