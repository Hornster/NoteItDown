<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Edit/Delete with Relation-Change Notice

- **Plan**: context/changes/note-edit-delete-relation-refresh/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
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

- Commit reviewed: `05fa19c`. The eight changed files all match the plan's Phase 2 "Changes Required" list. Nothing is missing and nothing extra was added.
- `npx astro check`: 0 errors, 0 warnings, 0 hints. `npm run lint`: clean. `npm run test:integration -- notes-service`: 9/9 passed.
- Types, schema alias with the assignability check, service result unions, SQLSTATE mapping, route guard order (401 → 500 → `isUuid` 404 → JSON/zod 400 → mapped reasons) and the contract-surfaces section all match the plan as written.
- The route mirrors `PATCH /api/campaigns/[campaignId]` (guards, `fieldFromPath`, `console.error` with an eslint justification, generic 500). It adds a local `jsonOk` helper where the sibling routes build the `Response` inline. This is a harmless difference and is not reported as a finding.
- Phase 3/4 interaction: `countNoteRelations` is only called from `[noteId].astro:37` with `note.id` from the DB, after an `isUuid` check.

## Findings

### F1 — countNoteRelations interpolates noteId into a PostgREST `.or()` filter

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/relations.ts:30
- **Detail**: `.or(\`note_a_id.eq.${noteId},note_b_id.eq.${noteId}\`)` builds a PostgREST filter string from the argument. The only caller today passes a DB-sourced uuid that has already passed `isUuid`, so nothing is exploitable now. RLS also limits any filter tampering to the caller's own rows. Still, the service doesn't check its own input, so a future caller passing a raw route param could inject extra filter terms (for example `x,id.not.is.null`) and get a wrong count.
- **Fix**: Add an `isUuid(noteId)` guard at the top of `countNoteRelations` that returns 0 (or throws), so the service checks its own input.
- **Decision**: FIXED — added `isUuid` guard returning 0 plus doc note; lint clean, notes-service 9/9 pass

### F2 — Route status mapping is only covered by manual curl (2.3)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/api/campaigns/[campaignId]/notes/[noteId].ts
- **Detail**: Manual 2.3 (PATCH change set, DELETE `removed`, foreign id → 404) is ticked `[x]` but leaves no evidence in the diff. The service-level reason mapping is covered by integration tests. The route's own HTTP mapping (409/400/404/401) is not, which matches the repo's convention (no route-level tests exist). The smoke script also doesn't touch these endpoints. This is acceptable as is, and noted for traceability.
- **Fix**: No change needed. Optionally, extend `scripts/smoke.mjs` later with an unauthenticated PATCH/DELETE → 401 check.
- **Decision**: FIXED — added 3 smoke steps to `scripts/smoke.mjs`: PATCH malformed note id → 404, DELETE unknown note → 404 (P0002 path), anonymous DELETE → 401. `npm run smoke` against preview: all 21 steps pass
