# Note Image Attachment (S-05) Implementation Plan

## Overview

Let a user attach up to 2 images to a note, on both the create and edit forms. Every image is re-encoded in the browser to WebP (JPEG on Safari) under a 2.4 MiB ceiling, with a ≤ 512 px thumbnail. Images are stored in a private Supabase Storage bucket, with metadata in a `note_images` table. The note page shows thumbnails; clicking one opens a popup with the full-size image through a short-lived signed URL. HEIC files the browser can't decode are converted through a lazily loaded `heic-to`, and a public `/licenses` page linked from a new footer carries its LGPL notices.

Roadmap S-05, PRD FR-004. Up to 2 images per note is a deliberate scope change recorded in `change.md`.

## Current State Analysis

- Notes are plain text (`notes.content`, `supabase/migrations/20260922120000_campaign_notes_schema.sql:64`). Relation detection reads only `name`/`content` (`20260926120000_relation_detection.sql:112-114`). Images that live in a separate table can't affect FR-007 matching.
- The Supabase client is server-only (`src/lib/supabase.ts:5-24`, anon key from `astro:env/server`). The browser has no Supabase client; hooks call the app's own API with `fetch` (`src/components/hooks/useSaveNote.ts:35`).
- Storage is enabled locally (`supabase/config.toml:109-112`), but no bucket, `storage.objects` policy or image code exists yet.
- CI starts local Supabase **without** `storage-api` (`.github/workflows/ci.yml:42`), so Storage can't be exercised in CI as configured.
- `NoteForm.tsx` serves both create and edit (`src/components/notes/NoteForm.tsx:31`). `useSaveNote` navigates away as soon as it gets a 201 or 200 (`useSaveNote.ts:41-58`), so the image steps have to run before that navigation.
- Note delete goes through `delete_note` (`20260930120000_note_edit_delete_functions.sql:152-182`), wrapped by `deleteNote` (`src/lib/services/notes.ts:201-220`) and the `DELETE` route (`src/pages/api/campaigns/[campaignId]/notes/[noteId].ts:76-103`). A SQL cascade would remove `note_images` rows but never the files in Storage.
- The app has no campaign-delete flow (`src/pages/api/campaigns/index.ts` exports only `POST`, `[campaignId]/index.ts` only `PATCH`).
- `Layout.astro` has no footer (`src/layouts/Layout.astro:21-37`). shadcn `Dialog` is not installed (`src/components/ui/` has only `alert-dialog`, `button`, `label`, `textarea`).
- Error strings, SQLSTATEs and HTTP statuses are hard-coded in every route (roadmap Observations, `context/foundation/roadmap.md:171-173`).
- Vitest runs with `environment: "node"` (`vitest.config.ts:17`), so there's no canvas in unit tests. Integration tests sign up throwaway users via `createTestUser` (`tests/integration/helpers.ts:14`) against local Supabase only.

## Desired End State

- On the create and edit forms, the user can pick up to 2 images (jpeg, png, webp, gif, heic/heif). Each pick is processed immediately ("Processing…", then a preview), can be given optional alt text, and can be removed before saving. A hint says images are compressed. Picking a GIF or WebP shows "Animated images become static".
- Image changes are held until the user clicks Save. Create saves the note first, then uploads. Edit saves the text, then applies removals, alt-text changes and uploads. If any image step fails, the note is kept and the user lands on the edit form with a notice naming which images failed.
- The note page shows each image's thumbnail at its stored dimensions with no layout shift. Clicking one opens a `Dialog` with the full-size image; its signed URL is fetched only on open. If a thumbnail fails to load, its URLs are refreshed once.
- Deleting a note removes its image files from Storage.
- Another account can't read, list, upload into or delete a user's images. Integration tests in CI prove it.
- `/licenses` is public and lists `heic-to`, libheif and libde265 with versions, licences, copyright lines, source links and the full LGPL-3.0 and GPL-3.0 texts. Every page has a footer linking to it.

Verify with `npm run lint`, `npx astro check`, `npm test` (unit and integration against local Supabase with Storage), `npm run build`, and the manual browser checks listed per phase.

### Key Discoveries:

- `remove()` needs **SELECT and DELETE** on `storage.objects` (`node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:1179`). `createSignedUploadUrl` needs INSERT (`:378`). The signed upload URL is valid for a fixed 2 hours (`:348,382`). `info()` returns object metadata, including size (`:961`).
- After `delete_note` runs, the note row is gone. A SELECT or DELETE policy that joins to `notes` would block the cleanup, so only INSERT may check note ownership.
- Column UPDATE grants follow `supabase/migrations/20260923120000_restrict_update_columns.sql`. Composite campaign-scoped FKs follow schema `:67-71`.
- API patterns to follow are in `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts`: the 401 → 500 → `isUuid` 404 guard order, `jsonError` (`src/lib/api.ts:4`), typed service result unions, and logging unexpected failures with `console.error`.
- The one-shot `sessionStorage` notice pattern is in `src/lib/relation-notice.ts` and is consumed by `RelationChangeNotice`.
- The pipeline base is `context/changes/note-image-attachment/references/compress-to-webp.js`. The required changes are listed in `change.md` "Compression pipeline details".

## What We're NOT Doing

- **Campaign-deletion cleanup.** The app has no campaign-delete flow. Recorded in contract-surfaces as an obligation for whoever adds one.
- **Migrating existing routes to the new error dictionaries.** Only code added in S-05 uses them; S-01–S-04 code migrates in a later change.
- Reordering images, more than 2 per note, server-side re-encoding or EXIF stripping, Supabase image transformations, and a WASM WebP encoder (`@jsquash/webp`).
- Preserving animation in GIF/WebP files, or detecting it.
- Images on the notes list or the memory map.
- MIT notices for the other bundled dependencies on `/licenses` (parked in the roadmap).
- A CSP. If one is added later without `unsafe-eval`, switch to `heic-to/csp` (noted in `change.md`).
- Mobile layout checks (parked in the roadmap).
- A scheduled sweep for abandoned uploads. Note delete removes the whole note folder, which catches them; anything else is an accepted orphan.

## Implementation Approach

The browser talks only to the app's API. Bytes skip the Worker through a three-step flow:

1. **Prepare.** `POST .../images/uploads` checks note ownership and the image count. It builds the paths on the server and returns signed upload URLs.
2. **Upload.** The browser PUTs the bytes straight to Storage.
3. **Commit.** `POST .../images` verifies the objects with `info()` (path prefix, size, content type), picks the free position, and inserts the row. If the insert fails, it removes the objects.

Database rules are the source of truth: a 2-image cap via `position in (0,1)` plus `unique (note_id, position)`, campaign-scoped FKs, RLS, and `storage.objects` policies. TypeScript checks give early, friendly errors on top.

Browser processing happens on pick, so errors show next to the file and Save only does network work. Processing code is loaded with `await import()` inside handlers so it stays out of the Worker bundle.

## Critical Implementation Details

**Policy asymmetry on `storage.objects`.** INSERT checks folder 1 = `auth.uid()` **and** that folders 2/3 name a campaign and note the user owns. SELECT and DELETE check only folder 1 = `auth.uid()`, so cleanup still works after the note row is gone. Compare path segments as `text` (`n.id::text = (storage.foldername(name))[3]`); never cast a segment to `uuid`, because that throws on malformed paths. Create no UPDATE policy, and never pass `upsert`.

**Ordering.**
- **Commit:** objects first, then the row. If the insert fails, remove the objects.
- **Image delete and note delete:** row first, then objects. If object removal fails, log it and accept the orphan. Never leave a row pointing at a missing file.
- **Edit save:** PATCH the text, then delete removed images, then PATCH alt text, then upload new images. Deleting before uploading frees a position when the user replaces an image on a note that already has 2.

**Byte units.** The bucket's `file_size_limit` is `2621440` (2.5 MiB, set in bytes). The client ceiling is `2516582` (2.4 MiB). Both come from one shared constants module, and the migration value is written to match it.

**Signed-upload unknowns.** Phase 1 tests two things against local Supabase: whether a bare `fetch` PUT to the signed URL works **without** an `apikey` header, and whether the bucket's size and MIME limits reject an oversized or disallowed upload on the signed path.
- If `apikey` is required, the prepare response also returns the anon key. It is public by design (PostgREST already exposes it to RLS); record that in contract-surfaces.
- If the bucket doesn't enforce its limits on the signed path, the commit-time `info()` check is the guard. It runs either way.

**iOS blank canvas.** On the WebP path, sample a few pixels after `drawImage`. If every sampled pixel has alpha 0, fail with a typed "browser failure" error instead of uploading a blank image. Skip the guard on the JPEG path: the white fill means a blank canvas isn't transparent there, and the area cap already keeps canvases within the iOS limit.

## Phase 1: Storage foundation

### Overview

The database and Storage rules, shared constants, types and schemas, the new error dictionaries, the `note-images` service, CI with Storage enabled, and integration tests that prove isolation and settle the signed-upload unknowns. No HTTP routes or UI yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261003120000_note_images.sql`

**Intent**: Create the private bucket, the `note_images` table with its RLS, and the per-operation `storage.objects` policies in one migration, so local and hosted environments match. `config.toml` bucket blocks apply only to `supabase start`.

**Contract**:
- `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('note-images', 'note-images', false, 2621440, array['image/webp','image/jpeg'])` (idempotent with `on conflict do nothing`).
- Table `public.note_images` columns:
  - `id uuid pk default gen_random_uuid()`
  - `campaign_id uuid not null`, `note_id uuid not null`
  - `position smallint not null check (position in (0,1))`
  - `path text not null unique`, `thumb_path text unique` (nullable: null when the original fits within 512 px)
  - `mime text not null check (mime in ('image/webp','image/jpeg'))`
  - `width`, `height` (`int not null check (> 0)`); `thumb_width`, `thumb_height` (`int`, null together with `thumb_path`, enforced by a check)
  - `byte_size int not null check (byte_size between 1 and 2621440)`
  - `alt_text text check (alt_text is null or (alt_text = btrim(alt_text) and alt_text <> '' and char_length(alt_text) <= 200))`
  - `created_at timestamptz not null default now()`
- Constraints:
  - `note_images_note_position_key unique (note_id, position)`
  - FK `note_images_note_same_campaign_fkey (campaign_id, note_id) → notes (campaign_id, id) on delete cascade`
  - a path-shape check requiring `split_part(path,'/',2) = campaign_id::text and split_part(path,'/',3) = note_id::text` (same for `thumb_path` when not null)
- RLS enabled. Policies `note_images_select_own_campaign`, `note_images_insert_own_campaign` and `note_images_delete_own_campaign` use the same `campaigns.owner_id = auth.uid()` join as the `notes` policies. The insert policy also requires `split_part(path,'/',1) = auth.uid()::text`. `note_images_update_own_campaign` exists for the alt-text grant only.
- `revoke update on public.note_images from anon, authenticated; grant update (alt_text) on public.note_images to authenticated;`
- `storage.objects` policies, all scoped `to authenticated` and `bucket_id = 'note-images'`:
  - `note_images_objects_insert_own_note`: folder[1] = uid **and** an `exists` join from `public.notes` to `public.campaigns` on folder[2]/[3] as text.
  - `note_images_objects_select_own_folder`: folder[1] = uid.
  - `note_images_objects_delete_own_folder`: folder[1] = uid.
  - No UPDATE policy.

#### 2. Shared limits and types

**File**: `src/lib/images/limits.ts` (new), `src/types.ts`

**Intent**: One source for every number the client, server and tests share, plus entity and DTO types.

**Contract**:
- `limits.ts` exports:
  - `NOTE_IMAGES_BUCKET = "note-images"`
  - `MAX_IMAGES_PER_NOTE = 2`
  - `MAX_IMAGE_BYTES = 2_621_440`, `CLIENT_IMAGE_CEILING_BYTES = 2_516_582`
  - `THUMBNAIL_MAX_SIDE = 512`, `MAX_CANVAS_AREA = 16_777_216`, `MAX_IMAGE_SIDE = 16_383`
  - `STORED_IMAGE_MIMES = ["image/webp", "image/jpeg"] as const`
  - `PICKER_ACCEPT` (jpeg, png, webp, gif, heic, heif plus `.heic,.heif`)
  - `ALT_TEXT_MAX_LENGTH = 200`
- `types.ts` gains:
  - `NoteImage` (mirrors the table)
  - `NoteImageView { id, position, alt_text, width, height, thumb_width, thumb_height, thumb_url: string | null }` (`thumb_url` is the signed thumbnail URL, or the original's when there is no separate thumbnail; null when signing failed)
  - `PrepareUploadCommand { mime; with_thumbnail: boolean }`
  - `PrepareUploadResponse { image: SignedUpload; thumbnail: SignedUpload | null; apikey?: string }` where `SignedUpload { path; signed_url; token }`
  - `CommitImageCommand { path; thumb_path; width; height; thumb_width; thumb_height; alt_text }`
  - `UpdateImageCommand { alt_text: string | null }`
  - `CommitImageResponse { id; position }`, `UpdateImageResponse { id; alt_text }` (no signed URLs; nothing on the save path reads them)
  - `ImageUrlsResponse { url; thumb_url }`
- `ApiError["field"]` gains `"images"`.

#### 3. Error dictionaries (new code only)

**File**: `src/lib/http-status.ts`, `src/lib/db-error-codes.ts`, `src/lib/messages.ts` (all new); `context/foundation/lessons.md`

**Intent**: Start the central dictionaries the roadmap observation asks for, and use them in everything S-05 adds. Existing routes are untouched.

**Contract**:
- `HTTP_STATUS` (const object: `OK`, `CREATED`, `BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `INTERNAL_SERVER_ERROR`).
- `PG_ERROR` (`UNIQUE_VIOLATION: "23505"`, `FOREIGN_KEY_VIOLATION: "23503"`, `CHECK_VIOLATION: "23514"`, `INSUFFICIENT_PRIVILEGE: "42501"`, `NO_DATA_FOUND: "P0002"`, `INVALID_PARAMETER_VALUE: "22023"`).
- `MESSAGES` (user-facing strings such as `SIGNED_IN_REQUIRED`, `SUPABASE_NOT_CONFIGURED`, `NOTE_NOT_FOUND`, `IMAGE_LIMIT_REACHED`, `IMAGE_NOT_FOUND`, `IMAGE_UPLOAD_INVALID`, `GENERIC_IMAGE_ERROR`), with values matching today's literals where the meaning is the same.
- Append a lessons.md entry ("Use the central error/status/message dictionaries in new code") with Context `roadmap.md` Observations, Applies to plan, implement, impl-review.

#### 4. Zod schemas

**File**: `src/lib/schemas/note-images.ts` (new), `src/lib/schemas/note-images.test.ts` (new)

**Intent**: Validate the prepare, commit and alt-text bodies with `.strict()`, following `src/lib/schemas/notes.ts`.

**Contract**:
- `prepareUploadSchema`: `mime` in `STORED_IMAGE_MIMES`, `with_thumbnail` boolean.
- `commitImageSchema`: paths are strings; dimensions are positive ints ≤ `MAX_IMAGE_SIDE`; thumbnail fields are all null or all set; `alt_text` is trimmed, empty becomes null, ≤ `ALT_TEXT_MAX_LENGTH`.
- `updateImageSchema`: `{ alt_text }` with the same rules.
- Unit tests cover boundaries (200 vs 201 chars, whitespace-only alt text becoming null, mismatched thumbnail nullability, an unknown key).

#### 5. Service

**File**: `src/lib/services/note-images.ts` (new)

**Intent**: All Storage and `note_images` access behind typed result unions, so routes stay thin and integration tests can drive the flow with a user client.

**Contract**:
- `buildImagePaths(userId, campaignId, noteId, mime, withThumbnail) → { path, thumbPath | null }`: `{uid}/{campaign}/{note}/{uuid}.{webp|jpg}` and `{uuid}-thumb.{ext}`, with a fresh `crypto.randomUUID()`.
- `isOwnImagePath(path, userId, campaignId, noteId)`: strict regex on the prefix, the uuid and an allowed extension.
- `listNoteImages(supabase, noteId) → NoteImage[]`, ordered by `position`.
- `toImageViews(supabase, images) → NoteImageView[]`: one batched `createSignedUrls` call, 6 h expiry. A per-item error gives `thumb_url: null` and never throws.
- `prepareUpload(supabase, userId, campaignId, noteId, cmd)`: reasons `not_found`, `limit_reached` (count ≥ 2) and `unexpected` (count query or `createSignedUploadUrl` failed, with `error`); returns `PrepareUploadResponse`.
- `commitImage(supabase, userId, campaignId, noteId, cmd)`:
  1. checks paths with `isOwnImagePath`;
  2. calls `info()` on each object and passes the result to the pure, exported `validateUploadedObject(info) → { ok: true; size; contentType } | { ok: false }`, which checks size ≤ `MAX_IMAGE_BYTES` and content type in the allow-list (a missing `size` or `contentType` counts as invalid, since both are optional in storage-js `FileObjectV2`);
  3. picks the lowest free position and inserts;
  4. on `23505` for `note_images_note_position_key`, works out the free position again and retries the insert once; maps it to `limit_reached` only if no position is free;
  5. on any failure after upload, removes both objects.
  Returns `CommitImageResponse`. Reasons: `not_found`, `invalid_upload`, `limit_reached`, `unexpected`.
- Item services take `campaignId`, `noteId` and `imageId` and filter on all three (`campaign_id`, `note_id`, `id`), so the URL stays authoritative like `deleteNote`. Each returns a typed union that includes `unexpected` (with `error`) for DB or Storage failures, kept apart from `not_found`.
- `updateImageAltText(supabase, campaignId, noteId, imageId, altText) → UpdateImageResponse`: reason `not_found` (no row updated).
- `deleteImage(supabase, campaignId, noteId, imageId)`: deletes the row (RLS), then removes both objects, logging a removal error and still returning success. Reason `not_found` when no row was deleted.
- `removeNoteFolder(supabase, userId, campaignId, noteId)`: list the prefix, then `remove`, ≤ 1000 per call. Errors are logged and swallowed.
- `getImageUrls(supabase, campaignId, noteId, imageId)`: success `ImageUrlsResponse`, reason `not_found` (no row) or `unexpected` (signing failed). Full-size URL expires in 300 s, thumbnail in 6 h.

#### 6. CI and local config

**File**: `.github/workflows/ci.yml`

**Intent**: Start the Storage container in CI so the policy tests run on every push.

**Contract**: remove `storage-api` from the `supabase start -x` list. Keep `imgproxy` excluded. Ship this edit in the same commit as the migration. With `storage-api` excluded, the `storage` schema may not exist when `supabase start` applies a migration that writes to `storage.buckets`/`storage.objects`, and the CI job would fail.

#### 7. Integration tests

**File**: `tests/integration/note-images.test.ts` (new), `tests/integration/helpers.ts`

**Intent**: Prove the DB and Storage rules with two tenants. Settle the signed-upload unknowns as assertions, not a throwaway spike.

**Contract**:
- `helpers.ts` gains a tiny valid WebP/JPEG fixture builder (static byte arrays) and a new `createTestNote(client, campaignId, name?)` helper (none exists in `helpers.ts` today). The per-file note helpers in the existing test files stay as they are.
- Table rules:
  - The 2-image cap holds: inserting a third row fails, and so does a duplicate position.
  - A row with a `campaign_id`/`note_id` mismatch fails the composite FK.
  - The path-shape check rejects a path whose segments don't match.
  - Only `alt_text` is updatable; changing `path` is denied.
  - Note delete cascades the rows.
- Storage policies, with tenant B:
  - B can't upload into A's folder, or into its own folder under A's note id;
  - B's `createSignedUploadUrl` fails for the same two paths (the signed PUT likely runs without re-checking RLS, so signing is the gate the app actually relies on);
  - B can't `list`, `createSignedUrl` or `remove` A's objects;
  - A can remove its own objects after its note row is deleted.
- Signed upload, with assertions that record the observed behaviour:
  - a bare `fetch` PUT without `apikey`;
  - an oversized body (> 2,621,440 B) on the signed path;
  - a disallowed content type (`image/png`) on the signed path.
- Service flow: prepare → PUT → commit gives one row and a view with a `thumb_url`. Commit with a foreign path gives `invalid_upload`. `removeNoteFolder` empties the prefix.
- Commit with an oversized or disallowed-type object (`invalid_upload`, object removed) runs **only if** the signed-upload assertions show the bucket does not enforce its limits. Otherwise no anon-key client can create such an object, and the check is covered by the `validateUploadedObject` unit tests.
- `src/lib/services/note-images.test.ts` (new, unit): `validateUploadedObject` accepts size = `MAX_IMAGE_BYTES` and rejects +1, rejects `image/png`, and rejects a missing `size` or `contentType`.

#### 8. Contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the load-bearing names introduced here.

**Contract**:
- New sections "note_images" and "Storage: note-images bucket" (bucket id, limits, path format, policy names, the asymmetry rule).
- The new dictionaries under "Shared TypeScript types" or a new "Shared constants" section.
- A migration-file entry.
- The campaign-delete cleanup obligation.
- The signed-upload `apikey` outcome.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local database: `npx supabase db reset`
- Lint passes: `npm run lint`
- Type check passes: `npx astro sync && npx astro check`
- Unit tests pass, including the note-images schema and `validateUploadedObject` tests: `npm run test:unit`
- Integration tests pass, including `note-images.test.ts` cross-tenant and signed-upload assertions: `npm run test:integration`
- CI workflow starts Supabase with `storage-api` (no `storage-api` in the `-x` list of `.github/workflows/ci.yml`)

#### Manual Verification:

- In local Studio, bucket `note-images` is private with a 2,621,440 B limit and only `image/webp`/`image/jpeg` allowed
- The signed-upload findings (apikey needed or not; bucket limits enforced on the signed path or not) are written into contract-surfaces and match the test assertions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Image API and note-delete cleanup

### Overview

The HTTP surface over the Phase 1 service, plus Storage cleanup in the existing note delete. Everything new uses the Phase 1 dictionaries.

### Changes Required:

#### 1. Upload prepare route

**File**: `src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/uploads.ts` (new)

**Intent**: Hand out signed upload URLs for a note the caller owns, while the note has fewer than 2 images.

**Contract**: `POST`, `prerender = false`. Guard order: 401 → 500 (Supabase not configured) → 404 on a non-uuid → 400 on a bad JSON or zod body → 404 when the service reports `not_found` → 409 `{ field: "images" }` when `limit_reached` → 500 (generic `MESSAGES.GENERIC_IMAGE_ERROR`, logged with `console.error`) when `unexpected` → 200 `PrepareUploadResponse`. The user id always comes from `context.locals.user.id`, never from the body.

#### 2. Images collection and item routes

**File**: `src/pages/api/campaigns/[campaignId]/notes/[noteId]/images.ts` (new), `src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/[imageId].ts` (new)

**Intent**: Commit an upload, read fresh signed URLs, change alt text, and delete one image.

**Contract**:
- Every route uses the same 401 → 500 → `isUuid` guard order as `[noteId].ts` (`imageId` included). Routes with a body then return 400 (no `field`) on non-JSON or a zod failure. Every route maps the service's `unexpected` reason to a 500 with `MESSAGES.GENERIC_IMAGE_ERROR`, logged with `console.error`.
- `POST .../images` (commit): body `CommitImageCommand`. Responses:
  - 201 `CommitImageResponse`
  - 400 on bad JSON or zod; 400 `{ field: "images" }` for `invalid_upload`
  - 404
  - 409 for `limit_reached`
  - 500 (generic, logged)
- `GET .../images/[imageId]`: 200 `ImageUrlsResponse` with `Cache-Control: no-store`; 404 when the image isn't on this campaign and note or isn't the caller's; 500 when signing fails.
- `PATCH .../images/[imageId]`: body `UpdateImageCommand`; 400 on bad JSON or zod; 200 `UpdateImageResponse`; 404; 500.
- `DELETE .../images/[imageId]`: 200 `{ id }`; 404; 500.

Astro routing: `images.ts` next to the `images/` directory follows the existing `[campaignId]/notes.ts` + `notes/[noteId].ts` layout, which already works.

#### 3. Note delete cleanup

**File**: `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts`

**Intent**: After `deleteNote` succeeds, remove the note's Storage folder so neither committed nor abandoned uploads stay billed.

**Contract**: on `result.success`, `await removeNoteFolder(supabase, context.locals.user.id, campaignId, noteId)` before `jsonOk`. Never change the response shape or status because cleanup failed (it logs). `DeleteNoteResponse` and the `delete_note` RPC stay unchanged.

#### 4. Contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Document the four routes (guard order, bodies, statuses) and the new cleanup step in note `DELETE`.

**Contract**: a new "Image API" section next to the existing note routes, plus a line added to the `PATCH`/`DELETE` note section.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Unit and integration tests pass: `npm test`
- Integration test: deleting a note through `deleteNote` then `removeNoteFolder` leaves no objects under the note prefix
- Production build succeeds: `npm run build`

#### Manual Verification:

- With `npm run dev` (check for a running dev server first, per lessons.md), the full prepare → PUT → commit → GET → PATCH → DELETE sequence works from the browser devtools console against your own note
- The same calls against another account's note return 404 (prepare, commit, GET, PATCH, DELETE)
- Deleting a note that has images via the existing delete button leaves its folder empty in Studio

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Browser pipeline and form attach

### Overview

The hand-written compression pipeline, the picker in `NoteForm`, and save orchestration that holds image changes until Save on both create and edit, with the failure notice. HEIC files get an "unsupported" error until Phase 5.

### Changes Required:

#### 1. Compression pipeline

**File**: `src/lib/images/compress.ts` (new), `src/lib/images/errors.ts` (new), `src/lib/images/compress.test.ts` (new), `src/lib/images/heic.ts` (new), `src/lib/images/heic.test.ts` (new)

**Intent**: Port `references/compress-to-webp.js` to strict TypeScript with the decided changes: start quality 0.8, area and side caps instead of the 4096 px cap, one decode producing both outputs, and a JPEG fallback on a white background. Split it so the maths is unit-testable in Node.

**Contract**:
- Pure, exported and unit-tested:
  - `fitDimensions(w, h) → { width, height }`: ≤ `MAX_CANVAS_AREA`, ≤ `MAX_IMAGE_SIDE`, aspect ratio kept, each side clamped to ≥ 1 px (`Math.max(1, Math.round(…))`, as in the reference); 2000×12000 gives about 1672×10033.
  - `thumbnailDimensions(w, h) → { width, height } | null`: null when the longest side is ≤ 512; each side clamped to ≥ 1 px (16383×1 gives 512×1).
  - `bestUnderBudget(encodeAt, opts)`: injected encoder; the first try is at 0.8; never inflates.
- Browser-only: `processImage(source: Blob) → Promise<ProcessedImage>`, where `ProcessedImage = { image: Encoded; thumbnail: Encoded | null }` and `Encoded = { blob, width, height, type: "image/webp" | "image/jpeg" }`.
  - Decode once with `createImageBitmap(source, { imageOrientation: "from-image" })`.
  - Probe WebP support once; otherwise use JPEG with `fillStyle = "#fff"; fillRect` before `drawImage`.
  - Check every output's `type`.
  - Downscale only while the result is still over `CLIENT_IMAGE_CEILING_BYTES` at `minQuality`.
  - Release memory: `bitmap.close()`, zero the canvas size.
  - Run the blank-canvas guard on the WebP path only (see "iOS blank canvas" above).
- Typed errors: `UnsupportedImageError` (any decode failure; `compress.ts` itself never checks for HEIC), `ImageTooLargeError` (can't get under the ceiling at the minimum dimension), `BrowserImageError` (blank canvas, no OffscreenCanvas or `from-image` support, encoder failure), and `HeicNotSupportedYetError` until Phase 5 replaces that path.
- HEIC detection: `src/lib/images/heic.ts` (new) exports the pure `looksLikeHeic(bytes: Uint8Array) → boolean`. It reads the ISO-BMFF `ftyp` box at offset 4 and checks the major brand against `heic`, `heix`, `heim`, `heis`, `hevc`, `hevx` and `mif1`. It is unit-tested on hand-built headers and imports nothing from `heic-to`. The picker reads the file's first 32 bytes only after an `UnsupportedImageError`; if `looksLikeHeic` matches, it shows `HeicNotSupportedYetError` instead.

#### 2. Picker component

**File**: `src/components/notes/NoteImagePicker.tsx` (new)

**Intent**: Pick, process on pick, preview, set alt text and remove images, within the 2-image cap.

**Contract**:
- Props: `existing: NoteImageView[]` (edit mode), plus a controlled value and `onChange` for the held state `{ kept: NoteImageView[]; removedIds: string[]; altEdits: Record<id, string | null>; added: PendingImage[] }`, where `PendingImage = { key, fileName, status: "processing" | "ready" | "error", processed?, previewUrl?, error?, alt_text }`.
- Behaviour:
  - The `<input type="file" accept={PICKER_ACCEPT}>` is disabled when kept + added reaches 2. Picks with status `error` don't count toward the cap; picks that are `processing` or `ready` do.
  - `processImage` is loaded with `await import("@/lib/images/compress")` inside the change handler, behind an `if (import.meta.env.SSR) return;` guard. NoteForm is server-rendered, so without the guard Rollup still emits the compression chunk into the Worker output. Phase 5's `heic-to` import uses the same guard.
  - Each pick shows "Processing…" and becomes a preview from an object URL (revoked on remove or unmount), or an inline error message per typed error.
  - A fixed hint says "Images are compressed before upload."
  - "Animated images become static" appears whenever a picked file's sniffed or declared type is GIF or WebP.
  - Alt-text inputs are limited to `ALT_TEXT_MAX_LENGTH`.
  - Files are processed one at a time.

#### 3. Form and save orchestration

**File**: `src/components/notes/NoteForm.tsx`, `src/components/hooks/useSaveNote.ts`, `src/lib/images/upload.ts` (new), `src/lib/images/upload.test.ts` (new)

**Intent**: Wire the picker into both modes. After the note write succeeds, apply image operations in the decided order. A failed image step never loses the note, and the user always learns which images failed.

**Contract**:
- `NoteForm` gets an optional `images: NoteImageView[]` prop in edit mode and renders `NoteImagePicker`. Submit stays disabled while any pick is `processing`. Pending picks with status `error` are ignored at save, and their message stays visible.
- `upload.ts` exports `uploadPendingImage(campaignId, noteId, pending) → Promise<void>`: prepare, then PUT the image (and thumbnail when present) to the signed URLs with `Content-Type` = the blob type (plus `apikey` if Phase 1 found it required), then commit. Errors are typed.
- `upload.ts` also exports the pure `applyImageChanges(noteId, changes, api) → Promise<ImageFailure[]>`. `api` (`deleteImage`, `updateAlt`, `uploadPending`) is passed in, so the order and failure collection can be unit-tested in Node. It runs DELETE for each removed image, then PATCH for each changed alt text, then uploads each added image. It never stops at the first failure. Create mode passes only `added`.
- `useSaveNote.submit(command, imageChanges)` does the note write, calls `applyImageChanges` with the real fetch-based `api`, and handles navigation:
  - create mode: POST, then `applyImageChanges`;
  - edit mode: PATCH, then write the relation notice as today (right after the 200, before any image step, so an image failure can't drop it; it shows on the next note-page view, matched by `noteId`), then `applyImageChanges`;
  - failures are `{ fileName | "image N", reason }`;
  - all succeeded: same navigation as today;
  - any failure: write `noteitdown:image-failure` and `location.replace` to `/campaigns/[campaignId]/notes/[noteId]/edit`.
- Pending stays true until navigation, as today.

#### 4. Image-failure notice

**File**: `src/lib/image-failure-notice.ts` (new), `src/lib/image-failure-notice.test.ts` (new), `src/components/notes/ImageFailureNotice.tsx` (new), `src/pages/campaigns/[campaignId]/notes/[noteId]/edit.astro`

**Intent**: A one-shot notice on the edit page saying the note was saved but listing the images that weren't, following `relation-notice.ts`.

**Contract**:
- Key `noteitdown:image-failure`. Payload `{ noteId, failures: { label, reason }[] }`.
- `takeImageFailureNotice(storage, noteId)` always removes the key and returns the payload only on a matching `noteId`. All storage access is wrapped in try/catch.
- `edit.astro` loads `listNoteImages` + `toImageViews` and passes `images` to `NoteForm`. It mounts `ImageFailureNotice` (`client:load`) above the form.

#### 5. Contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register what Phase 3 introduces when it lands, not a phase later.

**Contract**: register `noteitdown:image-failure` (key, payload, `takeImageFailureNotice` semantics) under "Session storage"; update the edit route in "Routes" with the `images` prop and the `ImageFailureNotice` mount.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, covering `fitDimensions` (2000×12000, 16384×1, 8000×8000), `thumbnailDimensions` (512 boundary, 16383×1 → 512×1), `bestUnderBudget` (fits at 0.8, needs a search, never fits), `looksLikeHeic` (heic/mif1 brands, a JPEG header, fewer than 12 bytes), `applyImageChanges` (deletes before uploads, one failure doesn't stop the rest, failure labels) and `image-failure-notice`: `npm run test:unit`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build succeeds and the Worker bundle contains no compression code (no `convertToBlob` in the server output): `npm run build && test -d dist/server && ! grep -rl convertToBlob dist/server`
- Integration tests still pass: `npm run test:integration`

#### Manual Verification:

- Chrome: create a note with a 12 MP phone JPEG and a small PNG; both upload; the stored original is WebP ≤ 2.4 MiB with no EXIF (check a downloaded copy); the small PNG has no separate thumbnail object
- Firefox: the same flow works
- Safari 16.4+: the stored objects are `.jpg` with `image/jpeg`; a transparent PNG gets a white background, not black
- A tall 2000×12000 map keeps about 1672×10033
- Picking a GIF shows "Animated images become static"; the hint "Images are compressed before upload." is always visible
- A third pick is blocked; on edit, removing one image and adding another in the same save works on a note that already has 2
- With the network throttled offline after the note POST (devtools), the note is kept and the edit page shows the failure notice naming the image
- A corrupt file (renamed `.txt`) shows the "unsupported or corrupt" error inline, and Save still works for the rest

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Note page display

### Overview

Thumbnails on the note page with stored dimensions, a full-size popup that fetches its URL on open, and a one-time URL refresh when a thumbnail fails to load.

### Changes Required:

#### 1. Dialog component

**File**: `src/components/ui/dialog.tsx` (new, generated)

**Intent**: Add the shadcn Dialog primitive.

**Contract**: `npx shadcn@latest add dialog` (new-york style). Theme restyling stays parked with the alert-dialog item.

#### 2. Image gallery island

**File**: `src/components/notes/NoteImages.tsx` (new)

**Intent**: Render the thumbnails and the popup.

**Contract**:
- Props: `campaignId`, `noteId`, `noteName`, `images: NoteImageView[]`.
- Each thumbnail is an `<img loading="lazy">` with `width`/`height` taken from `thumb_*` (or the original's), and `alt` = `alt_text ?? "<noteName> — image N"`, where N is the 1-based display index (not `position + 1`).
- Layout: a 2-column grid. The `width`/`height` attributes only reserve the aspect ratio; the rendered size comes from CSS (`h-auto w-full` inside the grid cell), so two 512 px thumbnails fit side by side in the card.
- A null `thumb_url` renders a fixed placeholder ("Image unavailable") instead of throwing.
- Thumbnail refresh, once per image (GET `.../images/[imageId]`, swap in the fresh `thumb_url`, never retry again), triggered by either:
  - `onError` after hydration, or
  - a mount effect that finds `img.complete && img.naturalWidth === 0` on the image's ref. React doesn't replay an `error` event that fired before hydration, and the SSR'd `<img>` starts loading before the island hydrates.
- Clicking a thumbnail opens a `Dialog`, GETs the URL, and shows the full image with `object-contain`, sized to the viewport. It has a loading state and an error message.
  - The dialog renders a `DialogTitle` (the image's alt text or fallback; `sr-only` is fine). Radix logs a console error without one.
  - The fetch is tagged with the image id it was made for. A response that doesn't match the currently open image is dropped (or the request is aborted on close), so a late response for image A never shows in B's dialog.
- The full-size URL never appears in the page HTML.

#### 3. Note page wiring

**File**: `src/pages/campaigns/[campaignId]/notes/[noteId].astro`

**Intent**: Load the image views server-side in one batched signing call and mount the island below the content.

**Contract**: after the note is resolved, `images = await toImageViews(supabase, await listNoteImages(supabase, note.id))`. Mount `<NoteImages client:load …>` only when `images.length > 0`. Use `client:load` like every other island, not `client:visible`: with `client:visible`, lazy images start loading before the island hydrates, so their errors go unhandled.

#### 4. Contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Update the note detail route description (images section, popup behaviour). The edit route and `noteitdown:image-failure` are registered in Phase 3.

**Contract**: edits to the existing "Routes" section.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- All tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- The note page shows thumbnails at the right size with no layout jump on load; alt text appears in the DOM, with the fallback used when empty
- The page HTML (view-source) contains only thumbnail URLs, no full-size URL; devtools shows the full image downloads only after clicking
- The popup shows the full image fitted to the window and closes with Esc and with the close button
- With a thumbnail URL forced to expire (or edited to an invalid token in devtools), the image recovers once via the refresh; a second failure shows the broken state without looping. Also check the pre-hydration case: a broken thumbnail URL already in the SSR HTML (e.g. temporarily corrupt the token in `toImageViews`, then reload) still recovers once.
- A note without images shows no images section; notes list and memory map are unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: HEIC fallback, `/licenses` and footer

### Overview

The cuttable phase: in-browser HEIC conversion, the third-party notices page, a footer on every page, and the roadmap wrap-up. Phases 1–4 stand without it; until it ships, HEIC picks show the unsupported error.

### Changes Required:

#### 1. HEIC conversion

**File**: `package.json`, `src/lib/images/heic.ts`, `src/lib/images/errors.ts`, `src/components/notes/NoteImagePicker.tsx`

**Intent**: When `createImageBitmap` can't decode a file and its bytes say HEIC, convert it to a high-quality JPEG with a lazily loaded, unmodified `heic-to`, then run the normal pipeline.

**Contract**:
- Dependency `"heic-to": "1.6.5"` (exact pin, no caret).
- `heic.ts` (which already has Phase 3's `looksLikeHeic`) gains `convertHeicToJpeg(file) → Promise<Blob>`. It runs `await import("heic-to")` inside the function, then `heicTo({ blob: file, type: "image/jpeg", quality: 0.92 })`. `heic-to` is imported only there, so a non-HEIC file never downloads the decoder (3.19 MB raw, about 777 KB gzipped). `heic-to`'s own `isHeic` is not used, because calling it would load the whole chunk.
- The picker's flow:
  1. try `processImage(file)`;
  2. on `UnsupportedImageError`, read the first 32 bytes; if `looksLikeHeic` matches, convert and run `processImage(jpeg)`;
  3. otherwise keep the unsupported error.
- Errors from `convertHeicToJpeg` (a corrupt HEIC or an HEIF variant libheif can't decode) become `UnsupportedImageError`. A `RangeError` or out-of-memory failure becomes `BrowserImageError`. Errors from the second `processImage` pass through unchanged.
- Remove `HeicNotSupportedYetError`.
- *Addendum (impl-review phase 5, F4):* a failed `import("heic-to")` (offline, chunk 404) becomes `HeicDecoderLoadError`, shown as `MESSAGES.IMAGE_HEIC_DECODER_UNAVAILABLE`, instead of the "unsupported or corrupt" error.
- The decoder lands in its own chunk. Confirm this in the build output.

#### 2. Licences page

**File**: `src/pages/licenses.astro` (new), `src/assets/licenses/lgpl-3.0.txt` (new), `src/assets/licenses/gpl-3.0.txt` (new)

**Intent**: A public, server-rendered notices page for the libraries this slice ships to the browser. Research 4.15 found that prerendering may bake in the build-time config banner.

**Contract**:
- Not added to `PROTECTED_ROUTES`. Uses `Layout`.
- Entries:
  - `heic-to` 1.6.5 (LGPL-3.0, "© Hopper Gee", taken from the `author` field in its package.json because its LICENSE has no project copyright line, `https://github.com/hoppergee/heic-to`)
  - libheif 1.23.5 (LGPL-3.0, copyright Dirk Farin / struktur AG, `https://github.com/strukturag/libheif`)
  - libde265 1.0.16 (LGPL-3.0, copyright struktur AG, `https://github.com/strukturag/libde265`). The version comes from the `LIBDE265_VERSION` in heic-to's README build notes. Confirm the licence and copyright line against upstream `COPYING` during implementation.
- The full LGPL-3.0 and GPL-3.0 texts, imported with `?raw` and rendered in `<pre>`.
- The bundled versions must match `package-lock.json`.

#### 3. Footer

**File**: `src/layouts/Layout.astro`

**Intent**: A minimal footer on every page with a "Third-party licences" link to `/licenses`.

**Contract**: a `<footer>` after `<slot />`. Every page wraps its content in its own `bg-cosmic min-h-screen` div, and `body` is white (`bg-background`, no `.dark`). So the footer gets its own background matching the end of the cosmic gradient (`bg-[#0a0e1a]`), muted small text (e.g. `text-xs text-blue-100/60`) and light padding. It sits below the fold, and no page's `min-h-screen` changes.

#### 4. Roadmap and contract wrap-up

**File**: `context/foundation/roadmap.md`, `docs/reference/contract-surfaces.md`

**Intent**: Mark the S-05 bucket-policy Unknown as settled. Update the S-05 outcome to "up to 2 images". Fix the parked MIT item, which still names the dropped `browser-image-compression`. Register `/licenses` and the footer.

**Contract**: edits to S-05 Unknowns and Outcome, the "At a glance" outcome cell, the Parked "MIT notices…" bullet, and the "Routes" section in contract-surfaces.

### Success Criteria:

#### Automated Verification:

- `heic-to` is pinned exactly: `grep '"heic-to": "1.6.5"' package.json`
- Build succeeds and `heic-to` is emitted as a separate client chunk, not in the Worker or the main island chunk (the decoder is the only code with `de265_` symbols): `npm run build && test $(grep -rl de265_ dist/client | wc -l) -eq 1 && ! grep -rlq de265_ dist/server`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- All tests pass: `npm test`
- Smoke test passes against the preview: `npm run preview` + `npm run smoke`

#### Manual Verification:

- Chrome or Firefox on Linux: an iPhone HEIC uploads as WebP; the network panel shows the `heic-to` chunk loading only on that pick (not on a corrupt non-HEIC file); a portrait iPhone HEIC displays upright
- A 48 MP HEIC processes without the tab crashing; "Processing…" is visible while it runs
- A non-HEIC undecodable file still shows the "unsupported or corrupt" error
- `/licenses` loads while signed out and lists name, version, licence, copyright and source for each library, plus the full LGPL-3.0 and GPL-3.0 texts
- The footer link appears on auth pages, campaign pages and the note page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Schemas: alt-text trimming, its null and length boundaries, thumbnail field nullability, `.strict()` keys, MIME allow-list.
- Pipeline maths: `fitDimensions`, `thumbnailDimensions` and `bestUnderBudget` with an injected fake encoder (sizes as a function of quality and scale).
- `image-failure-notice`: round-trip, mismatched `noteId`, malformed JSON, storage throwing.

### Integration Tests:

- `note_images` constraints, RLS and column grants with two tenants.
- `storage.objects` policies with two tenants, including cleanup after the note row is gone.
- Observed signed-upload behaviour: `apikey` requirement, and size and MIME enforcement on the signed path.
- The service-level prepare → PUT → commit → views → delete path, commit rejections (foreign path, oversized object with cleanup), and `removeNoteFolder`.

### Manual Testing Steps:

1. Create a note with 2 images in Chrome; view it; open the popup; delete the note; confirm the folder is empty in Studio.
2. Edit a note: replace one of 2 images and change the other's alt text in a single save.
3. Repeat create in Safari (JPEG output, white background on transparency) and Firefox.
4. Simulate a mid-save network failure and confirm the failure notice and the note survive.
5. Upload an iPhone HEIC on Linux Chrome (Phase 5).
6. Open `/licenses` signed out.

## Performance Considerations

- Files are processed one at a time; `bitmap.close()` and zeroing the canvas size release memory promptly (a 48 MP decode is about 192 MB RGBA).
- Thumbnails are signed in one batched call per render (6 h). Full-size bytes download only when the popup opens, keeping egress on the 5 GB free tier small.
- `heic-to` (about 768 KB gzipped) loads only on the fallback path. The compression module loads only when the user picks a file.

## Migration Notes

- Apply to production with `npx supabase db push`. CI doesn't run migrations; record the push like the earlier migrations.
- No backfill: existing notes simply have no images.
- Rollback: drop the `storage.objects` policies, `public.note_images`, and the bucket (empty it through the Storage API first). App code without the UI is inert.

## References

- Change identity and decisions: `context/changes/note-image-attachment/change.md`
- Research: `context/changes/note-image-attachment/research.md` (incl. "Verification (2026-10-03)" and "Follow-up: compression reference validation")
- Pipeline base: `context/changes/note-image-attachment/references/compress-to-webp.js`, notes in `references/image-compression-research.md`
- Similar route: `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts`
- One-shot notice pattern: `src/lib/relation-notice.ts`
- Column-grant pattern: `supabase/migrations/20260923120000_restrict_update_columns.sql`
- Storage API: `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:276,348,382,796,961,1184`
- Roadmap item: `context/foundation/roadmap.md` S-05; contracts: `docs/reference/contract-surfaces.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Storage foundation

#### Automated

- [x] 1.1 Migration applies on a fresh local database: `npx supabase db reset` — 839ae50
- [x] 1.2 Lint passes: `npm run lint` — 839ae50
- [x] 1.3 Type check passes: `npx astro sync && npx astro check` — 839ae50
- [x] 1.4 Unit tests pass, including the note-images schema and `validateUploadedObject` tests: `npm run test:unit` — 839ae50
- [x] 1.5 Integration tests pass, including `note-images.test.ts` cross-tenant and signed-upload assertions: `npm run test:integration` — 839ae50
- [x] 1.6 CI workflow starts Supabase with `storage-api` — 839ae50

#### Manual

- [x] 1.7 Bucket `note-images` is private with a 2,621,440 B limit and only webp/jpeg allowed — 839ae50
- [x] 1.8 Signed-upload findings are written into contract-surfaces and match the test assertions — 839ae50

### Phase 2: Image API and note-delete cleanup

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 2509af4
- [x] 2.2 Type check passes: `npx astro check` — 2509af4
- [x] 2.3 Unit and integration tests pass: `npm test` — 2509af4
- [x] 2.4 Integration test: note delete then `removeNoteFolder` leaves no objects under the note prefix — 2509af4
- [x] 2.5 Production build succeeds: `npm run build` — 2509af4

#### Manual

- [x] 2.6 Full prepare → PUT → commit → GET → PATCH → DELETE sequence works from the browser console — 2509af4
- [x] 2.7 The same calls against another account's note return 404 — 2509af4
- [x] 2.8 Deleting a note with images leaves its folder empty in Studio — 2509af4

### Phase 3: Browser pipeline and form attach

#### Automated

- [x] 3.1 Unit tests pass for pipeline maths, applyImageChanges and image-failure-notice: `npm run test:unit` — e5f6525
- [x] 3.2 Lint passes: `npm run lint` — e5f6525
- [x] 3.3 Type check passes: `npx astro check` — e5f6525
- [x] 3.4 Build succeeds and the Worker bundle contains no compression code — e5f6525
- [x] 3.5 Integration tests still pass: `npm run test:integration` — e5f6525

#### Manual

- [x] 3.6 Chrome: 12 MP JPEG and small PNG upload as WebP ≤ 2.4 MiB without EXIF; small PNG has no separate thumbnail — e5f6525
- [x] 3.7 Firefox: the same flow works — e5f6525
- [x] 3.8 Safari 16.4+: objects are JPEG; transparent PNG gets a white background (not verified: no Safari test environment available — Safari is not distributed for Linux, Windows support was dropped, no Apple device; user decision 2026-10-04, follow-up parked in roadmap.md "Parked") — e5f6525
- [x] 3.9 A 2000×12000 map keeps about 1672×10033 — e5f6525
- [x] 3.10 GIF pick shows the animated notice; the compression hint is always visible — e5f6525
- [x] 3.11 Third pick blocked; replace-one-of-two works in a single edit save — e5f6525
- [x] 3.12 Network failure after note POST keeps the note and shows the failure notice on the edit page — e5f6525
- [x] 3.13 Corrupt file shows the unsupported error inline and Save still works — e5f6525

### Phase 4: Note page display

#### Automated

- [x] 4.1 Lint passes: `npm run lint` — 99a563c
- [x] 4.2 Type check passes: `npx astro check` — 99a563c
- [x] 4.3 All tests pass: `npm test` — 99a563c
- [x] 4.4 Build succeeds: `npm run build` — 99a563c

#### Manual

- [x] 4.5 Thumbnails render at stored size without layout jump; alt text and fallback present — 99a563c
- [x] 4.6 Page HTML contains no full-size URL; full image downloads only on click — 99a563c
- [x] 4.7 Popup fits the window and closes with Esc and the close button — 99a563c
- [x] 4.8 Expired thumbnail URL recovers once (also when broken before hydration); a second failure does not loop — 99a563c
- [x] 4.9 Notes without images show no images section; list and map unchanged — 99a563c

### Phase 5: HEIC fallback, `/licenses` and footer

#### Automated

- [x] 5.1 `heic-to` is pinned exactly at 1.6.5 — 1ea5b04
- [x] 5.2 Build succeeds and `heic-to` is a separate client chunk — 1ea5b04
- [x] 5.3 Lint passes: `npm run lint` — 1ea5b04
- [x] 5.4 Type check passes: `npx astro check` — 1ea5b04
- [x] 5.5 All tests pass: `npm test` — 1ea5b04
- [x] 5.6 Smoke test passes against the preview — 1ea5b04

#### Manual

- [x] 5.7 Linux Chrome/Firefox: iPhone HEIC uploads as WebP; decoder chunk loads only on that pick; portrait HEIC upright — 1ea5b04
- [x] 5.8 A 48 MP HEIC processes without crashing, with a visible processing state — 07678cb
- [x] 5.9 A non-HEIC undecodable file still shows the unsupported error — 1ea5b04
- [x] 5.10 `/licenses` loads signed out with all required fields and full licence texts — 1ea5b04
- [x] 5.11 Footer link appears on auth, campaign and note pages — 1ea5b04
