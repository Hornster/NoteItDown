<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Edit/Delete with Relation-Change Notice

- **Plan**: context/changes/note-edit-delete-relation-refresh/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification notes

- Commit reviewed: `caab4fa`, 14 files. All five "Changes Required" items match the plan: the `NoteForm`/`useSaveNote` two-mode refactor, `relation-notice.ts` and its test, the `RelationChangeNotice` island, the edit page with its Edit link and island, and `contract-surfaces.md`. The only extras are benign: the `<h1>` "Edit note" and the layout title on the edit page, and the exported `RELATION_NOTICE_KEY` and `RelationNoticeTarget`. No `CreateNoteForm` or `useCreateNote` references remain in `src/` or `docs/`.
- Automated checks run during the review:
  - `npm run test:unit`: 39/39 passed (5 files).
  - `npx astro check`: 0 errors, 0 warnings, 0 hints.
  - `npm run lint`: clean.
  - `npm run build`: complete.
- Manual items 3.4–3.11 are ticked against `caab4fa`. No dev server was running during the review (lessons.md), and the manual checks were not re-run.
- Checked and fine:
  - Edit page authz: `getCampaign` (RLS), `isUuid`, and `note.campaign_id === campaign.id`. There is no top-level return.
  - The notice island reads storage in `useEffect`, so there is no hydration mismatch. A ref guards the one-shot read under StrictMode.
  - `noteName` comes from the response.
  - Edit uses `replace` and create keeps `assign`.
  - Create behaviour is unchanged apart from the generic error wording.
- Phase interaction: Phase 4 (`e9240ea`) edited a Phase 3 copy string. See F1.

## Findings

### F1 — Delete no-relations copy changed, plan and criterion 4.8 not annotated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/notes/RelationChangeNotice.tsx:79; context/changes/note-edit-delete-relation-refresh/plan.md:22, :353, :474
- **Detail**:
  - Phase 3 shipped the planned copy, `It had no relations, so none were removed.` Phase 4 (`e9240ea`) changed it to `No relations touched.` at the user's request. The commit message says so.
  - The plan was not updated. The Desired End State (:22), Phase 4 manual criterion (:353) and Progress item 4.8 (:474) still quote the old string, and 4.8 is ticked `[x]`.
  - This is the pattern the "Waived criteria are annotated, not ticked" lesson covers. A later reader would think the old text was verified.
- **Fix**: Update plan.md:22 and :353 to the new copy, and annotate 4.8 with `(copy changed to "No relations touched." per user, e9240ea)`.
- **Decision**: FIXED — plan.md:22 and :353 updated; 4.8 annotated (step title kept).

### F2 — useSaveNote success path: pending re-enables before navigation; 200-body parse failure reports "Network error"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useSaveNote.ts:51-69
- **Detail**:
  - `finally { setPending(false) }` also runs after `location.replace`, which is asynchronous. The Save button re-enables until the page unloads.
  - A fast second click sends a second identical PATCH. The trigger skips it, so the response has `rechecked: false`. That notice overwrites the first, and the user sees only `Saved "X".` instead of the relation changes.
  - Separately, if `response.json()` throws on a 200, the outer catch shows "Network error" for a save that succeeded. This is practically unreachable, because the route always returns JSON via `jsonOk`.
  - The `finally` pattern is inherited from `useCreateNote` and `useSaveCampaign`, so this is not a regression.
- **Fix**: Skip `setPending(false)` on the two success paths, for example by returning before the `finally` resets it via a `navigating` flag.
- **Decision**: FIXED — `finally` removed; `setPending(false)` now runs only on the error and network-failure paths.

### F3 — Notice `note_id` interpolated into href without uuid validation

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/relation-notice.ts:21-26; src/components/notes/RelationChangeNotice.tsx:30
- **Detail**:
  - `isRelationChangeList` checks only that `note_id` is a string.
  - The href has a fixed same-origin path prefix, so a `javascript:` URL or an open redirect is impossible. Names render as React text, so there is no XSS.
  - A tampered sessionStorage value can only inject path segments, a query or a hash, and tampering already requires same-origin script access.
  - This is defence in depth only.
- **Fix**: Require `isUuid(c.note_id)` in `isRelationChangeList`.
- **Decision**: FIXED — `isUuid(c.note_id)` added; test fixture `note_id` changed to a uuid.

### F4 — relation-notice tests miss nested-shape and delete-mismatch cases

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/relation-notice.test.ts:42-66
- **Detail**:
  - All four planned cases are covered.
  - Untested:
    - an item in `added`/`removed` missing `note_id` or with a non-string `name` (the path that guards the href)
    - a delete notice with a different `campaignId` (only a wrong-kind mismatch is tested)
    - `JSON.parse` yielding `null` or a primitive
- **Fix**: Add three `it` cases (nested bad item, delete campaignId mismatch, `"null"` payload).
- **Decision**: FIXED — three cases added (malformed items incl. non-uuid `note_id`, delete campaign mismatch, `"null"` payload). Unit suite 42/42, lint and astro check clean.

## Triage summary

- Fixed: F1, F2, F3, F4 (4)
