<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auto-Detected Relations & Memory Map

- **Plan**: context/changes/auto-relations-memory-map/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-09-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Automated checks re-run on 2026-09-26: `npm run lint` passed, `npx astro check` gave 0 errors, 0 warnings and 0 hints, `npm run build` passed, and `npm test` passed 56/56 across 5 files. `npm run smoke` against a local preview passed all 10 steps, including `map redirects anonymous user → 302 /auth/signin` and `map renders for signed-in user → 200`.
- Drift check: all six planned items MATCH, with nothing MISSING or EXTRA. The one cross-phase edit, `MAP_NODE_HEIGHT` 72 → 80 in `src/lib/memory-map-layout.ts`, fits the badge row, and the Phase 2 layout tests still pass. No scope guardrail was crossed: no edge click, no MiniMap, no persisted positions and no live physics.
- Manual checks 3.6–3.11 are ticked. They are UI or production observations with no diff evidence. The code supports them: `edgesReconnectable={false}`, `deleteKeyCode={null}`, `colorMode="dark"`, and an empty state that doesn't mount the island.

## Findings

### F1 — Map nodes are keyboard-focusable but can't be activated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/memory-map/MemoryMap.tsx:50-65
- **Detail**: `nodesFocusable` defaults to true, so Tab lands on each node. React Flow's keydown path only handles selection, which is disabled here, and it never calls `onNodeClick`, so Enter and Space do nothing. The plan accepts this ("No keyboard navigation of the graph beyond React Flow defaults; the dashboard list stays the keyboard-accessible path"). What's left is a set of tab stops that do nothing.
- **Fix**: Add `nodesFocusable={false}` so keyboard users skip the map and use the dashboard list, as the plan intends. The alternative, a `role="link"` plus Enter handler in `NoteNode`, is out of plan scope.
- **Decision**: SKIPPED — plan already accepts no graph keyboard navigation; dashboard list is the keyboard path.

### F2 — `buildEdges` doesn't filter relations with unknown endpoints

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/memory-map/MemoryMap.tsx:26-33
- **Detail**: `layoutMemoryMap` drops relations whose endpoints aren't among the notes, but `buildEdges` keeps them all. `StraightEdge` returns `null` when `useInternalNode` is undefined, so nothing crashes. React Flow may still log a warning for such an edge. This can't happen today, because both lists come from the same RLS-scoped campaign.
- **Fix**: Filter edges in `buildEdges` against the set of note ids, matching the layout's defensive filter.
- **Decision**: FIXED — buildEdges now filters relations against the note-id set (MemoryMap.tsx:26-37).

### F3 — Notes and relations load one after the other

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/map.astro:14-17
- **Detail**: Once the campaign is known, `listNotes` and `listRelations` are independent, but they are awaited one at a time. That costs one extra DB round trip per `/map` load. It matches the dashboard's pattern and is negligible at the PRD's data volume.
- **Fix**: Load both with `Promise.all` inside the `campaign && supabase` branch.
- **Decision**: FIXED — notes and relations load via Promise.all (map.astro:15-18).
