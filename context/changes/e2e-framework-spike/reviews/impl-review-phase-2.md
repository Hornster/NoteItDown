<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: E2E Framework Spike

- **Plan**: context/changes/e2e-framework-spike/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Phase 2 commits: 22ce72a (CI wiring + smoke assertion), 1f94969 (hydration wait in spec). All five planned changes match the plan: `workflow_dispatch: {}` was added with `push`/`pull_request` still on `[main]`; `smoke` was renamed to `local-stack` and `deploy.needs` updated; the Supabase CLI is pinned to `2.120.0`, which matches the installed devDependency; the Playwright install, e2e run and `if: failure()` artifact steps sit before the smoke and `supabase stop` steps; the wait loop now fails with "preview server did not start on 4321"; `smoke.mjs` expects `/dashboard`. The spec change in 1f94969 was not planned for Phase 2. It is already covered by the Phase 1 review's F1 addenda, so it is not reported again here.

Automated re-run 2026-10-09: `npm run lint` passes. The workflow YAML parses (`yaml` parser; actionlint is not installed). Before the local smoke run, ports 4321 and 4322 were checked and found free; the run was build, then preview on 4321, then `npm run smoke`, which printed "All smoke steps passed", and the server was stopped afterwards. CI push run 37985564527 on `main` passed `ci`, `local-stack` and `deploy`, and its e2e log shows `1 passed (6.0s)`. Dispatched runs on `main` (37986627459) show the "Run workflow" trigger works (2.6). 2.7 is annotated as waived according to the lessons rule.

## Findings

### F1 — Playwright artifact upload fires on any earlier step failure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:54-60
- **Detail**: The upload step uses plain `if: failure()`. When integration or build fails, e2e is skipped, but the upload step still runs. It finds no `playwright-report/`/`test-results/` and emits a "No files were found" warning, which adds noise next to the real failure. This is harmless: `upload-artifact@v4` defaults to `if-no-files-found: warn`.
- **Fix**: Give the e2e step `id: e2e` and change the upload guard to `if: failure() && steps.e2e.outcome == 'failure'`.
- **Decision**: FIXED — `id: e2e` added; upload guarded by `failure() && steps.e2e.outcome == 'failure'`; YAML re-parsed

### F2 — Progress SHAs and 2.4 evidence point at the wrong commit/run

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/e2e-framework-spike/plan.md (Progress 2.1–2.4)
- **Detail**: Items 2.1–2.3 landed in 22ce72a (its commit message says so) but are stamped `1f94969`. The first push of 22ce72a to `main` went red: CI run 37984841694 failed on the hydration race with `toHaveURL` → `/auth/signin`. 2.4 is satisfied only by run 37985564527 after 1f94969, and that run isn't named. A later reader can't tell from Progress that `main` was briefly red. Deploy was gated, so nothing shipped.
- **Fix**: Re-stamp 2.1–2.3 with `22ce72a` and append `(green run 37985564527; first push 37984841694 red on hydration race)` to 2.4.
- **Decision**: FIXED — 2.1–2.3 re-stamped 22ce72a; 2.4 annotated with green run 37985564527 and red first push 37984841694
