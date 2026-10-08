<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Image Attachment (S-05) — Phase 2

- **Plan**: context/changes/note-image-attachment/plan.md (scope: Phase 2 — Image API and note-delete cleanup)
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-03
- **Verdict**: SOUND (1 warning, fixed)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

6/6 paths ✓ (`[noteId].ts`, `notes/` dir, `src/lib/api.ts`, `src/lib/utils.ts`, `src/lib/services/notes.ts`, `docs/reference/contract-surfaces.md`), 4/4 symbols ✓ (`jsonError`, `isUuid`, `deleteNote`, whose only route caller is `[noteId].ts` DELETE), brief↔plan ✓, Progress↔Phase 2 ✓ (2.1–2.8).

The note-delete cleanup is sound. The row is deleted first, then the folder. Because the SELECT and DELETE policies only check folder 1 = uid, `list` and `remove` still work after the note row is gone. The rest of the DELETE route stays the same.

## Findings

### F1 — Storage and database failures have no error path in 4 of 5 routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1, §2 (and the Phase 1 §5 service contracts)
- **Detail**: Only `commitImage` had an `unexpected` reason. `prepareUpload`, `updateImageAltText` and `deleteImage` could only report a miss, and `getImageUrls` returned `| null`. When signing failed, the route would either throw (Astro sends an HTML 500) or return a misleading 404, and Phase 4's thumbnail refresh would then report the image as gone.
- **Fix**: Add `unexpected` to all four service results. Map it to a logged 500 JSON response with `MESSAGES.GENERIC_IMAGE_ERROR` in every route.
- **Decision**: FIXED

### F2 — The route-collision risk is already settled by existing code

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 §2 routing note; plan-brief Phase 2 key risk
- **Detail**: `src/pages/api/campaigns/[campaignId]/notes.ts` already works next to the `notes/[noteId].ts` directory. `images.ts` next to `images/` uses the same layout.
- **Fix**: Replace the confirm-or-rename note with a reference to that precedent, and update the brief's key risk.
- **Decision**: FIXED

### F3 — Image item services ignore the campaignId in the URL

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §2 → Phase 1 §5 `getImageUrls`, `deleteImage`, `updateImageAltText`
- **Detail**: The services filtered on `(noteId, imageId)` only, so a request whose URL named another campaign the caller owns would still succeed. RLS keeps other accounts out, but this breaks the "URL is authoritative" rule in contract-surfaces "Campaign resolution", which `deleteNote` follows.
- **Fix**: Pass `campaignId` and filter on `campaign_id`, `note_id` and `id`.
- **Decision**: FIXED

### F4 — Commit and PATCH return signed views that nobody reads, and the 400 step is left implicit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 commit / PATCH
- **Detail**: Returning `NoteImageView` cost one `createSignedUrls` call per request, but Phase 3's `uploadPendingImage` returns void and the edit save navigates away. `updateImageAltText` never said it returns the row. Unlike prepare, the commit and PATCH contracts left out the JSON/zod 400 step.
- **Fix**: Commit returns `CommitImageResponse { id, position }` and PATCH returns `UpdateImageResponse { id, alt_text }`, with no signing. Spell out the JSON/zod 400 step in both.
- **Decision**: FIXED
