<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Edit/Delete with Relation-Change Notice

- **Plan**: context/changes/note-edit-delete-relation-refresh/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification notes

- `npm run test:integration`: 5 files, 62 tests passed. This includes `note-edit-delete-functions` and the `create_note` / relation-detection regression suites.
- `npx supabase db reset` was not re-run during the review because it would wipe local data. `supabase migration list --local` shows `20260930120000` applied.
- Manual 1.4: the contract-surfaces entries match the migration's signatures, return shapes and SQLSTATEs. Ordering is `lower(name), id`; the `id` tie-break is harmless.
- One test was added beyond the plan: a rename that breaks a mention from the other note's side is reported as removed. It is in scope and strengthens the contract.

## Findings

### F1 — No test that a failed update_note leaves no orphan custom type

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/note-edit-delete-functions.test.ts:263
- **Detail**: `create_note` exists so that a failed insert can't leave behind an undeletable custom `note_types` row (`20260924120000_create_note_function.sql:1-3`). `update_note` inherits this through `resolve_note_type` plus function atomicity, and the code is correct (`resolve_note_type` runs inside the same function, so a `23505` from the UPDATE rolls back the type insert). No test pins this down for the edit path, though. The 23505 test uses `p_type_id`, not `p_new_type_name`.
- **Fix**: Add a case: rename to a taken name with `p_new_type_name: "Ghosttype"`, expect `23505`, and check that `countTypes` is unchanged.
- **Decision**: FIXED — added "a failed update with p_new_type_name leaves no orphan custom type" test (passes)

### F2 — Ambiguous "redefined" wording in the create_note contract entry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/reference/contract-surfaces.md:63
- **Detail**: "Type resolution delegates to `public.resolve_note_type` (redefined via `create or replace` in …)" reads as if `resolve_note_type` was redefined. It was `create_note` that was redefined; `resolve_note_type` is new.
- **Fix**: Reword to "`create_note` is redefined via `create or replace` in `20260930120000_note_edit_delete_functions.sql` (same signature and behaviour) and delegates type resolution to `public.resolve_note_type`."
- **Decision**: FIXED — reworded contract-surfaces.md:63
