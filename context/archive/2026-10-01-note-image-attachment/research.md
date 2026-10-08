---
change_id: note-image-attachment
title: "Research: image attachment options for notes"
created: 2026-10-01
roadmap_ref: S-05
prd_refs: [FR-004]
status: complete
last_updated: 2026-10-03
last_updated_by: Hornster (Claude Code /10x-research)
last_updated_note: "Appended 'Follow-up: compression reference validation (2026-10-03)'. Earlier: open questions answered; appended 'Verification (2026-10-03)': claims re-checked against commit 4f0768e, change.md decisions checked against roadmap S-05, implementation risks listed."
---

# Research: image attachment options for notes (S-05)

## Question

What existing solutions are there for attaching one or more images to a note? What problems do they create for storage and for frontend display? What are the pros and cons of each? (Up to 5 options.)

## Context checked in the codebase

- `notes.content` is a plain `text` column. Relation detection does exact-name **substring** matching over it (`supabase/migrations/20260922120000_campaign_notes_schema.sql`, `20260926120000_relation_detection.sql`).
- `notes` → `campaigns` uses `ON DELETE CASCADE`, and RLS is per-user throughout.
- `src/lib/supabase.ts` is a server-only client (`SUPABASE_KEY` comes from `astro:env/server`). The browser has no Supabase client.
- `wrangler.jsonc` has no R2 binding. `supabase/config.toml` has `[storage]` enabled, with bucket and image-transformation examples commented out.
- `context/foundation/tech-stack.md` chose the starter partly because it bundles "Supabase (Postgres + auth + storage)" for FR-004.

## Scope note

FR-004 and S-05 both say "attach **an** image". Supporting several images is a small scope change. It adds a `position`/ordering column, a per-note cap, and handling for partial upload failures. Record the decision in `change.md` before `/10x-plan`.

## Options

### 1. Supabase Storage, private bucket, with a `note_images` table (recommended)

A private bucket holds the files under paths like `{user_id}/{campaign_id}/{note_id}/{uuid}.webp`. A `note_images` table stores `note_id`, `path`, `width`, `height`, `position` and `mime`. Pages show the images through signed URLs.

**Pros**

- It's already in the stack (tech-stack.md). No new vendor.
- Access rules live in Postgres. Storage access is RLS on `storage.objects`, and nothing is allowed until you write a policy. The documented pattern is `(storage.foldername(name))[1] = (select auth.uid())::text`, which matches the existing per-user RLS approach.
- Each bucket can set `file_size_limit` and `allowed_mime_types`.
- `createSignedUploadUrl` + `uploadToSignedUrl` let the browser upload straight to Storage, so the Worker never handles the bytes and the browser never needs the Supabase key.
- `createSignedUrls` creates URLs for all of a note's images in one call.

**Cons**

- Free-plan limits: **1 GB storage, 5 GB egress, 50 MB max file size**.
- Image transformations (resizing, thumbnails) are **Pro plan only** (100 origin images included, then $5 per 1,000), so on Free you have to resize in the browser.
- The file and the DB row live in two systems, so you can end up with files that no row points to (see the storage problems below).
- Signed URLs expire (see the display problems below).

**Variant rejected: public bucket.** URLs are simpler, never expire, and cache better. But a public bucket skips RLS for reads, so anyone with the URL can see the image. That conflicts with the PRD's Access Control rule (campaign data is private per account).

### 2. Cloudflare R2 through a Worker binding

You add `r2_buckets` to `wrangler.jsonc` and call `env.BUCKET.put/get` from Astro endpoints (imported from `cloudflare:workers`). Images are served by an endpoint such as `/api/images/[id]` that checks ownership first.

**Pros**

- No egress fees.
- The free tier is 10 GB-month of storage, 1M Class A (write) and 10M Class B (read) operations a month.
- It runs on the platform you already deploy to, the binding needs no API keys, and it works in local dev under workerd.

**Cons**

- There's no RLS. Authorization moves into TypeScript, which breaks the project's pattern of enforcing access in the database.
- It adds a second data vendor, with the same file-versus-row consistency problem as option 1.
- Every image view goes through the Worker, which counts toward the free plan's 100k requests a day.
- The Workers Free plan allows **10 ms of CPU per request**. Streaming bytes through is fine, but server-side resizing or decoding is not possible.
- Resizing would need Cloudflare Images, which is a paid add-on.

### 3. Images in Postgres as `bytea`

A `note_images` table holds the bytes directly.

**Pros**

- Saving an image is atomic with the rest of the note's data.
- RLS applies with no extra work.
- `ON DELETE CASCADE` removes images along with their note or campaign, so there are no orphaned files.
- Backups include everything.

**Cons**

- The free database is **500 MB**, and images would fill it within a few campaigns.
- PostgREST returns `bytea` as a hex string in JSON, which **doubles** the payload.
- Nothing is served from a CDN, and every view goes through the Worker and the database.
- Values can't be streamed, so whole images sit in memory, and the Worker has 128 MB.
- Benchmarks put reads at roughly 6–10x slower than reading a file (CYBERTEC). Experts only recommend this "on a small scale, when a simple architecture and ease of coding are the prime goals".
- If you do it anyway, set the column storage to `EXTERNAL` so Postgres doesn't waste CPU trying to compress data that's already compressed.

### 4. Base64 data URI inside `notes.content` (rejected)

The image is embedded in the note text as a `data:image/...;base64,...` string.

**Pros**

- No new tables, buckets or endpoints. It's the simplest option.

**Cons**

- **It breaks the core feature.** Relation detection does exact-name substring matching over `content`. Megabytes of random base64 characters will contain short note names, so relations will appear for no reason, and S-04's relation-change notice would then report noise on every edit.
- Base64 adds about 33% to the size.
- Every note load and the memory-map query would carry the image bytes.
- Every edit would send the image back to the server.

### 5. A hosted image service (Cloudinary, ImageKit, Uploadcare)

**Pros**

- Resizing and format conversion (WebP/AVIF) happen through URL parameters, with CDN delivery.
- Free tiers are reasonable: Cloudinary about 25 credits a month, ImageKit about 20 GB of bandwidth, Uploadcare about 3,000 uploads.
- They include upload widgets and signed uploads.

**Cons**

- It's a third vendor holding private campaign data.
- Private delivery needs signed URLs or authenticated assets, which takes more setup.
- Access isn't tied to Supabase auth, so ownership is checked only in app code.
- Vendor lock-in and credit-based billing. Paid plans jump steeply (Cloudinary Plus is about $89–99 a month).
- This is too much for a feature the PRD marks nice-to-have.

## Comparison

| # | Option | Fits stack | Access control | Free-tier capacity | Orphan risk | Thumbnails on Free | Verdict |
| - | ------ | ---------- | -------------- | ------------------ | ----------- | ------------------ | ------- |
| 1 | Supabase Storage (private) + `note_images` | Yes | RLS on `storage.objects` | 1 GB / 5 GB egress | Yes | Client-side only | **Recommended** |
| 2 | Cloudflare R2 via binding | Yes (same platform) | App code | 10 GB, no egress fees | Yes | No (paid Images) | Viable alternative |
| 3 | Postgres `bytea` | Yes | RLS | 500 MB DB total | No | No | Rejected (size/perf) |
| 4 | Base64 in `content` | Yes | RLS | 500 MB DB total | No | No | Rejected (breaks matching) |
| 5 | Cloudinary / ImageKit / Uploadcare | New vendor | App code + signed delivery | ~20–25 GB | Yes | Yes | Overkill for MVP |

## Storage problems that apply whichever option you pick

1. **Orphaned files.** `ON DELETE CASCADE` removes `note_images` rows, not the files in Storage or R2. Supabase says objects must be deleted through the Storage API, not SQL; deleting the row in SQL leaves the file behind in the bucket. That affects:
   - note deletion (the S-04 delete flow)
   - campaign deletion (cascade)
   - an upload that succeeded when the row insert then failed

   Pick an order (e.g. upload first, then insert the row) and a cleanup strategy.
2. **Path and ownership checks.** Build the path on the server from the user's real ID; never trust a path from the client (path traversal). The `foldername[1] = uid` check proves who owns the file, but not that `note_id` belongs to that user. Check note ownership with a join, the same way the composite foreign keys in the schema keep data within one campaign.
3. **Content-type checks.** The browser-supplied `Content-Type` can be faked. Allow-list `image/jpeg`, `image/png`, `image/webp` and maybe `image/gif` at the bucket level and validate on the server. **Exclude `image/svg+xml`**, because SVGs can contain scripts (XSS).
4. **Free-tier limits.** On Supabase Free, 1 GB is only about 1,000 photos at roughly 1 MB each. Set a small per-file limit (about 5 MB), cap the number of images per note, and resize before uploading.
5. **Note editing.** Keep image changes separate from text edits. They should not go through the relation re-detection RPC, and adding or removing an image shouldn't change `updated_at` in a way that misleads the S-04 notice.

## Display problems

1. **Signed URLs expire.** A page rendered on the server and left open longer than the expiry shows broken images. Each render also creates new URLs, so the browser can't reuse cached images and every view re-downloads them (more egress). Fixes:
   - Use a reasonable expiry (about 1 h) and one batched `createSignedUrls` call per page.
   - Or serve images from your own endpoint with `Cache-Control: private`.
2. **Phone photos are large.** They're 3–8 MB and around 4000 px wide. Resize in the browser first (e.g. `browser-image-compression`) to about 2048 px WebP. On the free plan that's the only way to get thumbnails.
3. **EXIF data.** Photos can carry GPS coordinates (a privacy leak) and an orientation flag (images show sideways). Re-encoding through a canvas or `createImageBitmap` strips the EXIF and applies the orientation to the pixels.
4. **HEIC files.** iPhone photos, including ones AirDropped to a Mac, are HEIC, which Chrome and Firefox can't display. Either reject HEIC with a clear message or convert it in the browser (a WASM decoder, about 3 MB, loaded only when needed).
5. **Layout and loading.**
   - Store `width` and `height` so the page doesn't jump while images load.
   - Use `loading="lazy"` and require alt text.
   - Keep images out of the memory-map nodes, which only need text.
   - Desktop-only scope (see Parked in the roadmap) means phone-width layouts aren't an acceptance criterion.

## Recommendation

Use **option 1**: a private Supabase Storage bucket and a `note_images` table, with:

- signed upload URLs (browser → Storage directly)
- resizing and re-encoding in the browser (WebP, about 2048 px, EXIF stripped)
- signed display URLs created in one batch per page, with about 1 h expiry
- explicit Storage cleanup in the note and campaign delete flows

**This settles the open S-05 roadmap question (bucket policy):** private bucket, `file_size_limit` of about 5 MB, an allow-list of image types without SVG, and per-user folder RLS plus a note-ownership check.

## Sources

- Supabase: Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase: Storage Buckets (public vs private): https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase: Storage file limits: https://supabase.com/docs/guides/storage/uploads/file-limits
- Supabase: Image Transformations (Pro only): https://supabase.com/docs/guides/storage/serving/image-transformations
- Supabase: Pricing: https://supabase.com/pricing
- Supabase JS reference: `createSignedUploadUrl` / `uploadToSignedUrl` / `createSignedUrls` (via Context7, `/websites/supabase`)
- Supabase Storage RLS guide (defense in depth, signed URLs): https://tomodahinata.com/en/blog/supabase-storage-rls-access-control-bucket-folder-policies-guide
- Cloudflare: Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare: R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare: R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Astro + R2 binding guide: https://astroseoblog.com/blog/astro-cloudflare-r2-integration-guide
- PostgreSQL wiki: BinaryFilesInDB: https://wiki.postgresql.org/wiki/BinaryFilesInDB
- CYBERTEC: Binary data performance in PostgreSQL: https://www.cybertec-postgresql.com/en/binary-data-performance-in-postgresql/
- Cloudinary vs UploadThing vs ImageKit (2026): https://www.pkgpulse.com/guides/cloudinary-vs-uploadthing-vs-imagekit-image-storage-2026
- browser-image-compression: https://github.com/Donaldcwl/browser-image-compression

---

## Verification (2026-10-03)

**Researcher**: Hornster (Claude Code `/10x-research`) · **Git commit**: `4f0768e` · **Branch**: `main` · **Repository**: NoteItDown · **Checked at**: 2026-10-03T00:24+02:00

**Question.** Do the findings above still match the codebase? Do the decisions (this file plus `change.md` "Decisions (2026-10-01)") align with roadmap S-05? What can go wrong during implementation?

**How it was checked.**
- Codebase claims: read directly. That covers the 6 migrations, `src/lib/supabase.ts`, `src/middleware.ts`, the note services, the API routes, the note page, `Layout.astro`, `ci.yml`, `config.toml` and `wrangler.jsonc`.
- External claims: checked by two read-only Sonnet research subagents.
  - Supabase: Context7 `/websites/supabase`, supabase.com pages, and `node_modules/@supabase/storage-js@2.116.0`.
  - Browser libraries: npm tarballs of `browser-image-compression@2.0.2` and `heic-to@1.6.5`, plus MDN and caniuse.
- Nothing was run against a live Supabase instance or in a browser. Claims marked *test locally* below stay unverified.

### Summary

- **The core recommendation holds.** A private Supabase Storage bucket, a `note_images` table, signed URLs and in-browser processing all fit the codebase and S-05.
- **These claims need correcting:**
  - Relation matching is word-boundary regex, not raw substring matching.
  - The `updated_at` concern is unfounded.
  - There is no campaign-delete flow to hook cleanup into.
  - `heic-to` is about 0.77 MB gzipped and built with asm.js, not WASM.
- **One `change.md` decision conflicts with library behaviour.** "No pixel-dimension limit" does not survive `browser-image-compression` defaults. By default it shrinks the resolution while it tries to meet `maxSizeMB`. It can also hand back the original file, EXIF data included.
- **S-05 alignment.** The outcome and the bucket-policy Unknown are covered. The decided scope is well beyond "attach an image": 2 images, thumbnails with a popup, HEIC conversion, and a `/licenses` page with a footer on every page. The plan should put the cuttable parts in separate phases.
- **CI blocker.** CI starts local Supabase **without** `storage-api` (`.github/workflows/ci.yml:42`), so storage integration tests can't run in CI as configured.

### 1. Codebase claims, re-checked

| Research claim (line) | Verdict | Evidence |
| --- | --- | --- |
| `notes.content` is plain `text` (L17) | Supported | `supabase/migrations/20260922120000_campaign_notes_schema.sql:64` |
| Relation detection does "exact-name **substring** matching" (L17, L98) | **Partial** | `note_mentions` is a case-insensitive regex. It requires a non-`[[:alnum:]_]` character or string edge on both sides of the name (`20260926120000_relation_detection.sql:10-22`). Base64 uses `+`, `/` and `=`, which count as boundaries, so false matches inside base64 are rarer than the research says but still possible. Option 4 stays rejected on the payload grounds at L99-101. |
| `notes`→`campaigns` `ON DELETE CASCADE`; per-user RLS (L18) | Supported | Schema `:60` and `:80-102`. RLS goes through `campaigns.owner_id`. Relations use composite FKs `(campaign_id, note_id)` with cascade (`:113-116`), and `note_images` should follow the same pattern. |
| Server-only client; no browser Supabase client (L19) | Supported | `src/lib/supabase.ts:3-9`. In `src/`, `@supabase/supabase-js` is imported only by server services and `env.d.ts`. Hooks call the app's own API with `fetch` (`src/components/hooks/useSaveNote.ts:35`). |
| No R2 binding; `[storage]` enabled, bucket and transform examples commented out (L20) | Supported | `wrangler.jsonc` has no `r2_buckets`. `supabase/config.toml:109-126`. The global local `file_size_limit` is `"50MiB"` (`:112`). |
| Stack chosen partly for bundled storage (L21) | Supported | `context/foundation/tech-stack.md:24` |
| Cleanup needed in "campaign deletion (cascade)" (L133, and `change.md` "Carried over") | **Partial** | The app has **no** campaign-delete flow. The campaign APIs export only `POST` (`src/pages/api/campaigns/index.ts:12`) and `PATCH` (`.../[campaignId]/index.ts:13`). Cascades fire only on a direct delete under the RLS policy (schema `:23`) or on auth-user deletion (schema `:7`), and neither has an app-side hook. The plan can only record this as a future obligation. |
| Image changes "shouldn't change `updated_at` in a way that misleads the S-04 notice" (L140, and `change.md`) | **Contradicted** | The S-04 notice is built from the `update_note` RPC response (`20260930120000_note_edit_delete_functions.sql:139-145`), which travels through `sessionStorage` (`useSaveNote.ts:47-57`). Nothing in `src/` reads `updated_at`; it appears only in `src/types.ts:14,32`. Writes to a separate `note_images` table fire neither `notes_set_updated_at` (schema `:160`) nor `notes_detect_relations` (`relation_detection.sql:112-114`). The real rule is narrower: don't route image changes through `update_note`. |
| Memory map should not carry images (L153) | Already true | `listNotes` selects `id, name, created_at, note_types(name)` (`src/lib/services/notes.ts:84`). The map page uses only `listNotes` and `listRelations` (`src/pages/campaigns/[campaignId]/map.astro:27`). |
| No footer in `Layout.astro` (`change.md`) | Supported | `src/layouts/Layout.astro:21-37` |

### 2. External claims, re-checked

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Free plan: 1 GB storage, 5 GB egress, 50 MB max file; transforms Pro-only (L43-44) | Confirmed, with more detail | supabase.com/pricing. Free also lists a separate 5 GB *cached* egress. **Free projects pause after 1 week of inactivity**, which was missing from the research. |
| Storage access is RLS on `storage.objects` and denied without policies (L36) | Confirmed | supabase.com/docs/guides/storage/security/access-control |
| `createSignedUploadUrl` + `uploadToSignedUrl` (L38) | Confirmed, with conditions | Creating the URL needs an **INSERT** policy for the calling user. The URL is valid for a **fixed 2 hours** with no parameter to change it (`node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:348,382`). `uploadToSignedUrl` (`:276`) sends the client's `apikey` header. Whether a bare browser `fetch` without the anon key is accepted is *unverified (test locally)*. Nothing indicates the token binds content type or size. |
| Bucket `file_size_limit` / `allowed_mime_types` (L37) | Partial | Documented for uploads in general. Enforcement on the **signed-upload** path is *unverified (test locally)*. `allowed_mime_types` checks the declared type, not the bytes. |
| `createSignedUrls` batch (L39) | Confirmed | `StorageFileApi.ts:796`. Needs SELECT. No maximum expiry is documented. |
| Objects must be deleted via the Storage API, not SQL (L131) | Confirmed | supabase.com/docs/guides/storage/management/delete-objects. `remove()` (`StorageFileApi.ts:1184`) takes up to 1000 paths per call. Rows deleted in SQL leave billed orphan files behind. |
| Bucket definition location | New finding | `config.toml` `[storage.buckets.*]` applies only to local `supabase start`; `db push` does not apply it. Create the bucket with its limits in a **migration** (`insert into storage.buckets (...)`) so local and hosted match. |
| `browser-image-compression` (L147, `change.md`) | Exists, MIT, **stale** | Latest is 2.0.2, published 2023-03-06. The default worker loads from jsDelivr. |
| HEIC "WASM decoder, about 3 MB" (L149) and `change.md` "about 0.5 MB gzipped, libheif 1.22.x" | **Corrected** | `heic-to@1.6.5`, published 2026-10-01, bundles **libheif 1.23.5** as **asm.js** (no WASM). It is about 3.19 MB raw and **about 768 KB gzipped**. The default and `/next` builds use `new Function` and need `unsafe-eval`; `/csp` does not. The app sets no CSP today; none was found in `astro.config.mjs` or `src/middleware.ts`, and there is no `public/_headers`. `isHeic` sniffs the brand at bytes 8-12, as `change.md` assumes. |
| HEIC browser support (`change.md`) | Partial | caniuse lists Safari 17+ only. Chrome, Edge and Firefox are listed unsupported, including Chrome on macOS, which `change.md` lists as supported. Either way the `createImageBitmap`-then-fallback flow covers it. Windows plus the HEVC extension is unverified. |

### 3. Alignment with roadmap S-05

| S-05 element (`context/foundation/roadmap.md:138-149`) | Alignment |
| --- | --- |
| Outcome: "attach an image to a note alongside its text content" | Met by option 1. Images live outside `notes.content`, so FR-007 matching is untouched, consistent with the S-05 Risk note (`roadmap.md:148`). |
| Unknown: bucket policy (`roadmap.md:146-147`) | Settled in `change.md`: private bucket, 2.5 MB, image allow-list, per-user folder RLS plus a note-ownership check. **The roadmap still lists it as open**; update it during `/10x-plan` or `/10x-archive`. |
| Prerequisite S-01 | Done. The cleanup design also depends on S-04's `delete_note` (done). |
| FR-004 says "an image" | `change.md` records "up to 2" as a deliberate scope change, so it is aligned. Roadmap row S-05 (`:49`) still says "an image". |
| Nice-to-have, "sequenced last without blocking anything" | **Scope tension.** The decided slice includes HEIC conversion, a `/licenses` page, a footer on **every** page through `Layout.astro`, thumbnails, a popup and a URL-refresh endpoint. The roadmap acknowledges the `/licenses` page (`:183-186`), so this is not drift, but it is much more than the roadmap entry suggests. Recommendation for `/10x-plan`: (1) core upload, display and delete; (2) thumbnails and popup; (3) HEIC conversion with `/licenses`. Phase 3 can then be cut or deferred without breaking 1-2. |
| PRD guardrail "images … never lost or corrupted" (`prd.md:41`) and NFR "persist reliably … no silent degradation" (`prd.md:92`) | **Needs an explicit decision.** Three issues: (a) every image is lossily re-encoded at quality 0.8, and could be silently downscaled (see 4.1), which is arguably "silent degradation" for maps and handouts with small text; (b) the Free-plan pause after a week of inactivity; (c) Supabase database backups are generally documented as not covering Storage objects (*not re-fetched in this session*). Settle these as accepted risks, or tell the user that images are compressed. |
| PRD Access Control / isolation guardrail (`prd.md:40`) | Aligned. The bucket is private and RLS-based. The note-ownership check must be in the `storage.objects` policy, not only in TypeScript. |

### 4. Problems likely during implementation

Ordered by impact.

1. **`browser-image-compression` contradicts three `change.md` decisions.** From the 2.0.2 dist source, read by a subagent:
   - If the first encode exceeds `maxSizeMB`, it loops up to 10 times and multiplies **both quality and width/height by 0.95** each pass, unless `alwaysKeepResolution: true`. That breaks "no pixel-dimension limit".
   - It also caps the canvas area per browser (for example about 16384² in Chrome and 11180² in Firefox) and silently shrinks larger images. Very tall maps are affected.
   - If the re-encoded result is **larger than the input**, it may return the **original file**. That file is not WebP and can still carry EXIF/GPS, which breaks "re-encode every image" and "the bucket only receives WebP".
   - `canvas.toBlob('image/webp')` silently falls back to PNG where WebP encoding isn't supported.
   - Mitigation: check the output's `type` and that it isn't the input file, and fail or force a re-encode. Alternatively, drop the library and write the short `createImageBitmap` → `OffscreenCanvas.convertToBlob` pipeline directly. That also removes one notice from `/licenses`.
2. **CI cannot exercise Storage.** `ci.yml:42` excludes `storage-api` from `supabase start`. Remove it from the `-x` list; `imgproxy` can stay excluded. Integration tests need the local Storage container.
3. **The bucket and its policies belong in a migration**, not `config.toml`. Write one `storage.objects` policy per operation: INSERT (needed just to **create** a signed upload URL), SELECT (signed display URLs), and DELETE (cleanup). Avoid `upsert`, which also needs UPDATE+SELECT policies; use UUID file names. In the ownership subquery, compare path segments as **text**. Casting `(storage.foldername(name))[n]::uuid` throws on malformed paths (inference).
4. **Notes must exist before their images.** The path contains `note_id`. Today create mode navigates away the moment it gets 201 (`useSaveNote.ts:41-44`). The plan must choose:
   - upload after creation, before navigating, and handle "note saved, image failed", or
   - attach images only on the edit or note page.
5. **Upload, row and orphan ordering.** The signed upload URL lives for 2 hours, and the browser can abandon a flow after uploading, which leaves a file with no row. A server "commit" step should:
   - check that the object exists, and its size and type, through the Storage API
   - insert the `note_images` row
   - remove the uploaded objects if the insert fails

   The browser can upload anything to its signed path, so the commit step is the only server-side check of what landed.
6. **Delete-flow integration.** `delete_note` (`20260930120000_note_edit_delete_functions.sql:152-182`) returns only `name` and `removed`. Either read the image paths before calling it, or extend its return value; that changes a registered contract (`docs/reference/contract-surfaces.md:69`). Order: **delete the DB row first, then the files.** If file removal fails, log it and accept an orphan; never lose an image a row still points to. A prefix delete of `{uid}/{campaign}/{note}/` through `list` + `remove` also catches abandoned uploads.
7. **The 2-per-note cap needs a race-safe database rule.** A count-check trigger can race. Prefer `position smallint check (position in (0,1))` plus `unique (note_id, position)`.
   - Use the composite FK `(campaign_id, note_id) → notes(campaign_id, id) on delete cascade`, matching schema `:67-71`.
   - Grant no UPDATE to `authenticated` (insert and delete only), following `20260923120000_restrict_update_columns.sql`.
8. **SSR safety of the processing code.** React islands are also rendered on the server in workerd. Import the processing and HEIC modules with `await import()` inside event handlers so they stay out of the Worker bundle. Confirm with `npm run build` (*inference, not built*).
9. **HEIC cost.** The decoder is about 768 KB gzipped of asm.js and runs on the main thread unless you use `heic-to/next`. Test a 48 MP file on Linux Chrome or Firefox, as `change.md` already plans.
   - For LGPL compliance, keep it in its own chunk, pin the **exact** version (the `/licenses` page must name it), and list libheif 1.23.5.
   - libde265's licence wasn't confirmed from the package itself.
10. **Animated GIF/WebP** loses its animation after the canvas re-encode. Decide whether to reject these files or accept the first frame. `change.md` says "maybe gif".
11. **Bucket allow-list.** `change.md` lists jpeg, png, webp and maybe gif for the bucket, but also says the bucket only ever receives WebP. Set the bucket to `image/webp` only (plus `image/jpeg` if a non-WebP-encoding browser is supported) and let the file picker accept the wider list.
12. **Signed display URLs.** Each render signs new URLs, so the browser cache isn't reused. Thumbnail egress is small, so this is acceptable. `createSignedUrls` returns per-item errors; render a placeholder for rows whose file is missing instead of throwing (the roadmap's "no DB-error strategy" observation, `roadmap.md:170`).
13. **Route naming.** `change.md` proposes `GET /api/notes/[id]/images/[imageId]`. Existing APIs nest under `/api/campaigns/[campaignId]/notes/[noteId]` (`contract-surfaces.md:92-100`), so follow that. Register the new table, bucket name, path format and endpoints in `docs/reference/contract-surfaces.md`.
14. **Hard-coded error strings.** New endpoints would add more copies of strings like "You must be signed in." (already in 5 places in `src/`). The roadmap observation (`roadmap.md:171-173`) asks for a central dictionary. Decide whether S-05 follows the current convention or introduces it.
15. **`/licenses` as a prerendered page.** The middleware reads request headers and creates a Supabase client on every request (`src/middleware.ts:7`), and `Layout.astro` evaluates `missingConfigs` from server secrets. Prerendering may cause build warnings or bake in a build-time config banner (*unverified*). Leaving it server-rendered avoids both.

### Open questions for `/10x-plan`

Answered 2026-10-03; the decisions are recorded in `change.md` "Decisions (2026-10-03)".

- Where can images be added: on the create form, the edit form, or the note page? (See 4.4.)
  - **Answer:** create and edit forms. On create, images upload after the 201 and before navigating away; "note saved, image failed" must be handled.
- Accept lossy compression, the Free-plan pause and the backup gap as risks under the PRD guardrail, or tell the user about them? (See §3.)
  - **Answer:** accept all three as risks, and show a short "images are compressed" hint next to the picker.
- Keep `browser-image-compression` with guards, or write the canvas pipeline by hand? (See 4.1.)
  - **Answer:** write it by hand (`createImageBitmap` → canvas → WebP). `browser-image-compression` is dropped.
- Reject animated GIFs, or accept them as static images? (See 4.10.)
  - **Answer:** accept GIF; animated files keep only their first frame, with a notice.
- *To test locally first:* bare-`fetch` signed upload without the anon key; bucket limits enforced on the signed-upload path; a `storage.objects` policy that joins to `public.notes`.

### Sources added in this verification

- Supabase pricing: https://supabase.com/pricing
- Supabase, deleting objects: https://supabase.com/docs/guides/storage/management/delete-objects
- `node_modules/@supabase/storage-js` 2.116.0, `src/packages/StorageFileApi.ts:276,348,382,796,1184`
- npm: https://registry.npmjs.org/browser-image-compression, https://registry.npmjs.org/heic-to (tarballs inspected: 2.0.2 and 1.6.5)
- MDN `createImageBitmap` / `HTMLCanvasElement.toBlob`; caniuse `webp`, `heif`
- LGPL-3.0: https://www.gnu.org/licenses/lgpl-3.0.html

---

## Follow-up: compression reference validation (2026-10-03)

**Researcher**: Hornster (Claude Code `/10x-research`) · **Git commit**: `4f0768e` (the reference files are uncommitted) · **Branch**: `main` · **Checked at**: 2026-10-03T01:58+02:00

**Question.** Is the proposed compression solution, together with its Safari WebP fallback, useful for S-05, given the `change.md` decisions? What problems may it carry?

The solution lives in two files: `references/compress-to-webp.js` (the script) and `references/image-compression-research.md` (the notes).

**How it was checked.**
- I read the script and the notes in full and compared them with `change.md` and the codebase (`tsconfig.json`, `astro.config.mjs`, `vitest.config.ts`, `supabase/config.toml`).
- Two read-only Sonnet subagents checked the external claims:
  - Browser APIs: caniuse, MDN BCD, the WHATWG spec, WebKit/Mozilla bugs and Chromium source.
  - Fallback options: the `npm pack @jsquash/webp@1.5.0` tarball, the jSquash README and issues, Cloudflare and Supabase docs, and a Node benchmark.
- Nothing ran in a real browser or on an iOS device.

### Summary

- **Useful: yes, as the base for the pipeline.** The script fits the 2026-10-03 "hand-written pipeline" decision. It decodes with `createImageBitmap`, re-encodes through a canvas, checks the output type, searches quality before downscaling, frees memory, and runs on the main thread or in a worker. The notes' reasons for dropping `browser-image-compression` hold up.
- **It cannot be used as-is.** It conflicts with four `change.md` decisions:
  1. a 4096 px side cap versus "no pixel-dimension limit";
  2. a starting quality of 0.9 versus about 0.8;
  3. it produces no thumbnail and returns no dimensions;
  4. it has no default Safari path.
- **The Safari fallback is confirmed necessary.** It still needs a product decision: canvas JPEG, or a WASM WebP encoder (`@jsquash/webp`). Server-side conversion isn't viable on the free tiers.
- **Byte-unit trap.** The script's `maxBytes` is 2.4 **MiB**, which is 2,516,582 B. If the bucket's "2.5 MB" is set as 2,500,000 B, the bucket rejects files the client accepts.

### 1. Claims in `image-compression-research.md`, re-checked

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Safari cannot encode WebP through canvas; it silently returns PNG | **Confirmed** | caniuse `convertToBlob` WebP row: Safari and iOS unsupported up to **26.6** (the notes say 26.5). WebKit bug 226950 was closed WONTFIX ("underlying frameworks do not support WebP encoding"). |
| Check `blob.type === 'image/webp'` after encoding | Confirmed (in practice) | MDN documents the PNG fallback for `toBlob` and `convertToBlob`. The WHATWG text spells it out only for `toDataURL`, but the same serialization algorithm applies. |
| Quality 1.0 makes Chrome's WebP lossless, so cap at about 0.9 | Confirmed | Chromium `image_encoder.cc` |
| `imageOrientation: 'from-image'` "is the spec default; explicit for older engines" | **Contradicted (the rationale)** | The `'from-image'` value arrived in Chrome 112, Firefox 111 and Safari 16 (MDN BCD; Mozilla bug 1809740). Under WebIDL, older engines throw `TypeError` on an unknown enum value. So the explicit option is what breaks older engines. On current engines it is harmless. |
| Cap the canvas at about 4096 px for iOS | **Partial** | The iOS limit is an **area**, 16,777,216 px, not a per-side limit (pqina.nl; WebKit bug 230855). 5120×3072 works; 4097×4096 doesn't. A per-side cap is stricter than the platform requires. |
| Don't rely on `resizeWidth`/`resizeHeight` | Confirmed | WebKit bug 202458, "createImageBitmap with resize option fails on Mac and iOS", has been open since 2019. |
| WebP format maximum is 16,383 px per side | Not re-checked | It matches the libwebp format limit as commonly documented. |
| Animated GIF/WebP flatten to the first frame | Partial | The spec requires the default image or the first frame. Behaviour in each engine wasn't tested. |
| HEIC decodes "in practice" only in Safari | Partial | caniuse HEIF lists only Safari 17+. That covers `<img>`, which is indirect evidence for `createImageBitmap`. It is consistent with `change.md`'s `heic-to` fallback. |
| Client-side stripping is not a guarantee; strip on the server too | Valid in general; **low impact here** | The bucket is private and scoped to each user. A client that bypasses the stripping can only store its own metadata, readable only by its owner. Server-side re-encoding isn't possible on free Workers (see §3). The commit step in research 4.5 still checks size and declared type. |

### 2. The script against `change.md` decisions

| `change.md` decision | Script behaviour | Problem and fix |
| --- | --- | --- |
| Bucket 2.5 MB; client ceiling 2.4 MB "with a margin for MB/MiB rounding" | `maxBytes: 2.4 * 1024 * 1024` = 2,516,582 B (`compress-to-webp.js:22`) | The margin holds only if the bucket's limit is also binary: 2.5 MiB = 2,621,440 B. A bucket set to 2,500,000 B rejects 2,500,001–2,516,582 B files. Put the bucket limit in bytes in the migration and keep both in the same unit. |
| "No pixel-dimension limit"; tall maps and handouts allowed | `maxDimension: 4096` on the longest side (`:23`, `:66`) | A 2000×12000 map would come out at 683×4096 and its text would become unreadable. A truly unlimited size isn't possible either: the iOS area limit is 16,777,216 px and WebP allows at most 16,383 px per side. Replace the side cap with an area cap of ≤ 16,777,216 px **plus** a side cap of ≤ 16,383. The same map would then come out at about 1672×10033. **`change.md` needs an updated decision.** |
| Starting WebP quality about 0.8; never inflate | `maxQuality: 0.9` is tried first (`:25`, `:103`) | Images below the ceiling are stored at 0.9, so they are bigger than decided. Set `maxQuality: 0.8`. |
| Thumbnail ≤ 512 px; store width and height of both | Returns one `Blob` and no dimensions (`:89`) | Decode once and produce both outputs from the same `ImageBitmap`. Return `{ blob, width, height, type }` for each. Calling it twice would decode the source twice, which is a memory cost on iOS. |
| Safari must work | Throws `WebPUnsupportedError` unless the caller passes a `fallbackEncoder` (`:57`) | A default path is needed (see §3). |
| Re-encode every image and strip EXIF | Always re-encodes. Canvas output carries no metadata. It never returns the input file. | ✓. This fixes the `browser-image-compression` problem from research 4.1. |
| HEIC goes through `heic-to`, then the normal pipeline | `createImageBitmap` rejects on undecodable input (`:62`) | ✓. The caller catches the rejection, runs `isHeic` → `heic-to` → JPEG, then calls the pipeline again. |
| Animated → first frame plus a fixed notice | The first frame comes out implicitly | ✓. The notice belongs in the UI, not here. |

### 3. Safari fallback options

| | (1) Canvas JPEG | (2) `@jsquash/webp` 1.5.0 (WASM libwebp) | (3) Server-side |
| --- | --- | --- | --- |
| Added payload | 0 | About 125 KB gzipped (SIMD build) or about 111 KB (non-SIMD), lazy-loaded. Both `.wasm` variants are emitted at build. | 0 |
| Output | JPEG with no alpha channel: transparency turns **black** unless the canvas is first filled with white | WebP with alpha, the same format in every browser | — |
| Speed | Native, fast | About 0.8 s per 4096×3072 encode with Node 22/V8 on desktop. Safari wasn't measured. With up to 7 encodes per size round, a phone could take several seconds. | Upload time plus server CPU |
| Integration cost | The bucket allows `image/jpeg`; the extension and content type follow the output type | `vite.optimizeDeps.exclude: ["@jsquash/webp"]` (README Known Issues; issues #78, #50); worker setup; `getImageData` can fail above 4096×4096 on Safari (WebKit 230855) | Free Workers allow 10 ms of CPU, so a WASM codec there isn't viable. The Cloudflare Images binding gives 5k free transformations a month, caps output at 4096×4096, and has limited offline local dev. Supabase transforms are Pro-only and work only at delivery time. |
| Licences for `/licenses` | none | Apache-2.0 (jSquash/Squoosh) plus BSD-3-Clause (libwebp, `codec/LICENSE.codec.md`) | — |
| Maintenance | — | One maintainer; releases are rare (1.4.0 in 2023-11, 1.5.0 in 2025-05) | — |
| Conflicts with decisions | "Bucket receives only WebP", path `{uuid}.webp` | none | Uploads the original, which breaks "compress in the browser" |

Recommendation: start with **(1) canvas JPEG**, filling the background with white before drawing. It adds no code size or licence and is fast on the weakest devices. Choose (2) only if a single stored format is worth about 125 KB, a Vite workaround and slower phone encodes. (3) is rejected.

### 4. Other problems the plan should cover

1. **Silent blank output on iOS.** A canvas over the area or memory limit draws nothing and raises no error (pqina.nl; library issues #116, #165, #205). The area cap from §2 prevents the known trigger. A cheap guard is to sample a few pixels after `drawImage` and fail if they are all transparent (*inference*).
2. **Full-size decode memory.** `createImageBitmap` decodes the whole source before downscaling. A 48 MP photo is about 192 MB as RGBA, and Safari has no reliable resize-on-decode. Mitigations:
   - process files one at a time (at most 2 per note);
   - call `bitmap.close()` promptly (the script already does);
   - test with a 48 MP iPhone photo, as `change.md` already plans for HEIC.
3. **`'from-image'` on older engines.** Either retry without options after a `TypeError`, or declare the minimum browsers (Chrome 112, Firefox 111, Safari 16.4 for OffscreenCanvas 2D). The script's fallback to a DOM canvas (`:134-139`) suggests it was meant to support older engines.
4. **Port to TypeScript under `strictTypeChecked`.** `getContext('2d')` can return `null`, the module-level `nativeSupport` needs a type, and options need an interface. Put it in `src/lib/` per CLAUDE.md conventions.
5. **Testability.** Vitest runs with `environment: "node"` (`vitest.config.ts:17`), which has no canvas. Keep `bestUnderBudget` and the size or area calculation as pure functions with an injected encoder, so they get unit tests. The canvas parts need manual browser checks.
6. **SSR.** The module only touches browser globals inside functions, so importing it on the server doesn't crash. Still, keep `await import()` in the handler (research 4.8) so the module stays out of the Worker bundle.
7. **Error reporting.** The "cannot compress" error is a plain `Error` with a byte count (`:92`). The UI needs distinct cases: unsupported or corrupt, too large, browser failure. Use typed errors, like `WebPUnsupportedError`.
8. **The capability probe caches failure for the whole page session** (`:39-51`) and treats any rejection as "no WebP". That's acceptable and conservative.

### Open questions for `/10x-plan`

Answered 2026-10-03; the decisions are recorded in `change.md` "Decisions (2026-10-03)".

- Safari fallback: canvas JPEG (recommended) or `@jsquash/webp`? **Answer:** canvas JPEG.
- Replace "no pixel-dimension limit" with an area cap of ≤ 16,777,216 px plus ≤ 16,383 px per side? **Answer:** yes.
- Bucket limit unit: 2.5 MiB (2,621,440 B) with a 2.4 MiB ceiling in the client, or decimal for both? **Answer:** binary MiB.
- Minimum supported browsers (sets item 4.3)? **Answer:** Chrome 112+, Firefox 111+, Safari 16.4+.

### Sources added in this follow-up

- caniuse `convertToBlob` WebP: https://caniuse.com/mdn-api_offscreencanvas_converttoblob_option_type_parameter_webp
- WebKit 226950 (WebP encoding WONTFIX): https://bugs.webkit.org/show_bug.cgi?id=226950
- WebKit 230855 (getImageData above 4096²): https://bugs.webkit.org/show_bug.cgi?id=230855
- WebKit 202458 (createImageBitmap resize): https://bugs.webkit.org/show_bug.cgi?id=202458
- Mozilla 1809740 (`imageOrientation: 'from-image'`): https://bugzilla.mozilla.org/show_bug.cgi?id=1809740
- Chromium image encoder: https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/image-encoders/image_encoder.cc
- Canvas area limit: https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/
- MDN `toBlob` / `convertToBlob`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob, https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob
- jSquash (Known Issues, examples): https://github.com/jamsinclair/jSquash
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/; Images pricing: https://developers.cloudflare.com/images/pricing/
- Supabase image transformations: https://supabase.com/docs/guides/storage/serving/image-transformations

