# Note Edit/Delete with Relation-Change Notice — Plan Brief

> Full plan: `context/changes/note-edit-delete-relation-refresh/plan.md`
> Research: `context/changes/note-edit-delete-relation-refresh/research.md`

## What & Why

S-04 (FR-005, FR-006, FR-008) lets a user edit a note's name, content and type, or delete it behind an explicit confirmation. After either action the app shows which relations were added or removed. The PRD requires that relation changes are "never silent", and this is its secondary success criterion.

## Starting Point

Re-detection already runs in the DB. A trigger re-runs on `update of name, content`, and FK cascades drop a deleted note's relations; both are tested. What's missing is everything user-facing, plus a way to *report* the diff: `detect_note_relations` returns `void`, and there's no edit/delete RPC, service, route, page or dialog.

## Desired End State

The note page has Edit and Delete. Saving an edit lands on the note page with a one-shot notice: "Relations added/removed: …" (linked names) or "Relations unchanged.", or just "Saved" for a type-only edit. Deleting asks for confirmation in a dialog that shows the relation count, then lands on the note list with "Deleted "X". Relations removed: …" (or "none were removed").

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Detection engine | Unchanged, DB trigger + cascade | Already correct and tested; no TS matcher to drift | Research |
| Change-set mechanism | `update_note` / `delete_note` security-invoker RPCs returning jsonb diffs | Atomic, one round trip, follows the `create_note` precedent | Plan |
| Notice delivery | sessionStorage one-shot flash, targeted to the landing page | No cookie size cap, no server plumbing, can't be spoofed via the URL | Plan |
| Landing after delete | Campaign note list `/campaigns/[campaignId]` | Matches the note page's existing "Back to …" navigation | Plan |
| Confirmation UI | shadcn `alert-dialog` showing the note name and relation count | Accessible, follows the project's shadcn convention, room to warn | Plan |
| Edit scope | Name, content and type (incl. "New type…") via a two-mode `NoteForm` | One form, and a wrong type can be fixed; type resolution shared with create | Plan |
| Empty change set | Always "Relations unchanged." after name/content edits; type-only → "Saved" only | FR-008 "never silent", taken literally | Plan |
| Edit page placement | Separate `/notes/[noteId]/edit` page | Mirrors the campaign-rename precedent | Plan (precedent) |
| Type resolution | Extracted to `resolve_note_type`, used by `create_note` and `update_note` | Stops the create and edit paths drifting apart | Plan |

## Scope

**In scope:** migration with 3 new functions + `create_note` refactor; services `updateNote`/`deleteNote`/`countNoteRelations`; `PATCH`/`DELETE /api/campaigns/[campaignId]/notes/[noteId]`; edit page; `NoteForm`/`useSaveNote` refactor; notice helper + island; delete dialog + hook; integration tests and unit tests; contract-surfaces update.

**Out of scope:** matcher changes; a notice on create; memory-map changes (FR-011); in-place editing; a shared DB-error boundary; the accepted concurrent-write race; cleanup of unused custom types; phone-width checks.

## Architecture / Approach

Browser form → `PATCH`/`DELETE` route (zod, auth, uuid guards) → service (SQLSTATE → typed result) → RPC. The RPC takes a "before" snapshot of the note's relation pairs, runs the `UPDATE`/`DELETE` (the trigger or cascade does the detection), takes an "after" snapshot, and returns `{added, removed}` with the other notes' names. The hook writes the change set to `sessionStorage`, tagged with its target page, then navigates. `RelationChangeNotice` on that page reads it once, checks the target and renders it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB change-set RPCs | `resolve_note_type`, `update_note`, `delete_note` + integration tests | Trigger results must be visible to the function's next statement (tested explicitly) |
| 2. Services and API routes | Typed services + PATCH/DELETE route | SQLSTATE mapping gaps (P0002 vs 42501) |
| 3. Edit flow and notice | Edit page, `NoteForm` two-mode refactor, notice helper + island | Regressing the create form during the rename/refactor |
| 4. Delete flow | shadcn alert-dialog, delete hook, notice on note list | New Radix dependency; the notice must not leak to other pages |

**Prerequisites:** S-02 done (it is); local Supabase running for integration tests.
**Estimated effort:** ~3–4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Research inferred, but didn't test, that after-row trigger effects are visible to later statements in the same function. Phase 1's first test proves it; if it fails, `update_note` calls `detect_note_relations` explicitly before the "after" snapshot.
- The notice depends on `sessionStorage`. If storage is blocked, the save still succeeds and the notice is silently skipped. This is accepted: the map and note page still show the true state.
- Accepted concurrent-write race (inherited): an edit racing a create can miss a pair, and the reported diff reflects what was stored.

## Success Criteria (Summary)

- A user can edit or delete a note, and every name/content edit and every delete is followed by a visible statement of which relations changed, or that none did.
- A delete never happens without an explicit confirmation step.
- Rename collisions and foreign notes are rejected with clear errors, and the create flow is unchanged.
