<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Edit/Delete with Relation-Change Notice

- **Plan**: context/changes/note-edit-delete-relation-refresh/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding
10/10 paths ✓, 6/6 symbols ✓ (createNoteSchema, isUuid, CampaignView, notes_detect_relations, listRelations, _AssertAssignableToCommand), brief↔plan ✓, Progress↔Phase ✓

Verified: after-row trigger runs inside the UPDATE statement; composite FKs cascade relations on delete; unique index `(campaign_id, lower(name))` permits a case-only self-rename; composite type FK gives 23503 for a foreign type; `updateNoteSchema = createNoteSchema` satisfies the existing compile-time check; `view="note"` is correct for the edit page (`"edit"` maps to campaign rename).

## Findings

### F1 — Contract registry updates cover only the DB layer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §3, Phases 2–4
- **Detail**: Phase 1 updates only the SQL sections of contract-surfaces. The Phase 3 rename leaves `CreateNoteForm`/`useCreateNote` in the Routes entry at contract-surfaces.md:107. The edit page, the PATCH/DELETE API route, the new DTOs and the migration list entry are never registered.
- **Fix**: Add registry items to Phase 1 (Migration file), Phase 2 (API route + DTOs) and Phase 3 (Routes + notice storage key), each with a manual check.
- **Decision**: FIXED. Added Phase 2 §6 and Phase 3 §5, extended Phase 1 §3, and added Progress 2.4 and 3.11.

### F2 — Back button after delete lands on a 404

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §2, Phase 3 §1
- **Detail**: `window.location.assign` leaves the deleted note's page (or the finished edit form) in history.
- **Fix**: Use `window.location.replace` for delete and edit success.
- **Decision**: FIXED

### F3 — Edit response drops the saved name

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1, Phase 3 §1
- **Detail**: `UpdateNoteResponse` has no `name`, so the edit notice would show the untrimmed client-side form value.
- **Fix**: Add `name` to `UpdateNoteResponse` from the RPC's note row, and use it in the notice.
- **Decision**: FIXED

### F4 — Phase 2 doesn't list the service test file it runs

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Changes Required / criterion 2.2
- **Detail**: `notes-service.test.ts` additions appear only under Testing Strategy.
- **Fix**: Add a "Service tests" item to Phase 2.
- **Decision**: FIXED. Added Phase 2 §5.
