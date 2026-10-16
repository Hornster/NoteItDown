# Dashboard Grouping & Search Implementation Plan

## Overview

Roadmap slice S-06 (north star of M-2): replace the flat note list on the campaign dashboard with notes grouped by type (groups A–Z, collapsed, expanding to notes A–Z) and a case-insensitive name search that runs on a 300 ms pause, on Enter, or on blur when the text changed. Groups are filtered in place while searching. PRD refs: US-01, FR-003, FR-004, FR-011.

## Current State Analysis

- The dashboard is `src/pages/campaigns/[campaignId]/index.astro`; `/dashboard` (`src/pages/dashboard.ts`) only redirects there. Notes render as a flat server-side `<ul>` ordered by `created_at desc` (`index.astro:80-92`), each row a link to the note with an outline type badge.
- `listNotes` (`src/lib/services/notes.ts:78-99`) already returns `NoteListItem { id, name, type_name, created_at }` (`src/types.ts:91-96`). No data or API change is needed.
- Schema guarantees (`supabase/migrations/20260922120000_campaign_notes_schema.sql`): `notes.type_id` is `NOT NULL` (no type-less notes), note names and type names are unique per campaign case-insensitively (`lower(name)` unique indexes), trimmed and non-empty; note names ≤ 120 chars. Note types have no UPDATE/DELETE policy, so type names are stable.
- Every other entry point stays outside the list: Rename link, Memory map and New note buttons, `RelationChangeNotice` (delete notice) and the empty-state CTA (`index.astro:42-78`), plus the Topbar campaign switcher.
- Unit tests run in Vitest with `environment: "node"` and no React Testing Library (`vitest.config.ts`); pure logic lives in `src/lib/*.ts` with sibling `*.test.ts`. Browser-storage logic takes a `Storage` parameter so it is unit-testable (`takeRelationNotice(window.sessionStorage, …)` in `src/lib/relation-notice.ts`, used by `RelationChangeNotice.tsx:50`; `sessionStorageOrNull()` guard in `src/components/hooks/useSaveNote.ts:15`).
- No existing test depends on the list markup: e2e (`tests/e2e/notes-relations.spec.ts`, `auth-session.spec.ts`), screenshots (`tests/e2e/screenshots/theme.shot.ts`), `scripts/smoke.mjs` and `tests/http/*` only open `/dashboard`, `/campaigns/<id>` and note URLs directly.

## Desired End State

On `/campaigns/<id>` with notes, the user sees a search field and one collapsible group per note type present in the campaign, groups sorted A–Z, each collapsed, showing the type name and note count. Clicking a group header expands it to its notes sorted A–Z; each note links to its page. Typing part of a name and pausing 300 ms, pressing Enter, or leaving the field after changing the text filters groups in place: non-matching groups disappear, matching groups open and show only matching notes; with no match a neutral "No notes found." message appears. The active query lives in `?q=`; the groups the user opened by hand live in sessionStorage per campaign — so Back from a note and reload restore both. Clearing the search restores the pre-search browse state. Empty campaigns still show the existing "No notes yet." block. Verified by unit tests, one e2e scenario in CI and the manual checks below.

### Key Discoveries:

- `src/pages/campaigns/[campaignId]/index.astro:80-92` — the only code being replaced; header buttons and notice above it stay.
- `src/lib/relation-notice.ts` + `RelationChangeNotice.tsx:50` — pattern for storage-backed state: pure functions taking `Storage`, island reads after mount.
- `src/components/hooks/useSaveNote.ts:15` — `sessionStorageOrNull()` guard (`window.sessionStorage` itself throws when site data is blocked).
- `src/layouts/Layout.astro:16` — `<html lang="en">`; the sort locale is pinned to match.
- `tests/e2e/notes-relations.spec.ts:10` — e2e specs document their auth-call count (local `sign_in_sign_ups = 50` rate limit, `supabase/config.toml:191`).
- `src/components/campaigns/CampaignSwitcher.tsx:27` — switching campaigns navigates to a fresh path, so `?q=` is naturally dropped on switch.
- Deliberate departure from PRD FR-003 (`prd-v2.md:120-121`, "Clearing the search restores the collapsed view"): clearing restores the pre-search browse set. That set starts empty, so the view is fully collapsed unless the user opened groups by hand before searching; those stay open so a search doesn't throw away the user's own layout. Decided in planning (brief: "Expansion during search").

## What We're NOT Doing

- No server-side search, pagination or new API route — all filtering is client-side over the server-rendered list (typical campaign: up to ~500 notes).
- No search inside note content; no change to relation detection. `note-search.ts` must not import from, or be imported by, relation-detection code (PRD Domain Rules).
- No memory-map search (S-07); it will reuse `note-search.ts` and `MESSAGES.NO_NOTES_FOUND`.
- No persistence of the search-time expansion state (groups toggled while a query is active) — it is throwaway.
- No React Testing Library / jsdom test project.
- No mobile layout work (parked).
- No change to note ordering anywhere else (map, API).

## Implementation Approach

A pure module (`src/lib/note-search.ts`) owns grouping, sorting, matching, the blur rule, the `?q=` parameter and the expansion-storage read/write, all unit-tested. A React island (`NotesBrowser`, `client:load`) renders the grouped list from props; two hooks hold its state: `useNoteSearch` (input text, applied query, debounce/Enter/blur triggers, URL sync) and `useGroupExpansion` (browse set persisted in sessionStorage, throwaway search set). The Astro page reads `?q=` and passes it as the initial query, so the server already renders filtered results for a query — only the hand-expanded groups appear after hydration (a brief collapsed→expanded flash on Back, accepted in planning). One Playwright scenario pins the real-browser behavior.

## Critical Implementation Details

**Hydration-safe sorting.** Sorting runs on the server (workerd) and again in the browser; an unpinned `Intl.Collator()` would use each runtime's default locale and could reorder groups between SSR and hydration (React hydration mismatch). Pin the locale to `"en"` (matches `<html lang="en">`); with `sensitivity: "base"` and `numeric: true`. Names that compare equal at base strength (e.g. `Łucznik` / `Lucznik`) need a deterministic tiebreak: a variant-strength comparison, then `id`.

**Storage read after mount.** Read the browse expansion set from sessionStorage in an effect, never during render, so the server HTML (all collapsed, or query-expanded) matches the first client render.

**URL sync preserves other state.** Mirror the applied query with `history.replaceState` (never `pushState`, so typing doesn't create history entries), editing only the `q` parameter of the current URL and keeping other params and the hash; an empty query removes `q`.

**State sequencing on query change.** When the applied query changes to a non-empty value, reset the search expansion set to "all matching groups expanded"; toggles during the search affect only that set. When the applied query becomes empty, render the browse set again (unchanged by anything done during the search).

## Phase 1: Search & grouping core

### Overview

Pure, unit-tested logic for everything the island and S-07 need, with no React or DOM dependency.

### Changes Required:

#### 1. Note search module

**File**: `src/lib/note-search.ts`

**Intent**: One home for dashboard (and later map) search rules: how notes group and sort, what a match is, when blur re-runs a search, and how the URL query and stored expansion state are read and written.

**Contract**:
- Constants: `NOTE_SEARCH_DEBOUNCE_MS = 300`, `NOTE_SEARCH_PARAM = "q"`, `NOTE_SORT_LOCALE = "en"`.
- `normalizeQuery(raw: string | null | undefined): string` — trims; nullish → `""`. A whitespace-only query is empty (= no search).
- `matchesNoteName(name: string, query: string): boolean` — case-insensitive substring on the name (`toLowerCase` on both; locale-independent); empty normalized query matches everything.
- `compareNames(a: string, b: string): number` — `Intl.Collator(NOTE_SORT_LOCALE, { sensitivity: "base", numeric: true })`, ties broken by a variant-strength collator (callers add `id` as the final tiebreak).
- `interface NoteGroup { typeName: string; notes: NoteListItem[] }` (exported from `src/types.ts`).
- `groupNotesByType(notes: NoteListItem[]): NoteGroup[]` — one group per distinct `type_name`; groups and notes sorted with `compareNames` (notes tie → `id`).
- `filterNoteGroups(groups: NoteGroup[], query: string): NoteGroup[]` — empty query → input unchanged; otherwise only matching notes, groups without matches dropped, order preserved.
- `shouldSearchOnBlur(input: string, appliedQuery: string): boolean` — true only when the normalized values differ.
- `expandedGroupsStorageKey(campaignId: string): string` → `noteitdown:dashboard-expanded:<campaignId>`.
- `readExpandedGroups(storage: Storage | null, campaignId: string): Set<string>` — tolerant: missing key, invalid JSON, non-array or non-string entries, or a throwing storage → empty set.
- `writeExpandedGroups(storage: Storage | null, campaignId: string, typeNames: Iterable<string>): void` — swallows storage errors; an empty set removes the key.

#### 2. Unit tests

**File**: `src/lib/note-search.test.ts`

**Intent**: Pin every rule above, including the undefined-term decisions from planning.

**Contract**: Cases at minimum: grouping across types; groups and notes A–Z ignoring case (`zeta`, `Alpha`, `Beta`, `Łucznik` → `Alpha, Beta, Łucznik, zeta`); numeric order (`Goblin 2` before `Goblin 10`); base-equal tie is deterministic; substring match in the middle of a name and case-insensitive (`gob` matches `Hobgoblin Chief`); whitespace-only query = no filter; filter drops empty groups and keeps order; blur rule (`"gob"` vs `" gob "` → false, `"gob"` vs `"gobl"` → true); storage read/write round trip with a fake `Storage`, corrupt JSON, wrong shapes, throwing storage, `null` storage; a 500-note list groups and filters correctly.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- `note-search.ts` is independent of relation detection (SQL in `supabase/migrations/20260926120000_relation_detection.sql`) and of `src/lib/relation-notice.ts`: no shared matcher, no imports either way

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Grouped dashboard island

### Overview

Replace the flat list with the `NotesBrowser` island and its two hooks; wire the page and add the copy keys.

### Changes Required:

#### 1. Messages

**File**: `src/lib/constants/messages.ts`

**Intent**: Follow the dictionary rule (`lessons.md`): the no-match notice is always a key; the search label is used twice (aria-label + placeholder).

**Contract**: Add `NO_NOTES_FOUND: "No notes found."` and `NOTES_SEARCH_LABEL: "Search notes by name"`. A group's count badge is a number, not copy. Any other repeated string introduced follows the same 2+ rule.

#### 2. Search hook

**File**: `src/components/hooks/useNoteSearch.ts`

**Intent**: Own the input text and the applied query and implement the three PRD triggers plus URL sync.

**Contract**: `useNoteSearch(initialQuery: string)` → `{ input, appliedQuery, onInputChange, onKeyDown, onBlur }`.
- Typing updates `input` and (re)starts a `NOTE_SEARCH_DEBOUNCE_MS` timer that applies `normalizeQuery(input)`; timer cleared on unmount.
- Enter applies immediately, cancels the pending timer, and does not submit any form.
- Blur applies only when `shouldSearchOnBlur(input, appliedQuery)` — clicking a note right after a search does not re-run it. Any blur clears the pending timer, so a blur-apply is never followed by a redundant debounce apply. Accepted edge case: typing and then clicking a visible note within 300 ms applies the new query on mousedown, which can re-render the list before the click lands. Revisit only if the manual check shows it.
- Clearing the field (incl. the native `type="search"` clear button) applies `""` via the same debounce path.
- Each change of `appliedQuery` is mirrored to `?q=` with `history.replaceState` (see Critical Implementation Details).

#### 3. Expansion hook

**File**: `src/components/hooks/useGroupExpansion.ts`

**Intent**: Keep the user's hand-opened groups across navigation and keep search-time toggling separate from them.

**Contract**: `useGroupExpansion(campaignId: string, appliedQuery: string, matchingTypeNames: string[])` → `{ isExpanded(typeName), toggle(typeName) }`.
- Browse set: starts empty, loaded once after mount via `readExpandedGroups(sessionStorageOrNull(), campaignId)`, written via `writeExpandedGroups` on every browse toggle. Stale names (no longer present) are harmless.
- Search set: when `appliedQuery` becomes non-empty or changes, reset to `matchingTypeNames`; `toggle` while searching edits only this set; never persisted. Derive the reset during render, not in an effect: hold `{ query, expanded }` state and replace it when `query !== appliedQuery` (React's "adjust state when a prop changes" pattern). Read `matchingTypeNames` (from the memoized filtered groups) only on that reset and never use it as an effect dependency, so the new query's first render is already expanded and toggles made during the search survive re-renders.
- `appliedQuery === ""` → browse set governs. Initial render with a non-empty `initialQuery` already treats matching groups as expanded (matches SSR).
- Move `sessionStorageOrNull()` out of `useSaveNote.ts` into a shared spot (e.g. `src/lib/browser-storage.ts`) and import it in both places rather than duplicating it.

#### 4. Notes browser island

**File**: `src/components/notes/NotesBrowser.tsx`

**Intent**: Render the search field, the no-match notice and the grouped, collapsible list; contains no fetch or state logic beyond calling the hooks and `useMemo` over `note-search.ts`.

**Contract**: Props `{ campaignId: string; notes: NoteListItem[]; initialQuery: string }`.
- Search: `<input type="search">` with `aria-label` and `placeholder` = `MESSAGES.NOTES_SEARCH_LABEL`, using the `Input` primitive (`src/components/ui/input.tsx`).
- No match (non-empty applied query, zero groups): `MESSAGES.NO_NOTES_FOUND` in muted parchment text (`text-muted-foreground`, not destructive), inside a `role="status"` / `aria-live="polite"` region. Outside the no-match state the region holds no `<p>`: after a delete, `tests/e2e/notes-relations.spec.ts:51` counts `getByRole("status").locator("p")` on this page for the delete notice.
- Each group: a `<button type="button">` header with `aria-expanded` and `aria-controls` pointing to its panel, showing the type name and the (filtered) note count via `badgeVariants({ variant: "outline" })` plus a chevron; the panel lists notes as links to `/campaigns/<campaignId>/notes/<id>`, keeping today's row styling (`border border-input bg-background … hover:bg-accent`).
- Colors only through tokens / UI primitives (`theme-guard.test.ts`), classes merged with `cn()`.

#### 5. Dashboard page

**File**: `src/pages/campaigns/[campaignId]/index.astro`

**Intent**: Swap the flat `<ul>` for the island; keep everything else.

**Contract**: Compute `initialQuery = normalizeQuery(Astro.url.searchParams.get(NOTE_SEARCH_PARAM))`; when `notes.length > 0` render `<NotesBrowser client:load campaignId={campaign.id} notes={notes} initialQuery={initialQuery} />` in place of `index.astro:80-92`. The empty-state block, header actions, Rename link and `RelationChangeNotice` stay unchanged; the search field is not shown for an empty campaign. Drop the now-unused `badgeVariants` import if nothing else uses it.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. theme guard): `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Existing e2e scenarios still pass: `npm run test:e2e`
- Route-guard and forged-id matrix still pass: `npm run test:http`

#### Manual Verification:

- Dashboard shows groups A–Z, all collapsed, each with type name and count; clicking expands to notes A–Z, clicking again collapses
- Pause, Enter and blur-after-change each run the search; blur without a change (e.g. clicking a note) does not re-run it; no match shows the neutral "No notes found." text
- Search → open a note → Back restores the query, its results and the groups opened by hand before the search; reload does the same
- Clearing the search restores the pre-search browse expansion; toggles made during the search are forgotten
- Open, create, edit, delete note, rename campaign, memory map and campaign switching all still reachable; delete notice still shows on the dashboard
- No hydration warning in the browser console on load with and without `?q=`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: e2e scenario & docs

### Overview

Pin the browser-only behavior (debounce, history, sessionStorage, hydration) in CI and record the new names.

### Changes Required:

#### 1. Dashboard e2e spec

**File**: `tests/e2e/dashboard-search.spec.ts`

**Intent**: One scenario covering the risky real-browser paths of S-06.

**Contract**: Auth calls: 2 (1 `createTestUser` signUp + 1 UI signin via `signInViaUi`) — state it in a header comment like `notes-relations.spec.ts:10`. Seed ~6 notes across ≥ 2 predefined types through the test user's Supabase client (`rpc("create_note", …)`), not the UI. Steps: groups visible, collapsed, in A–Z order; expand a group → notes A–Z; type a partial lower-case name + Enter → only matching groups/notes visible and expanded, URL has `?q=`; type a non-matching query and wait for the debounce → literal "No notes found." visible (oracle stays literal, never imports `MESSAGES`); clear, open a group by hand, search, open a matching note, `goBack()` → query, results and (after clearing) the hand-opened group restored. Use `waitForHydration` from `tests/e2e/support/hydration.ts`, hooked on a group header button. Its `buttonName` is a string, and Playwright's default name match is a case-insensitive substring, so pass the type name (e.g. `"Place"`), which still matches when the count is in the label. Choose a type name that appears in no other button on the page. Optional: in `tests/e2e/screenshots/theme.shot.ts` (dashboard shot, :155-160), expand one group before `shoot` so the S-06 screenshot check (3.5) shows note rows.

#### 2. Docs

**Files**: `TESTING.md`, `CLAUDE.md`, `docs/reference/contract-surfaces.md`

**Intent**: Keep the command reference and the load-bearing names registry accurate.

**Contract**: `TESTING.md` and the `npm run test:e2e` line in `CLAUDE.md` list the dashboard grouping/search scenario. `contract-surfaces.md` changes:
- "Session storage": add `noteitdown:dashboard-expanded:<campaignId>` (`src/lib/note-search.ts`, `expandedGroupsStorageKey`): JSON array of type names, the browse-mode groups opened by hand; tolerant read, storage errors swallowed.
- "Routes": rewrite the `/campaigns/[campaignId]` entry. The flat list is replaced by the `NotesBrowser` island (`client:load`, props `campaignId`, `notes`, `initialQuery`), and the page reads `?q=` server-side via `normalizeQuery`. The `RelationChangeNotice` island, the empty state and the header actions are unchanged.
- "Shared TypeScript types": add `NoteGroup` (`{ typeName; notes: NoteListItem[] }`).
- New "Dashboard search" entry, only for the `?q=` parameter (`NOTE_SEARCH_PARAM`, mirrored with `replaceState`) and `src/lib/note-search.ts` as the shared matcher S-07 reuses.

### Success Criteria:

#### Automated Verification:

- New e2e scenario passes with the existing ones: `npm run test:e2e`
- Lint passes: `npm run lint`
- Full default suite passes: `npm test`

#### Manual Verification:

- With a campaign of ~500 notes, results update within ~300 ms after the search triggers (Enter) and expanding a group feels instant
- Optional: `SHOT_LABEL=s06 npm run test:screenshots` dashboard shot looks right against the D&D theme

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/lib/note-search.test.ts`: grouping, A–Z collation (case, Polish letters, numeric), deterministic ties, substring matching, empty/whitespace query, filter dropping empty groups, blur rule, storage round trip and corruption tolerance, 500-note list.
- Existing `src/styles/theme-guard.test.ts` covers the new component's color usage.

### Integration Tests:

- None new — no data or API change. `npm run test:http` and the existing e2e scenarios confirm no regression in routing and isolation.
- `tests/e2e/dashboard-search.spec.ts`: grouped/collapsed view, expand, Enter and debounce triggers, no-match message, Back restores query + hand-opened groups.

### Manual Testing Steps:

1. Open a campaign with notes of several types; check group order, collapsed state and counts.
2. Type `gob`, wait; press Enter on another query; type a third and tab out of the field; then click into the field and out again without typing — results do not reshuffle.
3. Search, open a note, press Back; reload; switch campaign and back.
4. Clear the search; confirm the hand-opened groups return.
5. Delete a note; confirm the delete notice still appears and the note is gone from its group.
6. Seed ~500 notes and time Enter → results.

## Performance Considerations

Filtering 500 names with a lowercase substring check and re-grouping is sub-millisecond; memoize grouped data on `notes` and the filtered view on `appliedQuery`. The ~300 ms budget is dominated by the debounce, which starts only after typing stops; Enter and blur apply immediately. Initial HTML grows linearly with note count (all notes rendered, collapsed panels included) — acceptable at ~500 notes.

## Migration Notes

None — no schema, API or stored-data change. Old bookmarks of `/dashboard` and `/campaigns/<id>` keep working; `?q=` is optional.

## References

- Roadmap: `context/foundation/roadmap.md` (S-06)
- PRD: `context/foundation/prd-v2.md` (US-01, FR-003, FR-004, FR-011, Search responsiveness)
- Current list: `src/pages/campaigns/[campaignId]/index.astro:80-92`
- Storage-backed island pattern: `src/lib/relation-notice.ts`, `src/components/notes/RelationChangeNotice.tsx:50`
- e2e conventions: `tests/e2e/notes-relations.spec.ts`, `tests/e2e/support/ui-flows.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Search & grouping core

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit` — d2037b4
- [x] 1.2 Lint passes: `npm run lint` — d2037b4
- [x] 1.3 Type check passes: `npx astro check` — d2037b4

#### Manual

- [x] 1.4 `note-search.ts` is independent of relation detection (SQL in `supabase/migrations/20260926120000_relation_detection.sql`) and of `src/lib/relation-notice.ts`: no shared matcher, no imports either way — d2037b4

### Phase 2: Grouped dashboard island

#### Automated

- [x] 2.1 Unit tests pass (incl. theme guard): `npm run test:unit` — cf02fe1
- [x] 2.2 Lint passes: `npm run lint` — cf02fe1
- [x] 2.3 Type check passes: `npx astro check` — cf02fe1
- [x] 2.4 Production build succeeds: `npm run build` — cf02fe1
- [x] 2.5 Existing e2e scenarios still pass: `npm run test:e2e` — cf02fe1
- [x] 2.6 Route-guard and forged-id matrix still pass: `npm run test:http` — cf02fe1

#### Manual

- [x] 2.7 Dashboard shows groups A–Z, all collapsed, each with type name and count; clicking expands to notes A–Z, clicking again collapses — cf02fe1
- [x] 2.8 Pause, Enter and blur-after-change each run the search; blur without a change (e.g. clicking a note) does not re-run it; no match shows the neutral "No notes found." text — cf02fe1
- [x] 2.9 Search → open a note → Back restores the query, its results and the groups opened by hand before the search; reload does the same — cf02fe1
- [x] 2.10 Clearing the search restores the pre-search browse expansion; toggles made during the search are forgotten — cf02fe1
- [x] 2.11 Open, create, edit, delete note, rename campaign, memory map and campaign switching all still reachable; delete notice still shows on the dashboard — cf02fe1
- [x] 2.12 No hydration warning in the browser console on load with and without `?q=` — cf02fe1

### Phase 3: e2e scenario & docs

#### Automated

- [x] 3.1 New e2e scenario passes with the existing ones: `npm run test:e2e` — c6d8149
- [x] 3.2 Lint passes: `npm run lint` — c6d8149
- [x] 3.3 Full default suite passes: `npm test` — c6d8149

#### Manual

- [x] 3.4 With a campaign of ~500 notes, results update within ~300 ms after the search triggers (Enter) and expanding a group feels instant (verified manually by the user; confirmed in impl-review 2026-10-16) — c6d8149
- [x] 3.5 Optional: `SHOT_LABEL=s06 npm run test:screenshots` dashboard shot looks right against the D&D theme — c6d8149
