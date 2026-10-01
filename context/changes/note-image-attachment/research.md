---
change_id: note-image-attachment
title: "Research: image attachment options for notes"
created: 2026-10-01
roadmap_ref: S-05
prd_refs: [FR-004]
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
