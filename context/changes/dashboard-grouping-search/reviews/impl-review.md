<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dashboard Grouping & Search Implementation Plan

- **Plan**: context/changes/dashboard-grouping-search/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Automated verification (re-run 2026-10-16)

| Command | Result |
|---------|--------|
| `npm run lint` | pass |
| `npx astro check` | pass (0 errors) |
| `npm test` | pass (25 files, 334 tests) |
| `npm run build` | pass |
| `npm run test:e2e` | pass (7 tests, incl. `dashboard-search.spec.ts`) |
| `npm run test:http` | first run 1 failed / 107 passed (`forged-id.test.ts` › "A/A PATCH note is 404 JSON" got 500); 3 re-runs 108/108 passed |

## Findings

### F1 — Intermittent 500 on forged-id PATCH note in test:http

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/http/forged-id.test.ts:223 (route: PATCH /api/campaigns/[campaignId]/notes/[noteId])
- **Detail**: In 1 of 4 runs, user B's PATCH on user A's note returned 500 instead of 404. This change touches no API or service code (diff is limited to the dashboard island, `note-search.ts`, hooks, docs and e2e), so the flake predates S-06. The 404 contract still holds on the other runs. The same route returning 500 on an ownership-denied request in production would be a reliability gap, and CI could go red at random.
- **Fix**: Open a separate change to reproduce the flake (loop the forged-id suite, capture preview server logs) and fix the root cause in the PATCH handler or the test setup. Keep it out of S-06.
  - Strength: Keeps S-06 scope clean; the failure doesn't come from this diff.
  - Tradeoff: S-06 merges while a known flake is open.
  - Confidence: MED — 3 clean re-runs; cause not yet identified.
  - Blind spot: Haven't checked whether the 500 comes from the app, from Supabase load, or from the test's own seeding order.
- **Decision**: FIXED (follow-up queued in follow-ups/review-fixes.md as a separate change)

### F2 — Manual 3.4 (~500-note timing) ticked without recorded evidence

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dashboard-grouping-search/plan.md (Progress 3.4)
- **Detail**: No seed script, measurement or note shows a ~500-note campaign was timed. Only the unit test `groups and filters a 500-note list` (src/lib/note-search.test.ts:118) covers 500 notes, and it checks correctness, not browser latency. Per the "Waived criteria are annotated, not ticked" lesson, a reader can't tell whether this was verified.
- **Fix**: Add a short note to 3.4 saying how it was verified, or mark it `(waived: …)`.
- **Decision**: FIXED (Progress 3.4 annotated: verified manually by the user)

### F3 — e2e A–Z note-order check uses a structural selector

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/dashboard-search.spec.ts:70
- **Detail**: `page.locator("li > ul").first()` relies on the markup nesting. It breaks quietly if the Topbar or the list layout gains an `li > ul`. The group header already exposes `aria-controls`, which gives a more direct handle.
- **Fix**: Resolve the panel through the NPC header's `aria-controls` id (or `getByRole("list")` scoped to it).
- **Decision**: FIXED (panel located via the header's aria-controls id; spec re-run green)
