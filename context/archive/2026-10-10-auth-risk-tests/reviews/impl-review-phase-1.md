<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Risk Tests Implementation Plan

- **Plan**: context/changes/auth-risk-tests/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-10-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

- Phase 1 commit: `e9a7e01`. All 6 planned changes are present and match their contracts: the `http` Vitest project and scripts, `global-setup.ts`/`server.ts`, `client.ts`, `route-inventory.ts`, `route-guard.test.ts`, and the CI step after `npm run build`. Nothing was added outside the plan.
- `npm run lint`: exit 0. `npx astro check`: 0 errors, 0 warnings. `npm run test:http`: 2 files, 64 tests passed. That run also includes the Phase 2 files.
- 1.3 was verified statically: `package.json` `test` = `--project unit --project hooks --project integration`.
- 1.5 (the fail paths for missing Supabase and missing `dist/`) was checked by reading `global-setup.ts:41-50`. It was not re-run, because that would mean stopping Supabase or removing `dist/`.
- 1.8: GitHub Actions runs `38143803033` and `38149648011` on `auth-risk-tests` (workflow_dispatch) both succeeded.
- 1.6 and 1.7 are manual mutation checks that leave no trace in the diff. They are accepted as reported.
- Later phases: Phase 2 only appends to `route-guard.test.ts` and adds `session-revocation.test.ts`. It changes none of the Phase 1 assumptions.

## Findings

### F1 — Route inventory silently ignores non-`.astro`/`.ts` route files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/http/support/route-inventory.ts:78-80
- **Detail**: `enumerate()` only handles `.astro` and `.ts`. Astro also routes `.md`, `.mdx`, `.html` pages and `.js`/`.mjs` endpoints, and the walker skips these without reporting them. A future `src/pages/help.md` or `src/pages/api/x.js` would get no matrix row, which breaks the Desired End State "a new route added under `src/pages` is covered automatically". The `unrecognizedRouteFiles()` safety net was designed for exactly this kind of silent drop, but it only covers `.ts`. The plan contract has the same gap. No such files exist today.
- **Fix**: In `enumerate()`, push any file whose extension is neither `.astro` nor `.ts` into `unrecognized`. The existing "recognizes the exports of every route file" test then fails and names the file.
- **Decision**: FIXED — non-`.astro`/`.ts` files under src/pages now land in `unrecognizedRouteFiles()` (probe `zz-probe.md` reported; test:http 64/64 green)

### F2 — Literal `302` instead of a status constant

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/route-guard.test.ts:42 (also :59, added in Phase 2)
- **Detail**: The API rows use `HTTP_STATUS.OK`/`UNAUTHORIZED`, but the page rows use a bare `302`. That goes against the lessons.md rule "Use the central error/status/message dictionaries in new code". `HTTP_STATUS` has no `FOUND` entry, and adding one is a `src/` edit, which this tests-only change forbids ("No `src/` changes").
- **Fix**: Defer to the S-04 constants sweep. There, add `FOUND: 302` to `HTTP_STATUS` and replace the literals in `tests/http/`.
- **Decision**: FIXED (deferred) — queued for S-04 in `follow-ups/review-fixes.md`; code unchanged (tests-only boundary)

### F3 — `dist/` staleness check counts unit-test edits under `src/`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/http/global-setup.ts:48
- **Detail**: `newestMtimeMs(src)` includes `src/**/*.test.ts`, the colocated unit tests that never reach `dist/`. Editing only a unit test therefore makes `npm run test:http` refuse to run until a full rebuild. This is friction, not a false pass: the check stays conservative. It also ignores `astro.config.mjs` and dependencies, which matches the plan's scope.
- **Fix**: In `newestMtimeMs`, skip entries ending in `.test.ts`.
- **Decision**: FIXED — `newestMtimeMs` skips `*.test.ts`; touched `src/lib/memory-map-layout.test.ts`, test:http still ran green (64/64)
