---
date: 2026-09-29T21:29:21+02:00
researcher: Claude (claude-opus-5-5) for Hornster
git_commit: feff61f
branch: main
repository: NoteItDown
topic: "How much of S-04 (note edit/delete with relation-change notice) does the current architecture already support?"
tags: [research, codebase, relations, s-04, fr-005, fr-006, fr-008]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (claude-opus-5-5) for Hornster
---

# Research: How much of S-04 does the current architecture already support?

**Date**: 2026-09-29T21:29:21+02:00
**Researcher**: Claude (claude-opus-5-5) for Hornster
**Git Commit**: feff61f (clean working tree)
**Branch**: main
**Repository**: NoteItDown

## Research Question

The current architecture should already support S-04 `note-edit-delete-relation-refresh`, at least partially. Check this claim against `context/foundation/roadmap.md` (S-04, `:127-136`), `context/foundation/tech-stack.md`, the archived S-02 research (`context/archive/2026-09-26-auto-relations-memory-map/research.md`) and the current code.

## Summary

**Confirmed: the data layer is largely in place. Everything user-facing is missing.**

S-04 covers FR-005 (edit, including rename), FR-006 (delete with confirmation) and FR-008 (re-detect relations and show what changed) (`context/foundation/prd.md:71-80`). Here is where each part stands:

| S-04 part | Status | Evidence |
|---|---|---|
| Re-detect relations on edit (content or name) | **Done** in the DB | trigger `notes_detect_relations` fires `after insert or update of name, content` (`supabase/migrations/20260926120000_relation_detection.sql:112-114`), tested for content edits and renames (`tests/integration/relation-detection.test.ts:213-256`) |
| Remove relations on delete | **Done** in the DB | composite FKs `on delete cascade` (`supabase/migrations/20260922120000_campaign_notes_schema.sql:113-116`), tested (`relation-detection.test.ts:273-288`) |
| DB permission to edit and delete notes | **Done** | `notes_update_own_campaign`, `notes_delete_own_campaign` (`…campaign_notes_schema.sql:90-102`); column grant `update (name, content, type_id)` (`20260923120000_restrict_update_columns.sql:9-10`) |
| Name/content limits and duplicate-name rule on edit | **Done** in the DB | length CHECK constraints (`contract-surfaces.md:35`), `notes_campaign_name_key` on `lower(name)` (`…campaign_notes_schema.sql:74`); zod limits exist for create only (`src/lib/schemas/notes.ts:11-12,23-34`) |
| Return the added/removed relation set to the caller (FR-008) | **Missing** | `detect_note_relations` returns `void` (`relation_detection.sql:31-68`); the S-02 plan deferred this to S-04 (`context/archive/2026-09-26-auto-relations-memory-map/plan.md:44`) |
| `updateNote` / `deleteNote` services | **Missing** | `src/lib/services/notes.ts` has only `listNoteTypes`, `listNotes`, `getNote`, `createNote` (`:30-129`); `relations.ts` has only `listRelations` (`:9-20`) |
| PATCH/DELETE note API routes | **Missing** | `src/pages/api/campaigns/[campaignId]/notes.ts` exports only `POST` (`:13`) |
| Edit form, delete button, confirmation step | **Missing** | the note page renders name, type and content only, with no actions (`src/pages/campaigns/[campaignId]/notes/[noteId].astro:50-64`); `src/components/ui/` has `button`, `label`, `textarea`, `LibBadge` and no dialog component |
| A notice that survives navigation | **Missing** | no flash/notice mechanism in `src/`; the only `searchParams` use is the auth `?error=` param (`src/pages/auth/signin.astro:5`, `signup.astro:5`) |

The roadmap's premise that "re-detection reuses that same engine" (`roadmap.md:135`) holds without any engine change. What S-04 must still build is the change-set API and the whole UI and API surface.

## Detailed Findings

### The detection engine already handles every edit case

- **One-note recompute is enough for an edit.** Whether notes X and Y are related depends only on X's and Y's name and content (`note_mentions` in both directions, `relation_detection.sql:53`). Editing X can therefore only change pairs that contain X. `detect_note_relations(X)` recomputes exactly those pairs against every other note in the campaign (`:46-66`). No campaign-wide recompute is needed after an edit. (This is reasoning from the SQL, backed by the rename test at `relation-detection.test.ts:236-256`.)
- **It diffs instead of wiping.** The `deleted` CTE removes only stored pairs that are no longer matched, and the insert uses `on conflict do nothing` (`relation_detection.sql:55-66`). Unchanged relations keep their `id` and `created_at`, so a before/after comparison by pair (or by relation `id`) is stable.
- **Type-only edits don't re-run detection.** The trigger listens to `update of name, content` (`:113`), and the function returns early when neither value changed (`:101-103`). A type change produces an empty change set, which matches FR-008's rule.
- **Every write path is covered.** This includes a direct PostgREST `update` or `delete` that bypasses the app, because detection lives in a trigger and deletion in FK cascades. This was the reason Option A was chosen in the S-02 research (Follow-up 1, Option A pro 1).

### Delete

- Deleting a note removes all of its relations through the cascade (`…campaign_notes_schema.sql:113-116`). Deleting a note cannot create relations, so for FR-008 the removed set is exactly the note's relations as they stood just before the delete. S-02 research made the same point ("Deletes: already handled…"), and the current schema confirms it.
- Nothing needs recomputing after a delete. The other notes' pairs don't depend on the deleted note.

### What FR-008 still needs: a change set

The trigger can't return anything to the API caller (S-02 research, Option A con 3). There are two ways to get the added/removed set, both using existing primitives.

1. **An SQL RPC per operation**, for example `update_note(...)` and `delete_note(p_note_id)`, `security invoker`, following the `create_note` precedent (`supabase/migrations/20260924120000_create_note_function.sql`).
   - How it works: it snapshots the note's relation pairs, runs the `UPDATE`/`DELETE`, snapshots again and returns the difference.
   - The after-row trigger finishes inside the `UPDATE` statement, so a later statement in the same function sees the new relations. This is inferred from Postgres trigger semantics and was not tested here.
   - It's atomic and takes one round trip. This matches the staging/diff idea from S-02 research Follow-up 3.
2. **A TS service** runs a before-select on `relations`, then the update or delete, then an after-select.
   - It takes three round trips and isn't atomic. The reads are harmless, though, because detection itself stays in the DB.
   - It's unit-testable only if the diff is a pure function over two pair lists.

Either way, the notice should show **note names**, not ids. The returned rows need the name of the other note in each pair, available through a join on `notes`. For a delete, the neighbours still exist afterwards, so their names can be read before or after the delete.

### Edit path details the plan must handle

- **Rename collisions.** Renaming to an existing name, ignoring case, raises `23505` on `notes_campaign_name_key` (`…campaign_notes_schema.sql:74`). `createNote` already maps this to `duplicate_name` (`src/lib/services/notes.ts:116-119`). An update service needs the same mapping. Changing only the case of a note's own name is not a conflict, because the unique index compares against other rows.
- **Validation.** `createNoteSchema` is `.strict()` and requires `type` (`src/lib/schemas/notes.ts:23-40`). An edit schema can reuse the `name` and `content` field rules and the shared limits (`:11-12`).
- **Type editing.** It's allowed by the column grant (`restrict_update_columns.sql:10`), but FR-005 asks only for "content, including its name" (`prd.md:71`). Whether to allow changing the type, or creating a new custom type during an edit, is a product decision. A new custom type would need the insert path `create_note` uses.
- **`updated_at`** is maintained by `notes_set_updated_at` (`contract-surfaces.md:36`), so the service needs no extra work.

### UI and API conventions to follow

- **API route style.** `PATCH` in `src/pages/api/campaigns/[campaignId]/index.ts:13-65` shows the pattern: 401/500/404 guards, a JSON body, zod `safeParse`, `jsonError` plus `fieldFromPath`, and a typed service result.
- **Client hooks.** `fetch` followed by `window.location.assign` (`src/components/hooks/useCreateNote.ts:29-37`, `useSaveCampaign.ts:29-41`). There's no client-side router, so after a save or delete the notice either has to render before navigation or be carried across the redirect, for example as a query param or a one-shot cookie. The repo has no helper for either.
- **Frontmatter.** No top-level `return` in Astro frontmatter (`[noteId].astro:11-13`). The edit page should follow the same `Astro.response.status` pattern.
- **Map and FR-011.** The map stays read-only (`src/components/memory-map/MemoryMap.tsx:44,66`). S-04 doesn't touch it. After an edit or delete, the map reflects the change on its next load, because it reads `relations` fresh (`src/lib/services/relations.ts:9-20`).

### Inherited open items (not new to S-04)

- **Hosted database locale.** Probing it is still a pre-deploy task (`contract-surfaces.md:79`). S-04 changes nothing here.
- **Concurrent-write race.** It is accepted as a risk, with `recompute_campaign_relations` as the repair path (`contract-surfaces.md:80`). An edit racing a create can miss a pair in the same way.
- **Error handling.** DB errors become a raw 500 (`roadmap.md:170`). New routes inherit this convention.

## Code References

- `supabase/migrations/20260926120000_relation_detection.sql:10-22` — `note_mentions` matcher
- `supabase/migrations/20260926120000_relation_detection.sql:31-68` — `detect_note_relations`, a diffing recompute that returns `void`
- `supabase/migrations/20260926120000_relation_detection.sql:94-114` — trigger on `update of name, content`, skips no-op updates
- `supabase/migrations/20260922120000_campaign_notes_schema.sql:74,90-102,113-118` — case-insensitive unique name, update/delete RLS, cascade FKs
- `supabase/migrations/20260923120000_restrict_update_columns.sql:9-10` — `update (name, content, type_id)` grant
- `tests/integration/relation-detection.test.ts:213-256,273-288` — edit, rename and delete re-detection tests
- `src/lib/services/notes.ts:101-128` — `createNote` error mapping to reuse for update
- `src/lib/schemas/notes.ts:11-40` — shared limits, create schema
- `src/pages/api/campaigns/[campaignId]/notes.ts:13` — `POST` only
- `src/pages/api/campaigns/[campaignId]/index.ts:13-65` — reference `PATCH` route
- `src/pages/campaigns/[campaignId]/notes/[noteId].astro:50-64` — note page with no actions
- `src/components/hooks/useCreateNote.ts:29-37` — fetch-then-navigate hook pattern
- `docs/reference/contract-surfaces.md:47-48,68-80` — relations write contract, detection semantics

## Architecture Insights

- The DB is the enforcement point. Relations are a derived projection that triggers and cascades keep correct. S-04 adds only a *reporting* layer (the diff) on top and must not add a second matcher in TS. The S-02 plan explicitly avoided that, to prevent drift (`relation_detection.sql:1-3`).
- Relation rows are stable across re-detection (diff-based, not delete-all/insert-all), so any before/after comparison works on stored rows without recomputation.

## Historical Context (from prior changes)

Verdicts on the archived S-02 research claims that S-04 relies on:

| Claim (archived `research.md`) | Verdict |
|---|---|
| "S-04 largely comes for free. `UPDATE OF name, content` already re-runs detection on edit, delete cascades already remove edges" (Option A pro 3) | **Supported**: implemented at `relation_detection.sql:112-114` and tested |
| "A trigger can't hand the added/removed relations set back to the API caller… S-04 will need an RPC… or a before/after select" (Option A con 3) | **Supported**: still true, and no such RPC exists |
| "Deleting a note can't create relations, so S-04's delete path only needs the before/after difference" | **Supported** |
| Follow-up 3: compute the new set, diff it against existing rows, delete removed pairs and insert added ones, and "return both lists" | **Partial**: the diff-and-apply part is implemented (`relation_detection.sql:46-66`), but nothing returns the lists |
| Open item 4: "S-04's change-set mechanism under A: an RPC that returns the added and removed pairs" | **Open**: not built |

- `context/archive/2026-09-26-auto-relations-memory-map/plan.md:44-45` — S-02 explicitly deferred the change-set API and the edit/delete UI to S-04.
- `context/foundation/tech-stack.md` — `has_background_jobs: false`, `has_realtime: false`. Synchronous in-request re-detection (as implemented) fits. No stack change is needed.

## Related Research

- `context/archive/2026-09-26-auto-relations-memory-map/research.md` — detection options, matching mechanics, change-set idea (Follow-ups 1–3)

## Open Questions (for `/10x-plan`)

1. **Change-set mechanism:** an SQL RPC per operation (atomic, one round trip) or a TS before/after select around a plain update or delete?
2. **Notice delivery:** render the notice in the island before navigating, or carry it across the redirect (query param or one-shot cookie)? Where does the user land after a delete: the note list or the map?
3. **Confirmation UI (FR-006):** a native `confirm()`, an inline two-step button, or a new shadcn `alert-dialog`?
4. **Edit scope:** name and content only (FR-005 wording), or type too? If type is included, may the user create a new custom type during an edit?
5. **Edit page placement:** a separate `/campaigns/[campaignId]/notes/[noteId]/edit` page or in-place editing on the note page?
