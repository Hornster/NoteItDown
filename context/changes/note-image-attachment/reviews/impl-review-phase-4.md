<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Image Attachment (S-05)

- **Plan**: context/changes/note-image-attachment/plan.md
- **Scope**: Phase 4 of 5
- **Reviewed phases**: 4
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated checks re-run on 2026-10-06 at HEAD: `npm run lint` passed, `npx astro check` reported 0 errors, `npm test` passed (17 files, 173 tests), and `npm run build` passed. Every planned item matches the plan: `dialog.tsx`, `NoteImages.tsx`, the note page wiring and contract-surfaces. The unplanned changes are harmless: new `MESSAGES` entries, the `@radix-ui/react-dialog` dependency, and a roadmap observation from check 4.7. The Phase 4 files have not changed since commit `99a563c`.

## Findings

### F1 — Image-table failure turns the note page into a 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/campaigns/[campaignId]/notes/[noteId].astro:41
- **Detail**: `listNoteImages` throws when its query fails (`src/lib/services/note-images.ts:123-125`), and the note page awaits it without a guard. So a `note_images` error stops the user from reading a note whose text loaded fine. This is the same defect as Phase 3 F3. That fix added a try/catch, a log and an `imagesUnavailable` banner, but only to `edit.astro:40-47`. The note page never got the same guard.
- **Fix**: Wrap the images load in the same try/catch as `edit.astro`: log with `console.error`, fall back to `images = []`, and show a short "Images couldn't be loaded" line.
- **Decision**: FIXED (try/catch + log + `MESSAGES.NOTE_IMAGES_LOAD_FAILED` notice on the note page)

### F2 — Gallery fetch/state logic not extracted to a hook

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/notes/NoteImages.tsx:16-81
- **Detail**: CLAUDE.md says hooks go in `src/components/hooks/`. Every sibling island that fetches follows this (`useDeleteNote`, `useSaveNote`, `useImagePicks`). `NoteImages` keeps about 65 lines inline: the abort controller, the full-size state machine, the refresh-once set and the refs. Phase 3 F9 flagged the same thing for the picker, so this is a recurring pattern.
- **Fix**: Extract `useNoteImages(campaignId, noteId, images)` into `src/components/hooks/`. It would return `thumbUrls`, `openId`, `full`, `openImage`, `closeImage`, `refreshThumb` and `registerImg`, and the component would only render. Consider recording this as a lesson, since it has come up twice.
- **Decision**: FIXED (extracted `src/components/hooks/useNoteImages.ts`; component only renders)

### F3 — Full-size image has no load or error handling

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteImages.tsx:144-146
- **Detail**: The "Loading image…" text disappears as soon as the signed URL arrives, before the bytes download. A large image therefore shows an empty dialog for a moment. If the bytes then fail to load, the dialog shows a broken-image icon instead of `IMAGE_FULL_LOAD_FAILED`.
- **Fix**: Render the `<img>` hidden while loading, keep the loading text until `onLoad`, and set `status: "error"` in `onError`.
- **Decision**: FIXED (`loaded` flag in `FullImageState`; loading text until `onLoad`, `onError` → error state)

### F4 — Dialog close button is low-contrast on the black popup

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/dialog.tsx:58-60, src/components/notes/NoteImages.tsx:133
- **Detail**: The stock close button uses `text-muted-foreground` at `opacity-70`, a mid-grey in the light theme, which is the only theme in use. `NoteImages` sets the content to `bg-black/80`, so the X is a dim grey on black and sits over the image's top-right corner. Esc and clicking the overlay still close the dialog, and check 4.7 passed. This is visibility only.
- **Fix**: Add `[&_[data-slot=dialog-close]]:text-white` (or similar) to `DialogContent`'s className in `NoteImages`, and leave the generated `dialog.tsx` untouched.
- **Decision**: SKIPPED (recorded as a roadmap observation; to be handled in the UI visuals revamp)

### F5 — Contract says the full-size URL is never in the HTML; untrue for images without a thumbnail

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: docs/reference/contract-surfaces.md (note detail route)
- **Detail**: When `thumb_path` is null (the original fits within 512 px), `toImageViews` signs the original for 6 h and puts that URL in the island props. The plan anticipated this (`NoteImageView.thumb_url` is "the original's when there is no separate thumbnail"), and those images are only thumbnail-sized, so egress and exposure barely change. The blanket "never in the page HTML" statement is still inaccurate.
- **Fix**: Change the contract-surfaces wording to: "the full-size URL is never in the page HTML when a separate thumbnail exists; images ≤ 512 px are their own thumbnail."
- **Decision**: FIXED (contract-surfaces wording made precise; also documents the F1 fallback)

### F6 — Broken thumbnail after the one refresh doesn't fall back to the placeholder

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/notes/NoteImages.tsx:29-40, 93-121
- **Detail**: After the single refresh is used up (it fails, or the new URL also fails), the broken `<img>` stays, while a null `thumb_url` gets the "Image unavailable" placeholder. A network error during the refresh also uses up the one attempt. This matches the planned "never twice" behaviour, so the only issue is the inconsistent display.
- **Fix**: Keep a `failed` set that is filled on a second `onError` or a failed refresh, and render the existing placeholder for those ids.
- **Decision**: FIXED (refresh state pending/done; a failed or spent refresh sets the URL to null → existing placeholder)

### F7 — Alt-text fallback is an inline user-facing literal

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/notes/NoteImages.tsx:26
- **Detail**: `` `${noteName} — image ${index + 1}` `` is text that screen readers announce, but it is not in `MESSAGES`. That goes against the lessons.md rule "Use the central error/status/message dictionaries in new code". All the other new strings in this phase use `MESSAGES`.
- **Fix**: Add `imageAltFallback(noteName, n)` (or a template constant) to `src/lib/messages.ts` and use it.
- **Decision**: FIXED (`imageAltFallback(noteName, n)` in `src/lib/messages.ts`, built on `imageLabel`)

## Triage summary (2026-10-07)

- **Fixed**: F1, F2, F3, F5, F6, F7 (6)
- **Skipped**: F4 (1) — recorded as a roadmap observation for the UI visuals revamp

After the fixes, lint, `astro check`, `npm test` (17 files, 173 tests) and `npm run build` all pass.

Manual re-checks to run on the note page (`npm run dev`):
- The full-size popup shows "Loading image…" until the bytes arrive. A broken full-size URL shows the error message (F3).
- A thumbnail that is still broken after its one refresh shows "Image unavailable" (F6).
- With the `note_images` query failing, the note text still renders with the "Images couldn't be loaded" line (F1).
