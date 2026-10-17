<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Memory-Map Search Implementation Plan

- **Plan**: context/changes/map-search/plan.md
- **Mode**: Deep (claims checked inline against the code and `node_modules/@xyflow/react` 12.12.0, no sub-agent)
- **Date**: 2026-10-17
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 7/7 paths ✓, 8/8 symbols ✓ (matchesNoteName, normalizeQuery, NOTE_SEARCH_PARAM, NO_NOTES_FOUND, NOTES_SEARCH_LABEL, MAP_NODE_WIDTH/HEIGHT, useNoteSearch, React Flow fitView/setCenter/useNodesInitialized), brief↔plan ✓, Progress↔Phase ✓ (3/3 phases, 15/15 criteria), contract surfaces (Routes, Dashboard search) described accurately, additive only. Minor: map.astro frame is at lines 69-75, not 66-72.

## Findings

### F1 — Tab out of the search field pans the map

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 e2e step "no match via blur (Tab)"; Desired End State "No match … viewport does not move"
- **Detail**: React Flow nodes are focusable by default, and `autoPanOnNodeFocus` defaults to true (`@xyflow/react` index.js:2329-2343, default at :3354). Tab from the search input moves focus to the first node in DOM order; if that node is off-screen (likely right after the multi-match fit), React Flow calls `setCenter` on it. The e2e step that tabs away and then asserts the `.react-flow__viewport` transform is unchanged would then fail or flake, and a keyboard user sees the map jump on a no-match search.
- **Fix A ⭐ Recommended**: In the e2e step, blur with `locator.blur()` (or click the page heading) instead of Tab, and add a line to the plan: Tab into the canvas may pan to the focused node (React Flow's keyboard a11y, not a search move).
  - Strength: Keeps existing keyboard navigation of the map; the test checks the search contract, not focus side effects.
  - Tradeoff: Keyboard users still get a pan when tabbing onto an off-screen node.
  - Confidence: HIGH — behavior read directly from the installed 12.12.0 source.
  - Blind spot: Whether a `focus-visible` match fires for Playwright's programmatic Tab was not run.
- **Fix B**: Set `autoPanOnNodeFocus={false}` on `<ReactFlow>`.
  - Strength: Tab never moves the viewport; the e2e step can keep Tab.
  - Tradeoff: Breaks "all existing `<ReactFlow>` props unchanged"; keyboard users focus off-screen nodes they can't see.
  - Confidence: MED — straightforward prop, but an a11y regression.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F2 — Search field vs. 70vh frame placement left open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3 (last bullet) and §5
- **Detail**: The plan says the frame is "moved from the page into the island or kept on the page with the field outside it". The field has to live in the island (it uses `useNoteSearch`), and the island today sits inside the page's `h-[70vh]` frame with `h-full`, so keeping the frame on the page would put the field inside the canvas frame. The "Loading map…" fallback also relies on that frame for its height.
- **Fix**: Decide: the island renders field, status line, then the bordered `h-[70vh] overflow-hidden rounded-xl border border-input bg-background` canvas frame; `map.astro` drops its wrapper div and gives the fallback slot the same frame classes so the layout doesn't jump on hydration.
- **Decision**: FIXED

### F3 — Initial `?q=` run: mechanism unstated, race already ordered

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2; Critical Implementation Details "Timing & lifecycle"
- **Detail**: `searchRun` starts at 0 whether or not there is an initial query, so how `hasInitialQuery` makes run 0 count is left to the implementer. On the race: in 12.12.0 the built-in `fitView` is resolved inside `updateNodeInternals` (index.js:3489-3491), the same store update that measures the nodes, so an effect gated on `useNodesInitialized()` already runs after the initial fit. The one-frame defer is probably not needed (keep the browser check).
- **Fix**: State the mechanism, e.g. `lastHandledRun` ref initialised to `hasInitialQuery ? -1 : 0`, the effect acts when `nodesInitialized && searchRun !== lastHandledRun.current`, then stores `searchRun`; note the defer is a fallback only.
- **Decision**: SKIPPED

### F4 — Node-center math already exists in StraightEdge

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §2 (`useMapSearchFocus` contract)
- **Detail**: `src/components/memory-map/StraightEdge.tsx:13-18` has a private `nodeCenter(node: InternalNode)` doing exactly the positionAbsolute + measured/2 with `MAP_NODE_*` fallback the hook needs. The plan cites it but re-implements it.
- **Fix**: Export `nodeCenter` (from `StraightEdge.tsx`, or move it next to `MAP_NODE_*` in `src/lib/memory-map-layout.ts`) and reuse it in `useMapSearchFocus`.
- **Decision**: FIXED
