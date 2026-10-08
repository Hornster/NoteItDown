<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Image Attachment (S-05) Implementation Plan

- **Plan**: context/changes/note-image-attachment/plan.md
- **Scope**: Phase 1 of 5
- **Reviewed phases**: 1
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Notes:
- **Plan Adherence**: all 8 planned items MATCH. The conditional oversized-commit test was omitted on purpose because the bucket enforces its limits (tests L425-427).
- **Scope Discipline**: the additions are benign and need no action:
  - `note_images_campaign_id_idx`
  - a named `note_images_thumb_consistency_check`
  - a `noteExists` pre-check
  - FK and 42501 errors mapped to `not_found`
  - `globalIgnores(["context/**"])` in `eslint.config.js`
  - the roadmap status flip
- **Success Criteria**:
  - Passing on 2026-10-06: lint, `astro sync && astro check`, unit tests (84), integration tests (86), and the CI `-x` list (no `storage-api`).
  - 1.1 `supabase db reset` was **not** re-run, to avoid wiping local data. `supabase migration list --local` shows `20261003120000` applied locally and remotely.
  - 1.7 was confirmed by SQL: `note-images` has `public=f`, a limit of `2621440`, and `{image/webp,image/jpeg}`.
  - 1.8 is confirmed in `docs/reference/contract-surfaces.md:68-71`, and it matches the test assertions.

## Findings

### F1 — Replayed commit deletes an already-committed image's files

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/note-images.ts:288-291, 334-362
- **Detail**: `fail()` always removes `[path, thumbPath]`.
  - **How it happens:** a second `commitImage` call with a path that is already committed passes `isOwnImagePath` and `info()`, because the object exists. Then one of two things fails:
    - with one image on the note, the insert fails with 23505 on `note_images_path_key`. That is not a position conflict, so it reaches `fail(unexpected)`;
    - with two images, `lowestFreePosition` returns null, so it reaches `fail(limit_reached)`.
  - Both paths delete the live row's objects.
  - **Result:** a `note_images` row pointing at a missing file, which violates the plan's "never leave a row pointing at a missing file" rule. Later, `getImageUrls` returns a 500 for that image.
  - **Trigger:** a replayed or duplicated commit POST, for example a proxy retry or a double submit. The client doesn't auto-retry today.
- **Fix A ⭐ Recommended**: In `fail()`, before removing, query `note_images` for any row whose `path` or `thumb_path` equals `path` or `thumbPath`, and skip removing those paths. Add an integration test that commits the same path twice and asserts the object still exists.
  - Strength: Covers every failure branch at once (unexpected, limit_reached, catch). It is one choke point, so future branches are covered too.
  - Tradeoff: One extra query on the failure path only.
  - Confidence: HIGH — the bug path was confirmed by reading the code; the fix is local to the service.
  - Blind spot: A concurrent commit could insert the row between that check and the removal. This is very unlikely, given the client flow.
- **Fix B**: Treat a 23505 on `note_images_path_key` as an idempotent success that returns the existing row's `{ id, position }`.
  - Strength: True idempotency, so a retry gets the same 201 response.
  - Tradeoff: Doesn't cover the `limit_reached` branch (a note with two images), so Fix A's guard would still be needed there.
  - Confidence: MED — the existing row's `thumb_path` would also need checking against the command.
  - Blind spot: Phase 2 route semantics (201 vs 200) for a replay.
- **Decision**: FIXED (Fix A) — `unreferencedPaths` guard in `fail()`; integration test "a replayed commit fails without removing the committed image's objects" (fails without the fix, passes with it).

### F2 — `thumb_path` user folder unchecked in the `note_images` insert policy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261003120000_note_images.sql:41-51, 63-68
- **Detail**:
  - `note_images_insert_own_campaign` pins `split_part(path,'/',1) = auth.uid()` but not segment 1 of `thumb_path`, and the path-shape check only pins segments 2 and 3. Neither the policy nor the check rejects `..` or extra segments; only the service regex does.
  - A direct PostgREST insert can therefore store a `thumb_path` under a different user's folder.
  - It is not exploitable as far as we can tell: signing and removal run as the row owner, and the storage SELECT/DELETE policies reject foreign folders. It is a defence-in-depth asymmetry with `path`.
- **Fix**: Add a new migration that recreates the insert policy with `and (thumb_path is null or split_part(thumb_path,'/',1) = (select auth.uid())::text)`. Optionally tighten the shape check to exactly 4 segments. Add one integration test.
- **Decision**: FIXED — new migration `20261006120000_note_images_thumb_path_owner.sql` (applied locally; needs `npx supabase db push` for production); integration test "rejects an insert whose thumb_path belongs to another user's folder" (failed before the migration, passes after); contract-surfaces updated.

### F3 — Uncommitted uploads are unbounded per note, and `removeNoteFolder` lists one flat page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/note-images.ts:218-258, 423-444
- **Detail**: Note delete removes the folder, which the plan accepts for orphans. But the count of objects under an owned note folder is unbounded:
  - repeated `prepareUpload` calls only count committed rows;
  - the storage INSERT policy allows direct uploads with the user's JWT.

  `removeNoteFolder` lists one page (limit 1000) and doesn't recurse into sub-folders, so a user who deliberately overfills their folder leaks objects. This is a storage-quota abuse vector that contract-surfaces doesn't record.
- **Fix**: Record it as an accepted MVP risk in the "Storage: note-images bucket" section of contract-surfaces. Pagination and recursion can wait for the parked sweep.
- **Decision**: FIXED — accepted-risk note added under "Cleanup obligations" in contract-surfaces (also updated the failed-commit cleanup wording for F1).

### F4 — Storage-denial tests assert only that an error happened

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/note-images.test.ts:171-182
- **Detail**:
  - Tenant B's upload and sign denials only check `error` is not null, so a network or MIME error would also pass. They don't prove the RLS policy fired.
  - Negative cases are missing for:
    - the caller's own note under a different campaign of their own (exercises `n.campaign_id = c.id`);
    - a non-existent note id;
    - commit-failure cleanup;
    - `deleteImage` ordering.
- **Fix**: Assert the RLS-specific status or message (403 or "row-level security") on the denial cases, and add the own-note/other-campaign case. The F1 and F2 tests cover the rest.
- **Decision**: FIXED — `expectRlsDenied` helper asserts body `statusCode: "403"` + "row-level security" message on the upload/sign denials; new test "blocks uploading under the owner's own note paired with another of their campaigns".

### F5 — Bucket insert `on conflict do nothing` won't correct a pre-existing bucket

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261003120000_note_images.sql:8-10
- **Detail**: If the hosted `note-images` bucket existed before `db push` (for example, created by hand in the dashboard), its `public`, limit and MIME settings stay as they were, silently. The locally checked state is correct.
- **Fix**: Confirm once in the hosted dashboard that `note-images` is private, 2,621,440 B, and webp/jpeg only. No code change unless it differs.
- **Decision**: FIXED — user verified the hosted bucket on 2026-10-06: private, 2,621,440 B limit, `image/webp` and `image/jpeg` only. No code change.
