# Memory-Map Search — Plan Brief

> Full plan: `context/changes/map-search/plan.md`

## What & Why

Roadmap S-07 (PRD v2 US-01, FR-005, FR-013): the user can find a note on the memory map by name, using the same search triggers as the dashboard. It completes US-01: the dashboard got search in S-06, the map has none.

## Starting Point

`MemoryMap.tsx` renders a read-only React Flow graph (one-shot layout, click a node to open the note) with no search and no `ReactFlowProvider`. S-06 left a reusable trigger hook (`useNoteSearch`, with `?q=` sync), the matcher (`matchesNoteName`) and the `NO_NOTES_FOUND` / `NOTES_SEARCH_LABEL` messages.

## Desired End State

A search field above the map. One match: the node is ringed in gold and the viewport centers on it, zooming in to at least 1. Several matches: all ringed in gold and the viewport fits them (zoom capped at 1). No match: neutral "No notes found.", viewport stays. Enter re-centers even with unchanged text; `?q=` restores the search on reload and Back. Clicking nodes still opens notes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Single match | Center **and** mark gold | One consistent "found" signal, even in a dense cluster. |
| Zoom when centering | `max(current zoom, 1)`, 300 ms animation | Found node is always readable; a zoomed-in user is never zoomed out. |
| Several matches | Mark all + fit viewport to them (max zoom 1) | Marks on off-screen nodes would otherwise be invisible. |
| Re-search with same text | Enter always re-runs the move; pause/blur only on changed text | Enter works as "take me there again"; dashboard semantics unchanged. |
| Persistence | Reuse `?q=`; re-apply after nodes are measured | Back from a found note returns to the same search, like S-06. |
| Marking style | Gold border + ring, name text stays parchment, `data-found` | Gold text on the hover background is 4.17:1 (fails AA); the ring is 6:1 on the card, so no new token is needed. |
| Tests | Unit tests for pure logic + one e2e scenario | Same split that worked for S-06. |

## Scope

**In scope:**
- `src/lib/map-search.ts` (matching ids, outcome kinds, zoom rule, constants) + unit tests
- `searchRun` counter in `useNoteSearch`; new `useMapSearchFocus` hook
- `MemoryMap` provider split, search field, status line, derived `found` flag; `NoteNode` gold ring; `map.astro` reads `?q=`
- `tests/e2e/map-search.spec.ts`; `TESTING.md`, `CLAUDE.md`, `contract-surfaces.md` updates

**Out of scope:**
- Server-side or content search, relation-detection changes, API/schema changes
- Edge highlighting, dimming non-matches, match counts, "Found" badges
- Persisting manual pan/zoom or dragged positions; shared query between dashboard and map; mobile layout

## Architecture / Approach

`map.astro` reads `?q=` and passes `initialQuery` to the `client:only` `MemoryMap` island. The island wraps an inner canvas in `ReactFlowProvider`; `useNoteSearch` owns the text, triggers and URL; `findMatchingNoteIds` + `mapSearchOutcome` (pure) classify the result; the `found` flag is derived onto the rendered nodes (state nodes untouched, so dragging and click navigation are unchanged); `useMapSearchFocus` calls `setCenter` / `fitView` once per search run after `useNodesInitialized()`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Map search logic | Pure `map-search.ts` + unit tests (TDD-able) | Empty query accidentally matching every node |
| 2. Search on the map | Hook counter, provider split, field/status, viewport moves, gold ring, `?q=` | Built-in `fitView` on load overriding the initial `?q=` framing |
| 3. e2e scenario & docs | CI scenario for triggers, viewport, Back restore; docs | Flaky viewport assertions during the 300 ms animation (poll) |

**Prerequisites:** S-06 done (it is); local Supabase + `npm run build` for e2e.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Ordering of React Flow's initial `fitView` vs the first search move; mitigated by gating on `useNodesInitialized` and a one-frame defer if needed.
- With React Flow's default `minZoom` 0.5, a fit over very spread-out matches may leave some at the edge (accepted).
- e2e adds 2 auth calls against the local `sign_in_sign_ups` limit.

## Success Criteria (Summary)

- A user types part of a note's name on the map and is taken to it (one match) or sees all matches ringed in gold and in view.
- No match gives a neutral message and leaves the map where it was.
- Clicking nodes still opens notes, and Back restores the search.
