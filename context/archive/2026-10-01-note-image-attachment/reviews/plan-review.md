<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Image Attachment (S-05) — Phase 1

- **Plan**: context/changes/note-image-attachment/plan.md (scope: Phase 1 — Storage foundation)
- **Mode**: Deep
- **Date**: 2026-10-03
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓, 5/5 symbols ✓ (`notes_campaign_id_id_key`, `storage-api` in CI `-x`, StorageFileApi `:378/:961/:1179`, `createTestUser`), brief↔plan ✓, Progress↔Phase ✓.

The storage-api server behaviour (whether RLS is re-checked on the signed PUT, and whether bucket limits are enforced there) and the Kong `apikey` requirement are not verified from source. Phase 1's assertions settle them.

## Findings

### F1 — The oversized-commit test can't produce its oversized object

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §7 Service flow / §5 commitImage
- **Detail**: If the bucket enforces its limits on the signed path (the likely outcome), a test that holds only the anon key can't create an oversized or disallowed-type object to commit. `info()` returns `size` and `contentType` as optional fields (storage-js `types.ts:197`).
- **Fix**: Add a pure `validateUploadedObject(info)` with unit tests, where a missing `size` or `contentType` counts as invalid. Run the integration oversized commit only if the bucket doesn't enforce its limits.
- **Decision**: FIXED

### F2 — Signed uploads probably skip the INSERT policy at PUT time

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §7 Storage policies
- **Detail**: storage-api likely runs the signed PUT with the owner taken from the token (unverified), so RLS gates only `createSignedUploadUrl`. The tenant-B tests covered only direct `upload()`.
- **Fix**: Add tests that B's `createSignedUploadUrl` fails for A's folder and for B's own folder under A's note id.
- **Decision**: FIXED

### F3 — No limit on how much a user can store

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 storage policies / §5 prepareUpload
- **Detail**: `prepareUpload` counts only committed rows, and the INSERT policy allows unlimited uploads into the user's own note folders. A signed-in user could fill the 1 GB free tier that all users share.
- **Fix A ⭐ Recommended**: Accept and record as a risk.
- **Fix B**: Cap objects per note folder in the INSERT policy.
- **Decision**: ACCEPTED — recorded in `context/foundation/roadmap.md` Observations ("No per-user Storage quota for note images").

### F4 — Position race returns limit_reached by mistake

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §5 commitImage
- **Detail**: Two commits at once on an empty note can both pick position 0. The loser was reported as `limit_reached` even though position 1 was free.
- **Fix**: On a position 23505, work out the free position again and retry once.
- **Decision**: FIXED

### F5 — "createTestNote if none exists" is unclear

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §7 helpers.ts
- **Detail**: `helpers.ts` exports only `createTestUser`. Note helpers are duplicated locally in 3 test files.
- **Fix**: Add `createTestNote` to `tests/integration/helpers.ts` explicitly.
- **Decision**: FIXED

### F6 — The CI change has to land with the migration

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §6 CI
- **Detail**: With `storage-api` excluded, the storage schema may be missing when the migration runs in CI.
- **Fix**: Ship the ci.yml edit in the same commit as the migration.
- **Decision**: FIXED
