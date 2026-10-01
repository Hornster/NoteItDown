---
change_id: note-image-attachment
title: Attach an image to a note
status: new
created: 2026-10-01
updated: 2026-10-01
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
- Bucket `file_size_limit` is **2.5 MB per file**.
- Browser compression ceiling is **2.4 MB** (`maxSizeMB: 2.4`). The margin covers MB/MiB rounding so the bucket never rejects a compressed file.
  - The limit applies to each file separately. A thumbnail is its own object with its own 2.5 MB allowance, so it doesn't share the original's budget.
- There is **no pixel-dimension limit**. Tall and wide images (maps, handouts) are allowed. Only the data size is capped.
- Allowed types: jpeg, png and webp, maybe gif. **No SVG** (XSS risk). The file picker also accepts HEIC/HEIF; the browser converts them (see "HEIC conversion" below), so the bucket only ever receives WebP.

### Processing in the browser

- **Re-encode every image**, including files already under the ceiling. This strips EXIF data (GPS location; `preserveExif: false`) and applies the orientation flag to the pixels.
- Treat 2.4 MB as a **ceiling, not a target**:
  - Encode as WebP at a fixed starting quality of about 0.8 (`initialQuality`).
  - Lower the quality or the resolution further only if the result is still over 2.4 MB.
  - Never inflate images toward the limit. The free tier's 1 GB is shared across all users.
- Proposed library: `browser-image-compression`. Self-host its web-worker script (`libURL`) or set `useWebWorker: false`; by default it loads from cdn.jsdelivr.net.

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
  - MIT: `browser-image-compression`.
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
