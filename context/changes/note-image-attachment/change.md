---
change_id: note-image-attachment
title: Attach an image to a note
status: preparing
created: 2026-10-01
updated: 2026-10-03
archived_at: null
---

## Notes

@context/foundation/roadmap.md s-05 take the change ID from the change ID in the roadmap file

- Roadmap outcome: S-05, attach images to a note. PRD refs: FR-004. Prerequisite: S-01.
- Research: @context/changes/note-image-attachment/research.md

## Decisions (2026-10-01)

### Storage approach

- Use option 1 from research.md: a **private** Supabase Storage bucket plus a `note_images` table. A public bucket is rejected because public reads bypass RLS.
- This settles the roadmap's open S-05 question about bucket policy.

### Limits

- **Scope change from FR-004:** FR-004 says "an image". This change allows **up to 2 images per note**. Enforce the cap on the server and in the database, not only in the UI.
- Bucket `file_size_limit` is **2.5 MiB per file** (2,621,440 B, set in bytes in the migration; unit decided 2026-10-03).
- Browser compression ceiling is **2.4 MiB** (2,516,582 B). Both limits use binary units, so the bucket never rejects a compressed file.
  - The limit applies to each file separately. A thumbnail is its own object with its own 2.5 MB allowance, so it doesn't share the original's budget.
- ~~There is **no pixel-dimension limit**.~~ **Superseded 2026-10-03:** area cap, see "Decisions (2026-10-03)".
- Allowed types: jpeg, png, webp and gif (gif decided 2026-10-03, see below). **No SVG** (XSS risk). The file picker also accepts HEIC/HEIF; the browser converts them (see "HEIC conversion" below), so the bucket receives only WebP, or JPEG from Safari (changed 2026-10-03).

### Processing in the browser

- **Re-encode every image**, including files already under the ceiling. This strips EXIF data (GPS location; `preserveExif: false`) and applies the orientation flag to the pixels.
- Treat 2.4 MB as a **ceiling, not a target**:
  - Encode as WebP at a fixed starting quality of about 0.8 (`initialQuality`).
  - Lower the quality or the resolution further only if the result is still over 2.4 MB.
  - Never inflate images toward the limit. The free tier's 1 GB is shared across all users.
- ~~Proposed library: `browser-image-compression`.~~ **Superseded 2026-10-03:** hand-written pipeline, see "Decisions (2026-10-03)".

### HEIC conversion

- **Why:** `browser-image-compression` decodes through the browser.
  - HEIC decodes natively only in Safari and in Chrome/Edge on macOS.
  - It does not decode in Chrome on Linux, in Chrome/Edge on Windows without the paid HEVC extension, or in Firefox anywhere.
- **Library:** `heic-to` (https://github.com/hoppergee/heic-to, LGPL-3.0, libheif 1.22.x).
  - Chosen over `heic2any`, which ships an outdated libheif and is barely maintained.
  - Install it from npm and bundle it. Don't use the jsDelivr IIFE script.
- **Flow:**
  1. Try `createImageBitmap(file)`. If it succeeds, continue with the normal pipeline. No extra download.
  2. If it fails and `isHeic(file)` is true, load `heic-to` with a dynamic `import()` and convert to a high-quality JPEG (about 0.92).
  3. Pass the result through the normal pipeline: WebP, the 2.4 MB ceiling, the thumbnail and EXIF stripping.
  4. If it fails and `isHeic` is false, show a separate "unsupported or corrupt file" error.
- **Detect HEIC from the file's bytes** (`isHeic`), not from `file.type` or the extension. Some operating systems report an empty type.
- **Lazy loading:** the decoder is about 0.5 MB gzipped. Load it only on the fallback path, as its own chunk.
- **Speed:** decoding takes about 0.4 s for 12 MP on a fast laptop and is slower elsewhere. Show a "Processing…" state. Consider the web-worker build (`heic-to/next`) if the main thread freezes.
- **Content-Security-Policy:** if the app ever adds a CSP without `unsafe-eval`, switch to `heic-to/csp`.
- **LGPL-3.0 obligations:**
  - Keep the library in its own, unmodified chunk (the lazy import already does this) so it can be replaced.
  - Include its license notice in the app's third-party notices.
  - Any changes made to the library itself must be published under LGPL.
- **Testing:** Chrome or Firefox on Linux (no native decode), plus a large 48 MP iPhone HEIC to check memory use.

### Third-party notices (in scope for this slice)

- **Why:** the browser receives the bundled code, so the license obligations apply:
  - LGPL-3.0: `heic-to`, and the libheif and libde265 libraries it bundles.
  - ~~MIT: `browser-image-compression`.~~ Dropped 2026-10-03.
- **New page** `/licenses` (Astro, static):
  - It is **public**, so don't add it to `PROTECTED_ROUTES`. Legal notices must be readable without signing in.
  - It is fully static, so it can be prerendered.
- **For each library this slice adds**, the page shows:
  - the name and the exact version bundled
  - the license name
  - the copyright line
  - a link to the source code
- **Full license texts:** include LGPL-3.0, plus GPL-3.0, which LGPL-3.0 incorporates by reference. MIT notices are short enough to show inline.
- **Link to it from a footer.** There is no footer in `src/layouts/Layout.astro` today. This slice adds a minimal one there, so the link appears on every page. Decided 2026-10-01.
- **Out of scope:** notices for every other bundled dependency (React, Radix, etc.). This page lists only the libraries this slice adds. The rest is parked in the roadmap ("MIT notices for remaining bundled dependencies").

### Thumbnails and display

- **Always create a thumbnail** of at most **512 px on the longest side**.
  - If the original already fits within 512 px, it is its own thumbnail and no second file is stored.
  - So each image is one or two objects, and each note has at most 4.
- `note_images` stores the original's path, the thumbnail's path (nullable when the original is its own thumbnail), and the width and height of both, so the page doesn't jump while images load.
- Note pages show thumbnails only. Clicking one opens a **popup with the full-size image** (shadcn `Dialog`, sized to the window with `object-contain`).

### Signed URLs

- **Thumbnails:** create their URLs in one batched `createSignedUrls` call per page render, with an expiry of about **6 hours** to cover long sessions.
- **Full-size images:** create the URL **when the popup opens**, through a small endpoint that checks ownership (e.g. `GET /api/notes/[id]/images/[imageId]`). The URL is short-lived (minutes). Full-size URLs never appear in the page HTML, and the full-size bytes download only on click.
- **Recovering from expired links:** if a thumbnail fails to load (`onError`), call the same endpoint **once** for fresh URLs and swap them in. Don't retry beyond that.

### Carried over from research, to cover in the plan

- Clean up Storage files in the note delete flow (S-04), in campaign deletion, and when an upload succeeds but the row insert fails. Delete both the original and the thumbnail. SQL cascades remove rows but leave the files in the bucket.
- Build file paths on the server: `{user_id}/{campaign_id}/{note_id}/{uuid}.webp`. RLS on `storage.objects` uses a per-operation policy based on the user's folder, plus a check that the note belongs to the user.
- Image changes don't go through the relation re-detection RPC, and don't change `updated_at` in a way that misleads the S-04 relation-change notice.

## Decisions (2026-10-03)

Answers to the open questions in research.md "Verification (2026-10-03)".

### Where images are added

- On **both the create and the edit form**.
- Create flow: the note is created first (the storage path needs `note_id`). Images upload **after the 201 and before navigating away**.
- If the note saved but an image failed, don't lose the note and don't hide the failure. Show which image failed and let the user retry from the edit form.

### PRD guardrail ("never lost or corrupted", "no silent degradation")

- **Accepted risks:**
  - every image is lossily re-encoded to WebP;
  - Free-plan projects pause after a week of inactivity;
  - Supabase database backups do not cover Storage objects.
- **Not silent:** show a short hint next to the file picker saying images are compressed.

### Processing pipeline

- **Hand-written**, no `browser-image-compression`: `createImageBitmap` → canvas / `OffscreenCanvas` → WebP blob.
- This gives exact control over the earlier decisions: EXIF is always stripped, no resolution is lost unless the file is over the 2.4 MB ceiling, and the output is never the original file.
- Check the output `type`. Where the browser can't encode WebP, the canvas falls back to PNG silently. Confirmed: Safari can't encode WebP. The fallback is canvas JPEG, see below.
- `/licenses` no longer lists `browser-image-compression`.

### Animated images

- **Accept GIF.** Animated GIF/WebP keep only their **first frame** after re-encoding.
- No animation detection. Show a **fixed line** ("Animated images become static") whenever a GIF or WebP file is picked.

### Compression pipeline details (from research "Follow-up: compression reference validation")

- **Base:** `references/compress-to-webp.js`, ported to TypeScript in `src/lib/`, with these changes:
  - starting quality (`maxQuality`) **0.8**;
  - a single decode produces both the image and the 512 px thumbnail, and returns `{ blob, width, height, type }` for each.
- **Dimensions:** an **area cap of ≤ 16,777,216 px** (the iOS canvas limit) plus **≤ 16,383 px per side** (the WebP maximum), replacing the 4096 px side cap. Tall maps keep most of their resolution, e.g. 2000×12000 → about 1672×10033.
- **Safari fallback: canvas JPEG.**
  - When the WebP output check fails, encode as JPEG. Fill the canvas with white before `drawImage` so transparency doesn't turn black.
  - The bucket allow-list is `image/webp` and `image/jpeg`. The file extension and content type follow the output type, so the path becomes `{uuid}.webp` or `{uuid}.jpg`.
  - This replaces "the bucket only ever receives WebP".
- **Minimum browsers:** Chrome 112+, Firefox 111+, Safari 16.4+. Keep `imageOrientation: 'from-image'` and OffscreenCanvas. Older browsers get a clear "browser not supported" error.
