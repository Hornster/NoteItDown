<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auto-Detected Relations & Memory Map

- **Plan**: context/changes/auto-relations-memory-map/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-09-26
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS (1 observation) |
| Success Criteria | PASS (1 observation) |

## Evidence

- Commit 5dd07a7 touches exactly the planned files: package.json/lock (`d3-force`, `@types/d3-force` dev), `src/types.ts`, `src/lib/services/relations.ts`, `src/lib/memory-map-layout.ts` + `.test.ts`, `tests/integration/relation-detection.test.ts`, plus plan.md bookkeeping. No unplanned code.
- `MemoryMapRelation` / `MemoryMapData` match the contract (Pick of `Relation`, doc comments, DTO block, no React Flow types).
- `listRelations` matches the contract: selects `id, note_a_id, note_b_id`, filters on `campaign_id`, throws `listRelations: query failed: <message>`.
- `layoutMemoryMap` matches the contract: exports `MAP_NODE_WIDTH`/`MAP_NODE_HEIGHT`, returns top-left positions, copies inputs, drops dangling relations, uses stopped simulation with charge/link(id)/collide(from box)/weak x,y and 300 fixed ticks.
- All six planned unit cases and both planned `listRelations` integration cases exist.
- Cross-phase: Phase 3 (994b7a5) changed `MAP_NODE_HEIGHT` 72 → 80. `NoteNode` and `StraightEdge` both read the shared constants, so the layout's collide radius and the rendered box stay in sync.
- `npm run test:unit`: 2 files, 21 tests passed. `npm run test:integration`: 3 files, 35 tests passed. `npm run lint`: clean. `npx astro check`: 0 errors, 0 warnings, 0 hints.
- Phase 2 has no manual criteria.

## Findings

### F1 — `listRelations` returns rows in unspecified order

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/relations.ts:10-13
- **Detail**: The layout's determinism relies on "stable input order" (memory-map-layout.ts doc comment, plan Phase 2 §4). `listNotes` orders by `created_at`, but `listRelations` has no `.order(...)`, so link order comes from Postgres physical/plan order. In practice this is stable for unchanged data, so the effect is at most a slightly different layout after unrelated relation churn. Nothing breaks.
- **Fix**: Add `.order("note_a_id").order("note_b_id")` to the query so link order is explicit.
- **Decision**: SKIPPED

### F2 — Tenant-isolation `listRelations` test can pass vacuously

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/integration/relation-detection.test.ts ("returns an empty list when tenant A queries tenant B's campaign id")
- **Detail**: The test creates two mentioning notes in tenant B, then asserts tenant A sees `[]`. It never checks that tenant B's relation actually exists. If detection silently failed for B, the test would still pass without proving RLS scoping. Other tests cover detection, so the risk is low.
- **Fix**: Add a positive control before the cross-tenant check: `listRelations(tenantB.client, tenantB.campaignId)` contains the expected sorted pair.
- **Decision**: FIXED (positive-control assertion for tenant B added; integration suite green)
