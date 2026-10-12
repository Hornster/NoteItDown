<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Notes, Relations & Isolation Risk Tests (full plan)

- **Plan**: context/changes/notes-relations-risk-tests/plan.md
- **Scope**: Whole plan, cross-phase (per-phase findings live in `plan-review-phase-1.md` … `plan-review-phase-4.md`, all triaged)
- **Mode**: Deep (claims verified inline against routes, services, the http/e2e harnesses, ci.yml and test-plan.md)
- **Date**: 2026-10-12
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

10/10 paths ✓, 6/6 symbols ✓ (`Jar.clone`, `LAST_CAMPAIGN_COOKIE`, `sign_in_sign_ups = 30` at `config.toml:190`, `fitView`/`onNodeClick` at `MemoryMap.tsx:70-71`, rate-limit sentence `test-plan.md:137`), brief↔plan ✓, Progress↔Phase ✓ (1.1–1.5, 2.1–2.3, 3.1–3.5, 4.1–4.5).

Cross-phase checks with no finding: every id-taking route (8 pages, 10 API handlers) is in the forged-ID matrix; auth budget baseline 24 confirmed (integration 12, http 2, e2e 7, smoke 3) → 35 / 50 after S-02; CI `local-stack` runs `supabase start` from repo `config.toml`, so the cap of 50 applies in CI; image routes scope by `campaign_id` + `note_id` (`note-images.ts:401-403`); the only rate-limit literals are `test-plan.md:137` and the `test-user.ts` JSDoc, both updated by the plan.

## Findings

### F1 — Single CRUD + map e2e test will likely hit Playwright's 30 s default timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 and §2 (CRUD `test()` with `test.step`s)
- **Detail**: The Phase 3 review fix put sign-in, 4 UI note creates, 5 edits, the map click and 2 deletes into one `test()` to stay within the auth budget. That is about 25 SSR page loads, each followed by island hydration. `playwright.config.ts` sets no `timeout` and `retries: 0`, and no existing spec calls `test.setTimeout`, so the whole chain must finish within 30 s. That is tight on a CI runner, and if it times out, CI fails with an error that says nothing about the notice wording.
- **Fix**: Add `test.setTimeout(120_000)` (or `test.slow()`) to the CRUD + map test, with a one-line comment explaining why (one long test to save auth calls). Leave the global config alone.
- **Decision**: FIXED — Phase 3 §1 contract now requires `test.setTimeout(120_000)` on the CRUD + map test
