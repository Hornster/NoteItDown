<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Image Attachment (S-05)

- **Plan**: context/changes/note-image-attachment/plan.md
- **Scope**: Phase 3 of 5
- **Reviewed phases**: 3
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes:
- **Plan Adherence.** All five Phase 3 items match the plan. Nothing is missing.
- **Scope Discipline.** There are a few benign additions:
  - the `maybeAnimated` and `ImageChanges.labels` type fields;
  - the `MESSAGES` and `HTTP_STATUS` adoption in `useSaveNote`;
  - the Safari "Parked" entry in the roadmap, a user decision recorded at 3.8.
- **Head bytes.** The 32-byte head is read for every file, not only after `UnsupportedImageError`. The animated-type sniffing needs it, and the HEIC decision still runs only after a decode error.
- **Success Criteria.** These checks passed on 2026-10-06:
  - `npm run test:unit` (84 tests);
  - `npm run test:integration` (89 tests);
  - `npm run lint`;
  - `npx astro check` (0 errors);
  - `npm run build`.
- **Worker bundle.** It has no `convertToBlob`; that code is only in `dist/client/_astro/compress.*.js`.
- **Safari.** Manual check 3.8 is annotated as not verified, following the lessons.md waiver rule.

## Findings

### F1 — Blank-canvas guard rejects legitimate transparent images

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/images/compress.ts:108-117, 135
- **Detail**: `looksBlank` samples only 9 pixels: the corners, the edge midpoints and the centre. If all 9 have alpha 0, it throws `BrowserImageError`. A valid transparent PNG, WebP or GIF can fail this check when every sampled point falls in a transparent area, for example a ring logo, an outlined token or a centred map marker on a transparent background. The user then gets "browser couldn't process this image" for a good file. The guard targets an iOS failure, but it runs on the WebP path, which is Chrome and Firefox where that failure doesn't happen. Skipping it on the JPEG path is planned and is not the finding.
- **Fix A ⭐ Recommended**: Use a denser check. Scan a small downscaled copy (for example, draw the bitmap to a 16×16 canvas and read one `getImageData`), and call the image blank only when every pixel has alpha 0.
  - Strength: Fully transparent output is the only real blank signal. A 256-pixel scan practically removes false positives at negligible cost.
  - Tradeoff: One extra tiny canvas per encode.
  - Confidence: HIGH — straightforward, contained in one function.
  - Blind spot: A tiny shape could still vanish when downscaled to 16×16. Using 32×32 reduces that.
- **Fix B**: Only run the guard when the decoded source is known to be opaque (for example JPEG input), or drop it on the WebP path.
  - Strength: Zero false positives.
  - Tradeoff: Loses the guard in the cases it covers today.
  - Confidence: MED — depends on whether blank-canvas failures actually occur on WebP-capable browsers.
  - Blind spot: No device evidence either way.
- **Decision**: FIXED (Fix A — looksBlank now scans a 32×32 downscale of the canvas)

### F2 — Exception after create 201 can lead to a duplicate note

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useSaveNote.ts:44, 56-61, 89-92
- **Detail**: In create mode, anything that throws after the 201 lands in the outer `catch`. That `catch` shows "Network error" and calls `setPending(false)`, so the user clicks Create again and gets a second note.
  - Concrete triggers: `window.sessionStorage` is evaluated as an argument at line 44 and throws `SecurityError` when site data is blocked; `response.json()` on the 201 can also fail.
  - `applyImageChanges` itself catches per step, so these are low-probability paths. The PRD guardrail is "never lost", and a duplicate is the inverse problem.
- **Fix**: After the 201, wrap the image phase in its own try/catch. Read storage inside a guarded getter, and on any error still `location.replace` to the new note's edit page. Never fall through to the network-error branch once the note exists.
- **Decision**: FIXED (post-201 path guarded; sessionStorage read via `sessionStorageOrNull()` in both modes)

### F3 — Image-table error turns the edit page into a 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/campaigns/[campaignId]/notes/[noteId]/edit.astro:39 (via `listNoteImages` throw, src/lib/services/note-images.ts:123-125)
- **Detail**: `listNoteImages` throws on a query error, and the edit page doesn't catch it. An image-table problem therefore blocks text editing of the note entirely. A signing failure is already handled: it gives `thumb_url: null`, shown as "Image unavailable". The Phase 4 note page has the same call.
- **Fix A ⭐ Recommended**: Catch the images load in `edit.astro`. On failure, render the form without the picker plus a short "Images couldn't be loaded" banner.
  - Strength: Text editing keeps working. The cap can't be misjudged, because the picker isn't offered.
  - Tradeoff: A new `NoteForm` prop or mode (images unavailable). Small, but it touches the form.
  - Confidence: HIGH — contained change.
  - Blind spot: The note detail page (Phase 4) would need the same treatment for consistency.
- **Fix B**: Fall back to `images = []` and keep the picker.
  - Strength: A one-line change.
  - Tradeoff: The UI thinks there are 0 images. A note that already has 2 gets `limit_reached` at save, and existing images can't be removed or edited.
  - Confidence: MED — works, but misleads.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — edit.astro catches the load and passes `images={null}`; NoteForm shows `MESSAGES.IMAGES_LOAD_FAILED` instead of the picker. The note page ([noteId].astro) still has the same throw; not changed, out of Phase 3 scope)

### F4 — Class concatenation and inline UI strings in new code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/notes/NoteImagePicker.tsx:245-247, 166; src/lib/images/upload.ts:32, 56
- **Detail**:
  - The `<label>` class uses a template-literal conditional, but CLAUDE.md requires `cn()`.
  - The picker hard-codes "Image unavailable", although Phase 4 added `MESSAGES.IMAGE_UNAVAILABLE`.
  - `upload.ts` builds the `image ${n}` label inline.
  - These go against the lessons.md rule "Use the central error/status/message dictionaries in new code".
  - Static UI labels such as "Add image" and "Alt text" are borderline. The dictionary is for user-facing messages.
- **Fix**: Switch the label to `cn(...)`, use `MESSAGES.IMAGE_UNAVAILABLE`, and add a `MESSAGES` entry for the "image N" fallback label.
- **Decision**: FIXED (`cn()` on the label; `MESSAGES.IMAGE_UNAVAILABLE`; new `MESSAGES.IMAGE_LABEL_FALLBACK` + `imageLabel(n)` in messages.ts, used by upload.ts and NoteForm.tsx)

### F5 — Object URL leaks when a pick is removed while processing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteImagePicker.tsx:73-92, 119-122
- **Detail**: `removePending` has no `previewUrl` to revoke yet. `processOne` keeps compressing, then calls `URL.createObjectURL` and `patchPending`, which matches no key, so the URL is never revoked. The same happens on unmount mid-processing. That leaks up to about 2.4 MB per occurrence until navigation.
- **Fix**: Track removed or unmounted keys in a ref. Skip processing and `createObjectURL` for them, or revoke immediately when `patchPending` finds no match.
- **Decision**: FIXED (`dropped` key set + `unmounted` ref; `processOne` skips gone picks before work and before `createObjectURL`)

### F6 — Files beyond the free slots are dropped silently

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteImagePicker.tsx:97-99
- **Detail**: `files.slice(0, slots)` ignores the extra files with no message. For example, picking 3 files with 1 free slot ignores 2. This conflicts with the spirit of "no silent degradation".
- **Fix**: When `files.length > slots`, show a short inline note (for example, "Only N more image(s) allowed; X file(s) ignored") using a `MESSAGES` entry.
- **Decision**: FIXED (picker shows `imagesIgnoredNotice(n)` from messages.ts until the next pick)

### F7 — A hung decode stalls the processing queue

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteImagePicker.tsx:114-116
- **Detail**: `queue.current.then(...)` has no `.catch` and no timeout. `processOne` can't reject today. But if `processImage` or `convertHeicToJpeg` never settles, the pick stays "processing", Save stays disabled and later picks never start. Removing the stuck pick re-enables Save but not the queue.
- **Fix**: Add `.catch(() => undefined)` to the chain. Optionally race each item against a generous timeout that marks it `error`.
- **Decision**: FIXED differently (user chose a 30 s timeout instead of 120 s): `IMAGE_PROCESSING_TIMEOUT_MS = 30_000` in limits.ts, `ImageProcessingTimeoutError` + `MESSAGES.IMAGE_PROCESSING_TIMEOUT`, `withTimeout` around processing, `.catch` on the queue chain. Timed-out work keeps running in the background (not cancellable), so a following pick can overlap with it in memory. A slow device on a 48 MP HEIC may hit the 30 s limit; re-check manual 5.8 on slower hardware.

### F8 — DELETE 404 during edit save reported as a failure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/images/upload.ts:34-40
- **Detail**: If the image is already gone (for example, deleted in another tab), DELETE returns 404. The user then lands on the edit page with a failure notice, even though the desired state was reached.
- **Fix**: Treat a 404 on DELETE as success. This needs `sendJson` to expose the status or a typed not-found error.
- **Decision**: FIXED (`createImageApi().deleteImage` uses `send` directly and treats `HTTP_STATUS.NOT_FOUND` as success)

### F9 — Picker processing logic not extracted to a hook

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/notes/NoteImagePicker.tsx:47-142
- **Detail**: The queue, processing, object-URL lifecycle and held-state updates all live inside the component. CLAUDE.md says "Extract hooks to `src/components/hooks/`", and the siblings are `useSaveNote`, `useDeleteNote` and `useSaveCampaign`. This is not a functional issue.
- **Fix**: Move the logic into `src/components/hooks/useImagePicks.ts`. Fixing F5 and F7 there at the same time is natural.
- **Decision**: FIXED (moved into `src/components/hooks/useImagePicks.ts`, including the F5/F6/F7 logic; the picker now only renders)

## Triage summary (2026-10-06)

- **Fixed**: F1 (Fix A), F2, F3 (Fix A), F4, F5, F6, F7 (differently: 30 s timeout), F8, F9 (9)
- **Skipped / accepted / rules**: none
- **Verification after fixes**:
  - `npm run lint` is clean.
  - `npx astro check` reports 0 errors.
  - `npm test` passes 173 tests (unit and integration).
  - `npm run build` succeeds, with no `convertToBlob` in `dist/server`, and `heic-to` (`de265_`) is still in its own client chunk.
  - `docs/reference/contract-surfaces.md` has been updated for `IMAGE_PROCESSING_TIMEOUT_MS`, the `images={null}` edit fallback and DELETE 404 as success.
- **Manual re-checks suggested**:
  - Pick a transparent PNG with a hollow centre (F1).
  - Pick 3 files at once on an empty note (F6).
  - Try a 48 MP HEIC on slower hardware against the 30 s timeout (F7).
  - Remove a pick while it shows "Processing…" (F5).
