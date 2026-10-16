# Dashboard Grouping & Search — Plan Brief

> Full plan: `context/changes/dashboard-grouping-search/plan.md`

## What & Why

Roadmap S-06, the M-2 north star: the user can find a note on the D&D-themed dashboard. Notes are grouped by type (groups A–Z, collapsed, expanding to notes A–Z) and a case-insensitive name search filters the groups in place (PRD US-01, FR-003, FR-004, FR-011).

## Starting Point

`/campaigns/<id>` renders a flat server-side list ordered by creation date (`index.astro:80-92`). `listNotes` already returns each note's type name, so no data or API change is needed, and no existing test depends on the list markup.

## Desired End State

The dashboard shows a search field and collapsible type groups with counts. Searching (300 ms pause, Enter, or blur when the text changed) hides non-matching groups and opens matching ones showing only matches; no match shows a neutral "No notes found.". Back from a note or a reload restores the query (`?q=`) and the groups the user opened by hand (sessionStorage); clearing the search restores the pre-search view. Every existing entry point still works.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Typical campaign size | Up to ~500 notes, filtered client-side | Sub-millisecond filtering keeps the ~300 ms target with no new API. |
| "A–Z" | `Intl.Collator("en", base, numeric)`, ties → variant → id | Human order (Łucznik before zeta, Goblin 2 before Goblin 10); pinned locale avoids SSR/hydration mismatch. |
| "Short pause" | 300 ms debounce; Enter immediate; blur only if text changed | Live feel without filtering per keystroke; clicking a note doesn't reshuffle. |
| Back navigation | `?q=` (replaceState) + hand-opened groups in sessionStorage per campaign | Back/reload restore exactly what the user saw; brief expand flash after hydration accepted. |
| Expansion during search | Toggleable but throwaway; clearing restores the browse set | Long result lists stay manageable and the user's own opened groups survive a search. |
| No match | Neutral "No notes found." (`MESSAGES.NO_NOTES_FOUND`) | Mirrors the PRD map rule; S-07 reuses the key. |
| Tests | Unit tests for pure logic + one e2e scenario | Logic pinned cheaply; debounce/history/storage get one real-browser check in CI. |

## Scope

**In scope:**
- `src/lib/note-search.ts` (grouping, collation, matching, blur rule, `?q=`, expansion storage) + unit tests
- `NotesBrowser` island, `useNoteSearch` and `useGroupExpansion` hooks, two `MESSAGES` keys
- Dashboard page wiring with server-rendered initial query
- `tests/e2e/dashboard-search.spec.ts`; `TESTING.md`, `CLAUDE.md`, `contract-surfaces.md` updates

**Out of scope:**
- Server-side search, pagination, content search, relation-detection changes
- Memory-map search (S-07), persisting search-time toggles, RTL/jsdom tests, mobile layout

## Architecture / Approach

The Astro page reads `?q=` and passes notes + initial query to a `client:load` React island, so the server already renders filtered results. The island is render-only: it memoizes `groupNotesByType`/`filterNoteGroups` from `note-search.ts` and delegates state to `useNoteSearch` (input, applied query, triggers, URL sync) and `useGroupExpansion` (browse set from sessionStorage read after mount, throwaway search set). Search code stays separate from relation detection.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Search & grouping core | Pure `note-search.ts` + unit tests (TDD-able) | Collation ties / locale differences |
| 2. Grouped dashboard island | `NotesBrowser`, two hooks, page wiring, copy keys | Hydration mismatch; losing an existing entry point |
| 3. e2e scenario & docs | CI scenario for triggers + Back restore; docs and contract names | e2e flakiness around debounce timing |

**Prerequisites:** S-05 done (it is); local Supabase + `npm run build` for e2e/http.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- workerd and Chromium produce the same `Intl.Collator("en")` order; verified by the "no hydration warning" manual check.
- Brief collapsed→expanded flash on Back when groups were opened by hand (accepted).
- e2e adds 2 auth calls against the local `sign_in_sign_ups = 50` limit.

## Success Criteria (Summary)

- A user finds a note by typing part of its name and sees only matching, expanded groups.
- Back from a note returns to the same search and opened groups.
- All existing note/campaign entry points and tests keep working; results update within ~300 ms for ~500 notes.
