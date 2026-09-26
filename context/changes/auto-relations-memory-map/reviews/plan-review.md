<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auto-Detected Relations & Memory Map

- **Plan**: context/changes/auto-relations-memory-map/plan.md
- **Mode**: Deep
- **Date**: 2026-09-26
- **Verdict**: SOUND
- **Findings**: 0 critical · 3 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress↔Phase ✓. Verified against local PG 17.6 (in transactions that were rolled back): all 9 `note_mentions` cases plus 6 adversarial names pass. Nested-function EXECUTE is checked at call time; trigger-function EXECUTE only at CREATE TRIGGER. `postgres` has BYPASSRLS, so the migration backfill works.

## Findings

### F1 — React Flow CSS nests @import inside @layer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §1 / Key Discoveries
- **Detail**: The CSS spec doesn't allow `@layer base { @import "…"; }`. The snippet appears in xyflow's 2025-10-28 release notes, but xyflow's Tailwind example and all of Tailwind's docs use the top-level `@import "…" layer(base);` form.
- **Fix**: Use `@import "@xyflow/react/dist/style.css" layer(base);` right after `@import "tw-animate-css";`.
- **Decision**: ACCEPTED (will be handled during implementation)

### F2 — Edges remain reconnectable (edgesReconnectable defaults true)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2 — ReactFlow props
- **Detail**: The lock-down list doesn't include `edgesReconnectable`, which defaults to true even with no `onReconnect`. That goes against FR-011 and manual check 3.8.
- **Fix**: Add `edgesReconnectable={false}`.
- **Decision**: FIXED

### F3 — Hosted ctype check reads the wrong setting

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / Phase 1 manual step 1.5
- **Detail**: The local DB uses the ICU provider (`datlocprovider = 'i'`). With ICU or builtin providers, regex classes don't come from `datctype`, so checking `datctype` can mislead either way.
- **Fix**: Probe the behaviour on the hosted DB: `select 'Ł' ~ '[[:alnum:]]' as alnum_ok, 'ŁÓDŹ' ~* 'łódź' as icase_ok;`. If either is false, apply the ICU collation fallback.
- **Decision**: FIXED (plan and brief updated; Progress row 1.5 title left unchanged, with a note in the Phase block)

### F4 — Two contract-surfaces sections not updated

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3, Phase 3 §6
- **Detail**: `/map` is missing from "Active campaign resolution → Callers", and `notes_detect_relations()` is missing from "Trigger functions".
- **Fix**: Add both bullets to the docs steps.
- **Decision**: FIXED
