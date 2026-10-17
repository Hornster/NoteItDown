# Memory-Map Search Implementation Plan

## Overview

Roadmap S-07 (PRD v2 US-01, FR-005, FR-013): the user can search memory-map nodes by note name with the same triggers as the dashboard search (S-06). One match centers the viewport on that node and marks it in gold; several matches are all marked in gold and the viewport fits around them; no match shows the neutral "No notes found." message and leaves the viewport where it is. Click-to-navigate on nodes and connections stays exactly as it is.

## Current State Analysis

- `src/components/memory-map/MemoryMap.tsx:50-79` renders `<ReactFlow>` directly (no `ReactFlowProvider`), computes nodes/edges once from props with a one-shot force layout, uses `fitView` on load and navigates on `onNodeClick`. Nodes live in `useNodesState`, so dragging moves a node locally.
- `src/components/memory-map/NoteNode.tsx:21-37` is a fixed-size card (`border-input bg-card hover:bg-accent`), name in `text-foreground`, type badge; handles hidden.
- `src/pages/campaigns/[campaignId]/map.astro:66-72` mounts `MemoryMap` as `client:only="react"` inside a bordered `h-[70vh]` frame with a "Loading map…" fallback; the island is not mounted when the campaign has no notes. The page does not read `?q=`.
- S-06 left reusable pieces: `useNoteSearch` (`src/components/hooks/useNoteSearch.ts`) owns input text, the applied query, the 300 ms debounce / Enter / blur-if-changed triggers and the `?q=` `replaceState` sync; `matchesNoteName`, `normalizeQuery`, `NOTE_SEARCH_PARAM` (`src/lib/note-search.ts`); `MESSAGES.NO_NOTES_FOUND` and `MESSAGES.NOTES_SEARCH_LABEL` (`src/lib/constants/messages.ts:63-64`). The dashboard island is `src/components/notes/NotesBrowser.tsx`.
- `useNoteSearch` changes nothing when the applied query does not change, so pressing Enter twice with the same text does nothing today.
- Theme (`src/styles/global.css`): gold `--primary`/`--ring` `#c9a24a`. Measured contrast: gold vs node card `#2e2922` 6.01:1, vs background 7.37:1, **vs hover accent `#4a4135` 4.17:1** (fails AA for normal text).
- Existing coverage of map click: `tests/e2e/notes-relations.spec.ts:133-138` ("map node click opens the note page", locator `.react-flow__node` filtered by text).
- `@xyflow/react` 12.12.0. `useReactFlow()` (`setCenter`, `fitView`, `getZoom`, `getInternalNode`) and `useNodesInitialized()` need a `ReactFlowProvider` ancestor.

## Desired End State

On `/campaigns/<id>/map` a search field ("Search notes by name") sits above the map canvas, with a polite live status line under it.

- Typing and pausing 300 ms, pressing Enter, or leaving the field with changed text applies the search (case-insensitive substring on the note name, same matcher as the dashboard).
- **One match**: the node gets the gold marking and the viewport animates (300 ms) to center on the node's current position (including a node the user dragged) at zoom `max(current zoom, 1)`.
- **Several matches**: every matching node gets the gold marking, no other node does, and the viewport animates to fit the matched nodes with zoom capped at 1.
- **No match**: no node is marked, "No notes found." appears in muted parchment text, the viewport does not move.
- **Empty query** (cleared): no marking, no message, viewport stays.
- Pressing Enter re-runs the viewport move even with unchanged text (re-center after panning away). Pause and blur act only on changed text.
- The applied query is mirrored to `?q=`; opening the map with `?q=` (reload, Back from a note) marks the matches and re-centers/re-fits once nodes are measured.
- Gold marking = gold border plus gold outer ring; name text stays parchment; the node carries `data-found="true"`.
- Clicking any node (found or not) still navigates to its note; dragging still works; nothing can create/select/reconnect an edge.

Verification: unit tests for the pure search logic, a new e2e scenario `tests/e2e/map-search.spec.ts` in CI, the existing map-click e2e step still green, and manual checks of contrast, dragging and zoom behavior.

### Key Discoveries:

- `matchesNoteName("x", "")` returns `true` (`src/lib/note-search.ts:16-19`) — map search must special-case the empty query so a cleared search marks nothing.
- `useNoteSearch`'s debounce callback calls `setAppliedQuery` from a closure; a "search run" counter must compare against the current applied query (functional update or ref), not a stale closure value.
- React Flow `setCenter(x, y, { zoom, duration })` and `fitView({ nodes, maxZoom, padding, duration })` are the viewport APIs (reactflow.dev API reference). Node center = `internals.positionAbsolute` + measured size / 2, the same math `StraightEdge.tsx:13-18` already uses.
- React Flow's default `minZoom` is 0.5, so a fit over far-apart matches can still leave some at the edge; accepted (see risks).

## What We're NOT Doing

- No server-side search, no API or schema change, no change to `listNotes`/`listRelations`.
- No search inside note content; no change to relation detection (search code stays separate, PRD FR-012).
- No edge highlighting, no dimming of non-matching nodes, no "N found" count message, no "Found" badge on nodes (color + thickness marking was chosen).
- No persistence of manual pan/zoom or dragged node positions; Back lands on the search framing.
- No shared query between dashboard and map (Topbar links are unchanged; each page keeps its own `?q=`).
- No change to dashboard behavior (it ignores the new `searchRun` value).
- No mobile layout work, no RTL/jsdom component tests.

## Implementation Approach

Mirror S-06: a pure, unit-tested core in `src/lib/map-search.ts` built on `note-search.ts`; a render-oriented island whose state lives in hooks (lesson "Extract island fetch/state logic into hooks"); one e2e scenario for the browser-only behavior (debounce, viewport moves, Back restore). `MemoryMap` is split into an outer component that wraps `ReactFlowProvider` and an inner canvas component, so the inner one (and the new `useMapSearchFocus` hook) can use `useReactFlow` and `useNodesInitialized`. The `found` flag is derived at render time from the applied query, never written back into the node state, so dragging and click handling are untouched.

## Critical Implementation Details

- **Timing & lifecycle**: the initial `?q=` framing must run after React Flow's built-in `fitView` on load, or the built-in fit overrides it. Gate the viewport move on `useNodesInitialized()` and check in the browser that a reload with `?q=` ends centered; if the built-in fit still wins, defer the first move by one animation frame. Each search run moves the viewport at most once (track the last handled run in a ref); the initial `?q=` counts as a run.
- **Keyboard focus pan**: React Flow nodes are focusable and `autoPanOnNodeFocus` is on by default, so Tab from the search field onto an off-screen node pans the map to it. That is React Flow's keyboard a11y behavior, not a search move; it stays enabled.
- **User experience spec**: the gold marking must not use gold text. Gold text on the hover background is 4.17:1 and fails AA; the ring/border is a non-text indicator (6:1 on the card).

## Phase 1: Map search logic

### Overview

Pure functions and constants for map search, test-first, with no React or React Flow dependency.

### Changes Required:

#### 1. Map search module

**File**: `src/lib/map-search.ts` (new)

**Intent**: Decide which notes match and what kind of viewport move a result calls for, reusing the dashboard matcher so both pages match identically.

**Contract**:
- Constants: `MAP_SEARCH_MIN_CENTER_ZOOM = 1`, `MAP_SEARCH_FIT_MAX_ZOOM = 1`, `MAP_SEARCH_ANIMATION_MS = 300`, `MAP_SEARCH_FIT_PADDING` (a fitView padding fraction, e.g. 0.2).
- `findMatchingNoteIds(notes: readonly { id: string; name: string }[], query: string): string[]` — ids of notes whose name matches via `matchesNoteName`, in input order; a normalized-empty query returns `[]`.
- `mapSearchOutcome(query: string, matchingIds: readonly string[])` returns a discriminated union: `{ kind: "idle" }` (normalized query empty), `{ kind: "none" }`, `{ kind: "one"; id: string }`, `{ kind: "many"; ids: string[] }`.
- `centerZoom(currentZoom: number): number` = `max(currentZoom, MAP_SEARCH_MIN_CENTER_ZOOM)`.

#### 2. Unit tests

**File**: `src/lib/map-search.test.ts` (new)

**Intent**: Pin the matching and outcome rules before the island uses them.

**Contract**: covers empty and whitespace-only query → `[]` and `idle`; case-insensitive substring match; no match → `none`; exactly one → `one` with that id; several → `many` with ids in input order; a query matching every note → `many`; `centerZoom` below, equal to and above 1.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for confirmation before proceeding to the next phase.

---

## Phase 2: Search on the map

### Overview

Wire the search into the map: search run counter, provider split, search field and status line, viewport moves, gold marking, `?q=` read on the page.

### Changes Required:

#### 1. Search run counter

**File**: `src/components/hooks/useNoteSearch.ts`

**Intent**: Let the map react to an explicit Enter even when the text is unchanged, without changing the dashboard's behavior.

**Contract**: result gains `searchRun: number` (starts at 0). It increments on every Enter, and on a debounce or blur trigger only when the normalized text differs from the current applied query. Existing fields and `?q=` sync are unchanged; `NotesBrowser` does not use `searchRun`.

#### 2. Map search focus hook

**File**: `src/components/hooks/useMapSearchFocus.ts` (new)

**Intent**: Move the viewport for each search run according to its outcome; keeps viewport logic out of the render component.

**Contract**: `useMapSearchFocus(outcome, searchRun, hasInitialQuery)`; must be called under `ReactFlowProvider`. For `one`: `setCenter` on the node's current center (`nodeCenter(getInternalNode(id))`, reusing the helper from `StraightEdge.tsx:13-18`, exported from there or moved next to `MAP_NODE_*` in `src/lib/memory-map-layout.ts`; no second copy of the math) with `zoom: centerZoom(getZoom())`, `duration: MAP_SEARCH_ANIMATION_MS`. For `many`: `fitView({ nodes: ids.map(id => ({ id })), maxZoom: MAP_SEARCH_FIT_MAX_ZOOM, padding: MAP_SEARCH_FIT_PADDING, duration: MAP_SEARCH_ANIMATION_MS })`. `none` and `idle`: no viewport call. Runs only once nodes are initialized; each run handled at most once; the initial `?q=` counts as a run (see Critical Implementation Details).

#### 3. Memory map island

**File**: `src/components/memory-map/MemoryMap.tsx`

**Intent**: Add the search field and status line above the canvas and derive the found marking, keeping the existing read-only graph and click navigation intact.

**Contract**:
- Props gain `initialQuery: string`.
- Outer `MemoryMap` wraps an inner canvas component in `ReactFlowProvider`; the default export stays `MemoryMap`.
- Search field: `Input type="search"` wired to `useNoteSearch(initialQuery)`, `aria-label`/`placeholder` `MESSAGES.NOTES_SEARCH_LABEL`, styled like `NotesBrowser`.
- Status line: `role="status" aria-live="polite"`, shows `MESSAGES.NO_NOTES_FOUND` in `text-muted-foreground` only for outcome `none`.
- Matching ids via `findMatchingNoteIds(props.notes, appliedQuery)`, memoized; nodes passed to `<ReactFlow>` are derived from the `useNodesState` nodes with `data.found` set from that set (state nodes are not rewritten, so dragging keeps working).
- The island renders, in order: search field, status line, then the bordered canvas frame (`h-[70vh] overflow-hidden rounded-xl border border-input bg-background`, moved here from the page). All existing `<ReactFlow>` props, including `onNodeClick` navigation, are unchanged.

#### 4. Found marking on nodes

**File**: `src/components/memory-map/NoteNode.tsx`

**Intent**: Show found nodes in gold without gold text.

**Contract**: `NoteNodeData` gains `found?: boolean`. When true the root gets `border-primary ring-2 ring-primary` (via `cn`, semantic tokens only) and `data-found="true"`; name stays `text-foreground`; hover behavior and handles unchanged.

#### 5. Map page

**File**: `src/pages/campaigns/[campaignId]/map.astro`

**Intent**: Restore a search from the URL on load and Back.

**Contract**: reads `normalizeQuery(Astro.url.searchParams.get(NOTE_SEARCH_PARAM))` and passes it as `initialQuery` to `MemoryMap`; the page's `h-[70vh]` wrapper div is removed (the island owns the frame) and the "Loading map…" fallback slot gets the same frame classes so the layout doesn't jump on hydration; empty state, "no connections" hint and fallback unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Existing e2e suite still passes, including the map node click step: `npm run test:e2e`

#### Manual Verification:

- On the production preview, a single-match search centers the node (zooming in to 1 when zoomed out, not zooming out when zoomed in) and marks it in gold
- A multi-match search marks every match and fits them in view; a no-match search shows "No notes found." in muted text and the viewport stays
- Drag a node, pan away, press Enter on a search for it: the viewport re-centers on its new position
- A found node is clearly readable in normal and hover state (name stays parchment) and the gold ring is visible when zoomed out
- Clicking a found and a non-found node both open the note; Back returns with the search text, marks and framing restored

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: e2e scenario & docs

### Overview

Pin the browser-only behavior in CI and record the new contract surfaces.

### Changes Required:

#### 1. e2e scenario

**File**: `tests/e2e/map-search.spec.ts` (new)

**Intent**: Prove triggers, outcomes, viewport moves, Back restore and unchanged click navigation in a real browser.

**Contract**: follows `dashboard-search.spec.ts`: one `createTestUser` + `signInViaUi` (2 auth calls), notes seeded via the `create_note` RPC, literal oracles (`"No notes found."`, `"Search notes by name"`; never import `MESSAGES`). Steps:
- single match via Enter → that node has `data-found="true"`, no other node does, and (polled) its box center is within a small tolerance of the `.react-flow` container center;
- pan the pane away, press Enter again → re-centered (polled);
- multi match via typing and pausing → exactly the matching nodes are found and all lie within the container's bounds;
- no match via blur (`locator.blur()`, not Tab: Tab focuses the first node and React Flow's `autoPanOnNodeFocus` may pan to it) → "No notes found." visible, no found nodes, `.react-flow__viewport` transform unchanged (snapshot it after the previous fit animation settles);
- click a found node → note URL; `goBack()` → URL has `?q=`, input holds the text, the node is found and centered.

#### 2. Docs and contract surfaces

**Files**: `TESTING.md`, `CLAUDE.md`, `docs/reference/contract-surfaces.md`

**Intent**: Keep the test inventory and load-bearing names accurate.

**Contract**: `TESTING.md` and the `CLAUDE.md` `test:e2e` line list the map search scenario (`map-search.spec.ts`, 2 auth calls). In `contract-surfaces.md`, the `/campaigns/[campaignId]/map` route entry covers `?q=` read server-side, the `initialQuery` prop, the search field and the found marking (`data-found`); the dashboard-search entry names `src/lib/map-search.ts` as a consumer of `matchesNoteName` and `useNoteSearch`'s `searchRun`.

### Success Criteria:

#### Automated Verification:

- New scenario passes: `npm run test:e2e` (after `npm run build`, with local Supabase)
- Lint passes: `npm run lint`

#### Manual Verification:

- Docs read correctly and name the right files and auth-call count

---

## Testing Strategy

### Unit Tests:

- `src/lib/map-search.test.ts`: matching, empty query, outcome kinds, zoom rule (Phase 1).
- Existing `src/lib/note-search.test.ts` stays green (matcher unchanged).

### Integration Tests:

- None needed: no server, data or API change.

### End-to-end:

- `tests/e2e/map-search.spec.ts` (Phase 3); existing `notes-relations.spec.ts` map-click step guards FR-013.

### Manual Testing Steps:

1. `npm run build && npm run preview` (check for a running dev server first, per lessons), sign in, open a campaign map with 10+ notes.
2. Zoom out, search a unique name, press Enter: node centered, zoom 1, gold ring.
3. Search a shared prefix: all matches ringed and in view.
4. Search nonsense, Tab away: "No notes found.", viewport unchanged.
5. Hover a found node: name readable; click it: note opens; Back: search restored.

## Performance Considerations

Matching is a linear substring scan over the campaign's notes (same as the dashboard, ~500 notes is sub-millisecond); the viewport animation is 300 ms, within the PRD's ~300 ms responsiveness target for results (marks appear immediately). The derived nodes array is memoized on nodes + matching ids.

## Migration Notes

None. No schema, data or URL change; `?q=` on the map is additive.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-07)
- PRD: `context/foundation/prd-v2.md` (US-01, FR-005, FR-013, contrast and responsiveness targets)
- Similar implementation: `context/archive/2026-10-16-dashboard-grouping-search/plan.md`, `src/components/notes/NotesBrowser.tsx`, `tests/e2e/dashboard-search.spec.ts`
- Map code: `src/components/memory-map/MemoryMap.tsx`, `NoteNode.tsx`, `StraightEdge.tsx:13-18`
- React Flow viewport API: reactflow.dev `setCenter`, `fitView`, `useNodesInitialized`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Map search logic

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — 42f6c93
- [x] 1.2 Lint passes: `npm run lint` — 42f6c93
- [x] 1.3 Type check passes: `npx astro check` — 42f6c93

### Phase 2: Search on the map

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — cd5567c
- [x] 2.2 Lint passes: `npm run lint` — cd5567c
- [x] 2.3 Type check passes: `npx astro check` — cd5567c
- [x] 2.4 Production build succeeds: `npm run build` — cd5567c
- [x] 2.5 Existing e2e suite still passes, including the map node click step: `npm run test:e2e` — cd5567c

#### Manual

- [x] 2.6 On the production preview, a single-match search centers the node (zooming in to 1 when zoomed out, not zooming out when zoomed in) and marks it in gold — cd5567c
- [x] 2.7 A multi-match search marks every match and fits them in view; a no-match search shows "No notes found." in muted text and the viewport stays — cd5567c
- [x] 2.8 Drag a node, pan away, press Enter on a search for it: the viewport re-centers on its new position — cd5567c
- [x] 2.9 A found node is clearly readable in normal and hover state (name stays parchment) and the gold ring is visible when zoomed out — cd5567c
- [x] 2.10 Clicking a found and a non-found node both open the note; Back returns with the search text, marks and framing restored — cd5567c

### Phase 3: e2e scenario & docs

#### Automated

- [x] 3.1 New scenario passes: `npm run test:e2e` (after `npm run build`, with local Supabase) — 4b5ed36
- [x] 3.2 Lint passes: `npm run lint` — 4b5ed36

#### Manual

- [x] 3.3 Docs read correctly and name the right files and auth-call count — 4b5ed36
