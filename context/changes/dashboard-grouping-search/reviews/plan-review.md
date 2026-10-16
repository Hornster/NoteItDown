<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Dashboard Grouping & Search Implementation Plan

- **Plan**: context/changes/dashboard-grouping-search/plan.md
- **Mode**: Deep
- **Date**: 2026-10-16
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

15/15 paths ✓, 6/6 symbols ✓ (`listNotes`, `NoteListItem`, `sessionStorageOrNull`, `waitForHydration`, `signInViaUi`, `createTestUser`), brief↔plan ✓, Progress↔Phase ✓.
The sub-agent confirmed that no existing test, smoke check or http check depends on the flat list markup. The e2e auth budget is about 37 of 50 calls with the new spec. `create_note` seeding and the predefined types (NPC, Place, Quest, Observation) support the planned e2e seed.

## Findings

### F1: Search-set reset timing is not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §3 `useGroupExpansion`, Critical Implementation Details "State sequencing on query change"
- **Detail**: The contract says the search set resets to `matchingTypeNames` "when `appliedQuery` becomes non-empty or changes" and takes `matchingTypeNames: string[]` as a parameter. If this is implemented the obvious way, with a `useEffect` on the query, there is one render where newly matching groups show collapsed and a group that also matched the previous query keeps its stale toggle. If the effect depends on the array, which is a new identity on every render, the reset fires on every render and wipes the user's toggles made during the search. The plan does not say how to do the reset, so the implementer has to guess.
- **Fix**: Specify that the search set is derived during render and keyed on `appliedQuery`: store `{ query, expanded }` and replace it when `query !== appliedQuery` (React's "adjust state when a prop changes" pattern), with no effect. `matchingTypeNames` comes from the memoized filtered groups and is read only on that reset.
- **Decision**: FIXED (fix in plan: Phase 2 §3 search-set bullet)

### F2: contract-surfaces update misses the existing sections

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2 Docs
- **Detail**: The plan adds a new "Dashboard search" H2. But `docs/reference/contract-surfaces.md` already has three sections this change affects, and the plan leaves them unchanged:
  - "Session storage", where every `noteitdown:*` key is registered.
  - "Routes": the `/campaigns/[campaignId]` entry describes "the campaign's notes list … above the list".
  - "Shared TypeScript types": the new `NoteGroup` in `src/types.ts` is not listed.

  The registry would end up describing the old list, and the storage key would sit outside the section readers check.
- **Fix**: In Phase 3 §2, add the sessionStorage key under "Session storage". Rewrite the `/campaigns/[campaignId]` Routes entry to cover the `NotesBrowser` island (`client:load`, `?q=` read server-side, `RelationChangeNotice` unchanged). Add `NoteGroup` to "Shared TypeScript types". Keep a short "Dashboard search" entry only for `?q=` and `note-search.ts` as the matcher S-07 reuses.
- **Decision**: FIXED (fix in plan: Phase 3 §2 contract-surfaces bullets)

### F3: Clearing the search departs from the PRD wording

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: End-State Alignment
- **Location**: Desired End State; Phase 2 manual check 2.10
- **Detail**: PRD FR-003 (`prd-v2.md:120-121`) says "Clearing the search restores the collapsed view." The plan restores the pre-search browse set instead, so groups opened by hand stay open. This was a planning decision (brief: "Expansion during search"), but neither plan nor brief records it as a deliberate departure from the PRD text. An impl-review against the PRD could flag it as drift.
- **Fix**: Add one line to the plan (Desired End State or Key Discoveries) stating the departure and why: the browse set starts collapsed, so "collapsed view" holds unless the user opened groups. Or align with the PRD by clearing the browse set.
- **Decision**: FIXED (fix in plan: departure recorded in Key Discoveries)

### F4: Blur during a pending debounce is not fully specified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2 `useNoteSearch`
- **Detail**: Only Enter is said to cancel the pending timer. Blur-apply should cancel it too, or the timer fires a second, redundant apply. Separately, the user can type and then click a visible note within 300 ms. Blur fires on mousedown and applies the new query. The list re-renders before mouseup, so the click can land on nothing or on a different row. This is rare, and it comes straight from the PRD's blur trigger.
- **Fix**: State that blur-apply also clears the pending timer. Note the click-during-debounce re-render as an accepted edge case. If it shows up in the manual check, guard it by applying the blur query only when the related target is outside the list.
- **Decision**: FIXED (fix in plan: Phase 2 §2 blur bullet)

### F5: e2e and screenshot details the implementer will hit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 2 §4 (no-match region); Phase 3 §1; manual 3.5
- **Detail**: Three details the implementer will run into:
  - (a) On the dashboard, `tests/e2e/notes-relations.spec.ts:51` counts `getByRole("status").locator("p")` after a delete. If the `NotesBrowser` live region is always mounted, it must not contain a `<p>` unless there is no match, or the delete-notice assertions get extra lines.
  - (b) `waitForHydration(page, buttonName)` needs a button name. A group header whose label includes the count ("NPC 2") needs a regex or a stable name.
  - (c) The `theme.shot.ts` dashboard shot (:155-160) will now capture only collapsed groups. The optional S-06 screenshot check (3.5) shows no note rows unless the shot expands a group.
- **Fix**: Add one line each in Phase 2 §4 (the live region holds no `<p>` outside the no-match state) and Phase 3 §1 (hydrate on a group header by regex name). Optionally expand one group in the dashboard shot.
- **Decision**: FIXED (fix in plan: Phase 2 §4 status-region note; Phase 3 §1 hydration hook + optional shot tweak; substring name used instead of regex since waitForHydration takes a string)
