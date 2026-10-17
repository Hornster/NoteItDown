<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Memory-Map Search Implementation Plan

- **Plan**: context/changes/map-search/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks re-run during review: `npm run test:unit` (176 passed), `npm run lint` (clean), `npx astro check` (0 errors), `npm run build` (ok), `npm run test:e2e` (8/8 passed, including `map-search.spec.ts` and the existing map-click step). No dev server was running (lesson: check for a running dev server). Manual items 2.6–2.10 and 3.3 are ticked; the e2e scenario gives observable evidence for 2.6–2.8 and 2.10. 2.9 (contrast, ring visible when zoomed out) has no automated evidence, which is expected for a visual check.

## Findings

### F1 — Found-marking derivation rebuilds every node on each drag tick

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/memory-map/MemoryMap.tsx:58-61
- **Detail**: `displayNodes` maps every state node to a new object with a new `data` object whenever `nodes` changes. During a drag, `useNodesState` replaces only the dragged node, but this memo creates new objects for all nodes. React Flow's `adoptUserNodes` (`@xyflow/system`, `userNode === internalNode.internals.userNode` check) then rebuilds every internal node and re-renders every `NoteNode` on each drag frame. Before this change only the dragged node was rebuilt. With the PRD's ~500-note campaigns this makes dragging slower for no visible gain. The plan prescribed the derivation but did not require new objects for non-found nodes.
- **Fix**: Return the state node unchanged when it is not found (`found.has(node.id) ? { ...node, data: { ...node.data, found: true } } : node`), so only found nodes get new objects. `NoteNode` already treats a missing `found` as false.
- **Decision**: FIXED — b5c7442

### F2 — Hydration still shifts layout by the search field's height

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/campaigns/[campaignId]/map.astro:79-84
- **Detail**: The plan gave the "Loading map…" fallback the frame classes "so the layout doesn't jump on hydration". The fallback now matches the canvas frame, but the hydrated island also renders the search input (plus a `space-y-4` gap) above the frame. The canvas therefore still moves down by about the input height when the `client:only` island mounts.
- **Fix**: Put an input-height placeholder (e.g. a `h-9` spacer or a disabled `Input`-shaped block) plus the same `space-y-4` wrapper in the fallback slot, or accept the small shift.
- **Decision**: SKIPPED
