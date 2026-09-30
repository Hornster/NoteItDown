# Note Edit/Delete with Relation-Change Notice Implementation Plan

## Overview

S-04 (`context/foundation/roadmap.md`, PRD FR-005, FR-006, FR-008) lets a user edit a note's name, content and type, or delete it after an explicit confirmation. Relation re-detection already happens in the DB. This plan adds the missing *reporting* layer: atomic RPCs return which relations were added or removed, and a one-shot notice on the page the user lands on always says what changed.

## Current State Analysis

The research doc (`context/changes/note-edit-delete-relation-refresh/research.md`) is the codebase baseline. In summary:

- **Re-detection is done.** Trigger `notes_detect_relations` fires `after insert or update of name, content` and skips updates where neither changed (`supabase/migrations/20260926120000_relation_detection.sql:94-114`). `detect_note_relations` diffs rather than wipes, so unchanged relation rows keep their `id` (`:46-66`). Delete cascades through the composite FKs (`20260922120000_campaign_notes_schema.sql:113-116`). All of this is covered by `tests/integration/relation-detection.test.ts`.
- **Permissions are done.** The `notes_update_own_campaign` / `notes_delete_own_campaign` RLS policies exist, and the column grant is `update (name, content, type_id)`.
- **Reporting is missing.** `detect_note_relations` returns `void`, and there's no RPC, service, route or UI for edit or delete. `src/lib/services/notes.ts` has only list/get/create, and `src/pages/api/campaigns/[campaignId]/notes.ts` has only `POST`.
- **UI is missing.** The note page (`src/pages/campaigns/[campaignId]/notes/[noteId].astro:50-64`) has no actions, `src/components/ui/` has no dialog, and the repo has no flash/notice mechanism.

## Desired End State

- The note page has **Edit** and **Delete** actions.
- **Edit** opens `/campaigns/[campaignId]/notes/[noteId]/edit`, a form pre-filled with name, content and type. The type picker is the same one the create form uses, including "New type…". After a successful save the user lands on the note page and sees a notice:
  - name or content changed → `Saved "<name>".`, then either "Relations added: …" / "Relations removed: …" (the names link to those notes) or `Relations unchanged.`
  - only the type changed (detection doesn't run) → `Saved "<name>".` only
- **Delete** opens a shadcn alert-dialog that names the note and says how many relations it has. On confirm, the user lands on `/campaigns/[campaignId]` with a notice: `Deleted "<name>".` followed by either "Relations removed: …" (linked) or `It had no relations, so none were removed.`
- The notice shows once, only on the page it was meant for, and is gone after a reload.
- Renaming to another note's name (ignoring case) shows the existing field error "A note named … already exists". A missing or foreign note returns 404.

### Key Discoveries:

- An after-row trigger completes inside the `UPDATE` statement, so a later statement in the same plpgsql function sees the recomputed relations. Research inferred this but didn't test it, so Phase 1 tests it explicitly.
- Deleting a note can't create relations, so its "removed" set is exactly its relations as they stood before the delete (research, "Delete").
- `create_note`'s type resolution (`20260924120000_create_note_function.sql:24-43`) is what the edit path needs too. It gets extracted, so the create and edit paths can't drift apart.
- Precedents: `CampaignForm` + `useSaveCampaign(mode)` for one form serving two modes (`src/components/campaigns/CampaignForm.tsx:9`, `src/components/hooks/useSaveCampaign.ts:19`); `campaigns/[campaignId]/edit.astro` for a separate edit page; `PATCH /api/campaigns/[campaignId]` (`src/pages/api/campaigns/[campaignId]/index.ts:13-65`) for the route shape; `createNote` for SQLSTATE → typed-result mapping (`src/lib/services/notes.ts:101-129`).
- Vitest unit tests run in the `node` environment (`vitest.config.*:17`), which has no `sessionStorage`. The notice helper therefore takes a `Storage`-like parameter.
- No top-level `return` in Astro frontmatter; use `Astro.response.status` plus conditional rendering (`[noteId].astro:11-13`).
- `CampaignView` has no note-edit value (`src/lib/campaign-paths.ts:5`). The edit page uses `view="note"`, so the campaign switcher behaves the same as on the note page.

## What We're NOT Doing

- No change to the matching engine (`note_mentions`, `detect_note_relations`) and no TS copy of the matcher.
- No relation-change notice after **create**. FR-008 covers edit and delete only.
- No manual relation editing and no changes to the memory map, which stays read-only (FR-011). The map picks up changes on its next load.
- No in-place editing on the note page. The edit page is separate, following the campaign-rename precedent.
- No shared DB-error boundary. Unexpected DB errors follow the existing convention of a generic 500 (roadmap Observations).
- No fix for the accepted concurrent-write race (`contract-surfaces.md:80`). An edit racing a create can miss a pair; `recompute_campaign_relations` stays the repair path.
- No deletion of custom note types left unused after an edit changes a note's type (`note_types` has no DELETE policy, same as today).
- No phone-width acceptance checks (roadmap Parked: mobile support).

## Implementation Approach

The work goes bottom-up in four independently verifiable phases:

1. SQL RPCs that report the diff.
2. Typed services and REST routes.
3. The edit UI and the notice mechanism.
4. The delete UI.

The DB stays the enforcement and detection point. The RPCs only snapshot relation pairs around the write and return the difference, joined with the other notes' names. The client stores the API's change set in `sessionStorage` under one key, tagged with the page it's meant for, then navigates. A `RelationChangeNotice` island on that page reads the key, checks the target, renders the notice and clears the key.

## Critical Implementation Details

- **Snapshot ordering in `update_note`.** Lock and read the note row (`select … for update`) and take the "before" pair snapshot *before* the `UPDATE`, then take the "after" snapshot in a separate statement. Doing it all in one CTE statement would read the pre-trigger state, because a CTE uses one snapshot for the whole statement.
- **`rechecked` must mirror the trigger's skip rule exactly.** It is true iff `new.name <> old.name or new.content <> old.content`, the same case-sensitive comparison as `relation_detection.sql:101`. A case-only rename therefore counts as rechecked.
- **Notice targeting.** The stored payload names its target (`{ kind: "edit", noteId }` or `{ kind: "delete", campaignId }`). The island clears the key whenever it reads it, but renders only on a target match, so a notice left over from an abandoned navigation can't appear later on an unrelated page.

## Phase 1: DB change-set RPCs

### Overview

Add `resolve_note_type`, `update_note` and `delete_note`, and refactor `create_note` to use the shared type resolution. Prove the returned diffs with integration tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260930120000_note_edit_delete_functions.sql`

**Intent**: Give the API an atomic, one-round-trip way to edit or delete a note and learn which relations changed, reusing the existing trigger and cascade for the actual detection.

**Contract**: All functions are `language plpgsql security invoker set search_path = ''`, with `revoke execute … from public, anon; grant execute … to authenticated`.

- `public.resolve_note_type(p_campaign_id uuid, p_type_id uuid, p_new_type_name text) returns uuid`
  - Body moved verbatim from `create_note`, including the `22023` "exactly one of" check and the case-insensitive reuse via `on conflict … do nothing`.
  - `create or replace` `create_note` with the same signature and behaviour, now calling it.
- `public.update_note(p_campaign_id uuid, p_note_id uuid, p_name text, p_content text, p_type_id uuid default null, p_new_type_name text default null) returns jsonb`
  - Locks the note `where id = p_note_id and campaign_id = p_campaign_id`. If there's no row (missing, foreign campaign or hidden by RLS), raise with errcode `P0002`.
  - Resolves the type, snapshots the other-note ids of its relations, runs the `UPDATE`, then snapshots again.
  - Returns `{ "note": <notes row>, "rechecked": bool, "added": [{ "note_id", "name" }], "removed": [{ "note_id", "name" }] }`. Both arrays are ordered by `lower(name)`. `name` is the other note's current name.
  - Propagates `23505`, `23514`, `23503`, `42501` and `22023` unchanged.
- `public.delete_note(p_campaign_id uuid, p_note_id uuid) returns jsonb`
  - Same `P0002` rule. Snapshots the note's relations with the other notes' names, then runs the `DELETE` (the cascade removes the relations).
  - Returns `{ "name": <deleted note name>, "removed": [{ "note_id", "name" }] }`, ordered by `lower(name)`.

#### 2. Integration tests

**File**: `tests/integration/note-edit-delete-functions.test.ts`

**Intent**: Pin down the RPC contracts, including the trigger-visibility assumption, following the style of `create-note-function.test.ts` (`createTestUser` helpers, typed `rpc` wrappers).

**Contract**: The cases are listed under Testing Strategy → Integration Tests.

#### 3. Contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the new load-bearing names. Add sections for `resolve_note_type`, `update_note` and `delete_note` (signatures, return shapes, SQLSTATEs). In the `create_note` section, note that type resolution now delegates to `resolve_note_type`. In the "relations" section, note that edit/delete reporting reads relations but never writes them. Add the new migration to the "Migration file" list.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- New RPC integration tests pass: `npm run test:integration -- note-edit-delete-functions`
- Existing `create_note` and relation-detection integration tests still pass: `npm run test:integration`

#### Manual Verification:

- `contract-surfaces.md` entries match the migration's final signatures and return shapes

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual checks before Phase 2.

---

## Phase 2: Services and API routes

### Overview

Typed service wrappers and `PATCH`/`DELETE /api/campaigns/[campaignId]/notes/[noteId]`.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: The DTOs the API, hooks and notice share.

**Contract**:
- `RelationChange { note_id: string; name: string }`
- `UpdateNoteResponse { id: string; name: string; rechecked: boolean; added: RelationChange[]; removed: RelationChange[] }`
- `DeleteNoteResponse { name: string; removed: RelationChange[] }`
- `UpdateNoteCommand`, the same shape as `CreateNoteCommand` (alias it)

#### 2. Schema

**File**: `src/lib/schemas/notes.ts`

**Intent**: The edit body has the same shape and rules as create, so reuse the schema rather than fork it.

**Contract**: `export const updateNoteSchema = createNoteSchema`, with a doc comment saying why, and the same compile-time assignability check against `UpdateNoteCommand`.

#### 3. Services

**Files**: `src/lib/services/notes.ts`, `src/lib/services/relations.ts`

**Intent**: Map RPC outcomes to typed results the way `createNote` does, and provide the relation count the delete dialog shows.

**Contract**:
- `updateNote(supabase, campaignId, noteId, command): Promise<UpdateNoteResult>`
  - Success is `{ success: true; changes: UpdateNoteResponse }`.
  - Failure reasons: `not_found` (`P0002`), `duplicate_name` (`23505`), `invalid_type` (`23503`/`42501`/`22023`), `unexpected`.
- `deleteNote(supabase, campaignId, noteId): Promise<DeleteNoteResult>`
  - Failure reasons: `not_found` (`P0002`), `unexpected`.
- `countNoteRelations(supabase, noteId): Promise<number>` in `relations.ts`
  - A head-only exact count over `relations` where the note is `note_a_id` or `note_b_id`. Throws on error, like `listRelations`.

#### 4. Route

**File**: `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts` (new; `prerender = false`)

**Intent**: The REST surface for edit and delete, mirroring the guards in `PATCH /api/campaigns/[campaignId]`.

**Contract**:
- **Shared guards:** 401 when not signed in; 500 when Supabase isn't configured; 404 when either id fails `isUuid`.
- **`PATCH`:**
  - Validates the body with `updateNoteSchema`. An invalid body returns 400 with `field`.
  - Success returns 200 with `UpdateNoteResponse`.
  - `duplicate_name` → 409, `field: "name"`. `invalid_type` → 400, `field: "type"`. `not_found` → 404. `unexpected` → `console.error` and a generic 500.
- **`DELETE`:** no body. Success returns 200 with `DeleteNoteResponse`. `not_found` → 404. `unexpected` → 500.

#### 5. Service tests

**File**: `tests/integration/notes-service.test.ts`

**Intent**: Cover the `updateNote`/`deleteNote` reason mapping (`not_found`, `duplicate_name`, `invalid_type`) and `countNoteRelations`, as listed under Testing Strategy → Integration Tests. Reuse the file's existing tenantA/tenantB `beforeAll` setup.

#### 6. Contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Add a `PATCH /api/campaigns/[campaignId]/notes/[noteId]` / `DELETE …` section with its guard order (it uses `isUuid` rather than `getCampaign`, and the 404 for a missing or foreign note comes from `P0002`), its status mapping and its response DTOs. Under "Shared TypeScript types", add `RelationChange`, `UpdateNoteCommand`, `UpdateNoteResponse` and `DeleteNoteResponse`.

### Success Criteria:

#### Automated Verification:

- Types, Astro check and lint pass: `npx astro check && npm run lint`
- Service integration tests pass: `npm run test:integration -- notes-service`

#### Manual Verification:

- `curl`/devtools against a running dev server: PATCH returns the change set; DELETE returns `removed`; a foreign note id returns 404
- `contract-surfaces.md` has the new API route section and DTOs, matching the implemented route

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Edit flow and relation-change notice

### Overview

Edit page, a two-mode note form, the notice helper and island, and an Edit link on the note page.

### Changes Required:

#### 1. Form and hook refactor

**Files**:
- `src/components/notes/CreateNoteForm.tsx` → renamed `src/components/notes/NoteForm.tsx`
- `src/components/hooks/useCreateNote.ts` → renamed `src/components/hooks/useSaveNote.ts`
- `src/pages/campaigns/[campaignId]/notes/new.astro` (import update)

**Intent**: One form for create and edit, following `CampaignForm`/`useSaveCampaign`. Create behaviour stays unchanged.

**Contract**:
- Props: `{ mode: "create"; campaignId; noteTypes } | { mode: "edit"; campaignId; noteTypes; note: { id; name; content; type_id } }`.
- In edit mode the fields are pre-filled, the type select defaults to `note.type_id`, and the button reads "Save changes" / "Saving…".
- `useSaveNote(mode, campaignId, noteId?)`:
  - Create mode: POST, then navigate to the new note, exactly as today.
  - Edit mode: PATCH. On 200, write an edit notice (below) with `noteName` taken from the response's `name`, which is the stored, trimmed value, not the form input, then `window.location.replace` to the note page, so Back skips the finished edit form. Create mode keeps `assign`.
  - Same error surfacing as today.

#### 2. Notice helper

**File**: `src/lib/relation-notice.ts` (+ `src/lib/relation-notice.test.ts`)

**Intent**: A pure, storage-injectable one-shot flash, so it can be unit-tested and so storage failures (private mode, blocked storage) never break a save.

**Contract**:
- Key: `noteitdown:relation-notice`.
- `RelationNotice = { kind: "edit"; noteId; noteName; rechecked; added; removed } | { kind: "delete"; campaignId; noteName; removed }`.
- `writeRelationNotice(storage, notice): void` and `takeRelationNotice(storage, target): RelationNotice | null`.
  - `takeRelationNotice` always removes the key.
  - It returns the notice only if it parses, has the expected shape and matches `target` (`{ kind: "edit", noteId }` / `{ kind: "delete", campaignId }`).
  - Every storage access sits inside `try/catch`, and a failure returns `null` or does nothing.

#### 3. Notice island

**File**: `src/components/notes/RelationChangeNotice.tsx`

**Intent**: Render the notice once on the page it targets.

**Contract**:
- Props: `{ campaignId; target }`. On mount it calls `takeRelationNotice(window.sessionStorage, target)` and renders nothing if that returns `null`.
- Copy is exactly as in Desired End State. Relation names link to `/campaigns/{campaignId}/notes/{note_id}`.
- Uses `role="status"`, the app's glass-panel styling, and a dismiss button.

#### 4. Pages

**Files**:
- `src/pages/campaigns/[campaignId]/notes/[noteId]/edit.astro` (new)
- `src/pages/campaigns/[campaignId]/notes/[noteId].astro`

**Intent**: The edit page uses the same 404 guards as the note page (campaign ownership, valid uuid, `note.campaign_id === campaign.id`) and loads `listNoteTypes`. It renders `NoteForm mode="edit"` plus a Cancel link back to the note, with `Topbar view="note"`.

The note page gets:
- an "Edit" link next to the title
- `<RelationChangeNotice client:load target={{ kind: "edit", noteId }} … />` above the note card

**Contract**: Route `/campaigns/[campaignId]/notes/[noteId]/edit`.

#### 5. Contract registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: In "Routes", change the `/notes/new` entry's `CreateNoteForm` + `useCreateNote` to `NoteForm mode="create"` + `useSaveNote`. Add a `/campaigns/[campaignId]/notes/[noteId]/edit` entry (guards, `NoteForm mode="edit"`, `Topbar view="note"`). Extend the note-page entry with the Edit link and the `RelationChangeNotice` island, and in Phase 4 with the Delete dialog. Register the `noteitdown:relation-notice` sessionStorage key and its payload shape.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `relation-notice.test.ts`: `npm run test:unit`
- Types, Astro check and lint pass: `npx astro check && npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Creating a note still works end to end and shows no relation notice
- Editing content so that a new note name is mentioned shows "Relations added: <name>" (linked) on the note page
- Renaming a note so another note's mention no longer matches shows "Relations removed: <name>"
- A content edit that affects no relation shows "Relations unchanged."; a type-only edit shows only "Saved …"
- Renaming to an existing note's name in different case shows the name-field duplicate error and stays on the form
- Reloading the note page after the notice appeared shows no notice
- Opening `/…/notes/<foreign-or-bad-id>/edit` shows the 404 message
- `contract-surfaces.md` "Routes" names `NoteForm`/`useSaveNote`, lists the edit page, and registers the notice storage key

**Implementation Note**: Check for a running dev server before manual testing (lessons.md). Pause for human confirmation before Phase 4.

---

## Phase 4: Delete flow with confirmation

### Overview

A confirmation dialog on the note page, the delete hook, and the notice on the note list.

### Changes Required:

#### 1. Alert dialog component

**File**: `src/components/ui/alert-dialog.tsx` (via `npx shadcn@latest add alert-dialog`)

**Intent**: An accessible confirmation modal, following the project's shadcn convention.

**Contract**: Generated shadcn "new-york" component. It adds the Radix alert-dialog dependency to `package.json`.

#### 2. Delete hook and button

**Files**: `src/components/hooks/useDeleteNote.ts`, `src/components/notes/DeleteNoteButton.tsx`

**Intent**: FR-006's explicit confirmation step, then a delete that reports what was removed.

**Contract**:
- `useDeleteNote(campaignId, noteId)` returns `{ remove, pending, error }`.
  - On 200 it writes a `delete` notice and calls `window.location.replace("/campaigns/{campaignId}")`. Using `replace` keeps the deleted note's page out of history, so Back doesn't land on a 404.
  - Errors surface as `ApiError`. A 404 shows "This note doesn't exist or isn't yours."
- `DeleteNoteButton` props: `{ campaignId; noteId; noteName; relationCount }`.
  - The dialog title is `Delete "<noteName>"?`.
  - The body says the note will be deleted permanently and states its relation count ("It is connected to N other notes; those relations will be removed." / "It has no relations.").
  - Buttons are Cancel and Delete (destructive style). Delete is disabled while pending, and errors render inside the dialog.

#### 3. Pages

**Files**: `src/pages/campaigns/[campaignId]/notes/[noteId].astro`, `src/pages/campaigns/[campaignId]/index.astro`

**Intent**: The note page loads `countNoteRelations` and renders `DeleteNoteButton client:load` next to Edit. The campaign note list renders `<RelationChangeNotice client:load target={{ kind: "delete", campaignId }} … />` above the list.

**Contract**: No new routes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- All integration tests pass: `npm run test:integration`
- Types, Astro check and lint pass: `npx astro check && npm run lint`
- Production build succeeds: `npm run build`
- Auth smoke test passes against preview: `npm run smoke`

#### Manual Verification:

- Clicking Delete opens a dialog naming the note and its relation count; Cancel and Esc close it without deleting
- Confirming deletes the note, lands on the note list without it, and shows "Deleted … Relations removed: …" with linked names
- Deleting a note with no relations shows "It had no relations, so none were removed."
- The memory map no longer shows the deleted note or its edges after reload
- Reloading the note list after the notice appeared shows no notice

**Implementation Note**: Check for a running dev server before manual testing (lessons.md).

---

## Testing Strategy

### Unit Tests:

- `src/lib/relation-notice.test.ts` uses an in-memory `Storage` fake:
  - write then take with the matching target returns the notice and clears the key
  - a mismatched target returns `null` and still clears the key
  - malformed JSON or a wrong shape returns `null`
  - a throwing storage returns `null` or does nothing, without an exception

### Integration Tests:

`tests/integration/note-edit-delete-functions.test.ts`:
- **Content edit that adds a mention:** `added` holds the other note's id and name, `removed` is empty, `rechecked` is true, and the stored relations match (this proves the after-trigger is visible to the function).
- **Rename that breaks a mention:** `removed` lists the other note. The unchanged relation keeps its `id`.
- **Type-only edit:** `rechecked` is false, and `added`/`removed` are empty.
- **Edit to `p_new_type_name`:** creates or reuses the type case-insensitively, the same way `create_note` does.
- **Rename to another note's name (different case):** `23505`. A case-only rename of the note's own name succeeds.
- **Foreign user's note, or a wrong `p_campaign_id`:** `P0002`, and no row changes.
- **Delete:** `name` plus `removed` lists every former neighbour, and no relation rows reference the note afterwards.
- **Delete of a missing or foreign note:** `P0002`.

`tests/integration/notes-service.test.ts` gets additions for `updateNote`/`deleteNote` reason mapping (`not_found`, `duplicate_name`, `invalid_type`) and for `countNoteRelations`.

The existing `create-note-function.test.ts` is the regression guard for the `create_note` refactor.

### Manual Testing Steps:

1. Create notes "Bob", "Tavern" and "Quest A" (content "Bob visits the Tavern"). Check the map shows two edges.
2. Edit "Quest A" content to "Bob waits". The notice shows removed "Tavern".
3. Rename "Tavern" to "Bob's Tavern". The notice shows "Relations unchanged." (Quest A no longer mentions it.)
4. Change only the type of "Bob". The notice shows "Saved "Bob"." only.
5. Delete "Bob" and confirm. The note list shows "Deleted "Bob". Relations removed: Quest A".

## Performance Considerations

`update_note` adds two indexed selects on `relations` around an update that already runs a campaign-wide match. That's negligible next to detection itself, and it stays within the PRD's "short, perceptible delay" budget. `countNoteRelations` is a head-only count per note-page load.

## Migration Notes

The new migration is additive, except for `create or replace` of `create_note`, which keeps its signature and behaviour. The existing tests guard it. No data backfill is needed.

## References

- Related research: `context/changes/note-edit-delete-relation-refresh/research.md`
- S-02 plan (deferral of change-set API): `context/archive/2026-09-26-auto-relations-memory-map/plan.md:44-45`
- RPC precedent: `supabase/migrations/20260924120000_create_note_function.sql`
- Detection engine: `supabase/migrations/20260926120000_relation_detection.sql:31-114`
- Route precedent: `src/pages/api/campaigns/[campaignId]/index.ts:13-65`
- Two-mode form precedent: `src/components/campaigns/CampaignForm.tsx`, `src/components/hooks/useSaveCampaign.ts`
- Edit page precedent: `src/pages/campaigns/[campaignId]/edit.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB change-set RPCs

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- [x] 1.2 New RPC integration tests pass: `npm run test:integration -- note-edit-delete-functions`
- [x] 1.3 Existing `create_note` and relation-detection integration tests still pass: `npm run test:integration`

#### Manual

- [x] 1.4 `contract-surfaces.md` entries match the migration's final signatures and return shapes

### Phase 2: Services and API routes

#### Automated

- [ ] 2.1 Types, Astro check and lint pass: `npx astro check && npm run lint`
- [ ] 2.2 Service integration tests pass: `npm run test:integration -- notes-service`

#### Manual

- [ ] 2.3 `curl`/devtools against a running dev server: PATCH returns the change set; DELETE returns `removed`; a foreign note id returns 404
- [ ] 2.4 `contract-surfaces.md` has the new API route section and DTOs, matching the implemented route

### Phase 3: Edit flow and relation-change notice

#### Automated

- [ ] 3.1 Unit tests pass, including `relation-notice.test.ts`: `npm run test:unit`
- [ ] 3.2 Types, Astro check and lint pass: `npx astro check && npm run lint`
- [ ] 3.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Creating a note still works end to end and shows no relation notice
- [ ] 3.5 Editing content so that a new note name is mentioned shows "Relations added: <name>" (linked) on the note page
- [ ] 3.6 Renaming a note so another note's mention no longer matches shows "Relations removed: <name>"
- [ ] 3.7 A content edit that affects no relation shows "Relations unchanged."; a type-only edit shows only "Saved …"
- [ ] 3.8 Renaming to an existing note's name in different case shows the name-field duplicate error and stays on the form
- [ ] 3.9 Reloading the note page after the notice appeared shows no notice
- [ ] 3.10 Opening `/…/notes/<foreign-or-bad-id>/edit` shows the 404 message
- [ ] 3.11 `contract-surfaces.md` "Routes" names `NoteForm`/`useSaveNote`, lists the edit page, and registers the notice storage key

### Phase 4: Delete flow with confirmation

#### Automated

- [ ] 4.1 Unit tests pass: `npm run test:unit`
- [ ] 4.2 All integration tests pass: `npm run test:integration`
- [ ] 4.3 Types, Astro check and lint pass: `npx astro check && npm run lint`
- [ ] 4.4 Production build succeeds: `npm run build`
- [ ] 4.5 Auth smoke test passes against preview: `npm run smoke`

#### Manual

- [ ] 4.6 Clicking Delete opens a dialog naming the note and its relation count; Cancel and Esc close it without deleting
- [ ] 4.7 Confirming deletes the note, lands on the note list without it, and shows "Deleted … Relations removed: …" with linked names
- [ ] 4.8 Deleting a note with no relations shows "It had no relations, so none were removed."
- [ ] 4.9 The memory map no longer shows the deleted note or its edges after reload
- [ ] 4.10 Reloading the note list after the notice appeared shows no notice
