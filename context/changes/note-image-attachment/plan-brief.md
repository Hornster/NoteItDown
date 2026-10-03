# Note Image Attachment (S-05) — Plan Brief

> Full plan: `context/changes/note-image-attachment/plan.md`
> Research: `context/changes/note-image-attachment/research.md`

## What & Why

Users can attach up to 2 images to a note, such as maps, handouts and portraits, alongside its text (FR-004, roadmap S-05). Images are compressed in the browser and stored privately, so they fit the Supabase free tier and stay isolated per account. They never touch the text that relation matching reads.

## Starting Point

Notes are plain text with per-user RLS. The Supabase client is server-only, and the browser talks only to the app's API. Storage is enabled locally, but there is no bucket, image table or image code. CI starts Supabase without the Storage container. `NoteForm` is shared by create and edit, and its save hook navigates away as soon as the note write returns.

## Desired End State

On the create and edit forms, a user picks up to 2 images (jpeg, png, webp, gif, heic). Each one is processed on pick and previewed, with optional alt text. On Save, the note is written first, then the image changes are applied. If an image fails, the note is kept and the user lands on the edit form with a notice. The note page shows thumbnails, and clicking one opens a full-size popup. Deleting a note deletes its files. A public `/licenses` page, linked from a footer on every page, lists the LGPL decoder.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Storage | Private Supabase bucket `note-images` + `note_images` table | Already in the stack; access enforced by RLS; a public bucket would bypass RLS | Research |
| Limits | ≤ 2 images per note; bucket 2,621,440 B (2.5 MiB); client ceiling 2,516,582 B (2.4 MiB); webp and jpeg only | Same binary unit on both sides, so the bucket never rejects a compressed file | Research |
| Pipeline | Hand-written `createImageBitmap` → canvas → WebP at 0.8; area cap 16,777,216 px and ≤ 16,383 px per side; thumbnail ≤ 512 px | Exact control: EXIF always stripped, never inflated, the original never passed through | Research |
| Safari | Canvas JPEG on a white background | No added code or licence, and fast | Research |
| HEIC | Lazy `heic-to@1.6.5`, only when native decoding fails and the bytes say HEIC | Linux and Windows Chrome and Firefox can't decode HEIC | Research |
| Upload path | Signed upload URL: prepare → browser PUT → commit with an `info()` check | The Worker never handles the bytes; the commit step is the only server-side check of what landed | Plan |
| Edit timing | Image changes are held until Save; Cancel discards them | Same model as the text fields and the create flow | Plan |
| Processing | On pick, with a preview; Save is disabled while processing | Errors appear next to the file, and Save only does network work | Plan |
| Alt text | Optional, ≤ 200 chars, editable later; falls back to "<note name> — image N" | Accessible without slowing down uploads | Plan |
| Error strings | New HTTP, SQLSTATE and message dictionaries, used only by S-05 code | Stops the duplication from growing without refactoring finished slices | Plan |
| Testing | Integration tests for RLS and Storage policies in CI (enables `storage-api`) | Cross-tenant isolation gets a regression test on every push | Plan |
| Policy shape | INSERT checks the user's folder and note ownership; SELECT and DELETE check only the user's folder | `remove()` needs SELECT and DELETE after the note row is gone | Plan |

## Scope

**In scope:**
- The migration (bucket, table, RLS, `storage.objects` policies)
- The `note-images` service and 4 API routes, plus Storage cleanup on note delete
- The browser pipeline, picker, held saves and failure notice
- Thumbnails and the popup
- HEIC, `/licenses` and the footer
- CI Storage, integration tests, contract-surfaces and the roadmap update

**Out of scope:**
- Campaign-delete cleanup (no flow exists; recorded as an obligation)
- Migrating old routes to the dictionaries
- Reordering images or more than 2 per note
- Server-side re-encoding, preserved animation, a WASM WebP encoder
- Images on the list or the map
- MIT notices for other dependencies, a CSP, mobile layout

## Architecture / Approach

The browser processes each image (WebP or JPEG, plus a thumbnail), then asks `POST …/images/uploads` for signed URLs. The server builds the path `{uid}/{campaign}/{note}/{uuid}.{ext}`. The browser PUTs the bytes straight to Storage, then calls `POST …/images`. That commit step verifies the objects, picks the free position (0 or 1) and inserts the row; if the insert fails, it removes the objects.

The database enforces the cap with `unique (note_id, position)`, keeps rows in the right campaign with composite FKs, and isolates users with RLS. Pages sign thumbnail URLs in one batch (6 h). The popup fetches a 5-minute full-size URL from `GET …/images/[id]`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Storage foundation | Migration, constants, dictionaries, service, CI Storage, isolation tests | Signed-upload behaviour (`apikey`, bucket limits on the signed path) is unverified until tested |
| 2. Image API + delete cleanup | 4 routes and note-delete folder removal | Telling Storage outages (500) apart from missing images (404) in every route |
| 3. Pipeline + form attach | Compression port, picker, held saves, failure notice | Browser differences (Safari JPEG, iOS canvas limits, memory) |
| 4. Note page display | Thumbnails, popup, one-time URL refresh | Expired signed URLs on long-open pages |
| 5. HEIC + `/licenses` + footer *(cuttable)* | HEIC conversion, notices page, footer, roadmap wrap-up | Decoder size and memory on 48 MP files; LGPL details (libde265 licence) |

**Prerequisites:** S-01 and S-04 done (they are). Docker for local Supabase with Storage.
**Estimated effort:** about 5 implementation sessions, one per phase. Phase 3 is the largest.

## Open Risks & Assumptions

- Phase 1 settles whether the signed-upload PUT needs the anon key. If it does, the prepare response carries the anon key, which is public by design.
- Commit-time `info()` is the size and type guard even if the bucket doesn't enforce its limits on signed uploads. The bucket checks only the declared type, not the bytes.
- Accepted risks (`change.md`): lossy re-encoding, the Free-plan pause after a week of inactivity, and database backups that don't cover Storage.
- An abandoned upload outside a note delete leaves an orphaned file until that note is deleted.

## Success Criteria (Summary)

- A user can attach, preview, caption, replace and remove up to 2 images on create and edit, and view them as thumbnails with a full-size popup, in Chrome, Firefox and Safari.
- No account can reach another account's images, and CI proves it on every push.
- Deleting a note leaves no files behind, and a failed image upload never loses the note.
