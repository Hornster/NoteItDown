<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Image Attachment (S-05) — Phase 3

- **Plan**: context/changes/note-image-attachment/plan.md (scope: Phase 3 — Browser pipeline and form attach)
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-03
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓ (`NoteForm.tsx`, `useSaveNote.ts`, `edit.astro`, `new.astro`, `relation-notice.ts`). 4/4 symbols ✓: `useSaveNote`'s only caller is `NoteForm`, whose only callers are `new.astro` and `edit.astro`; `update_note` returns `rechecked = false` for image-only edits (`20260930120000_note_edit_delete_functions.sql:142`); the reference pipeline clamps with `Math.max(1, …)` and uses `minDimension` 640. Build output dir ✗: it is `dist/server`, not `dist/_worker.js`. brief↔plan ✓. Progress↔Phase 3 ✓ (3.1–3.13).

## Findings

### F1 — The Worker-bundle check always passes, and when fixed it fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 Automated Verification (3.4)
- **Detail**: The build writes to `dist/server/`. There is no `dist/_worker.js`, so `! grep … 2>/dev/null` sees grep exit with 2, inverts it, and passes whatever the code does. If the check points at `dist/server`, it will probably fail even with correct lazy loading. NoteForm is server-rendered (`client:load`), so the dynamically imported compression module is still emitted as a server chunk and uploaded with the Worker. In Phase 5, heic-to (~768 KB gzipped) would be added to the Worker upload the same way.
- **Fix A ⭐ Recommended**: Guard each lazy import with `if (import.meta.env.SSR) return;` so Rollup drops the branch and its chunk. Check with `test -d dist/server && ! grep -rl convertToBlob dist/server`.
  - Strength: The check really guards the Worker, and Phase 5 gets the same protection.
  - Tradeoff: One guard line per lazy import.
  - Confidence: MED — standard Vite dead-code removal, not built here to confirm.
  - Blind spot: The adapter could still pull the chunk in some other way. The fixed grep would catch that.
- **Fix B**: Check only the client output: compression code sits in its own `dist/client/_astro` chunk, not in the NoteForm island chunk. Accept the unused server chunk.
  - Strength: No code change.
  - Tradeoff: The Worker carries dead code, and with heic-to that becomes a real size problem.
  - Confidence: HIGH
  - Blind spot: The Worker size limit with heic-to is not measured.
- **Decision**: FIXED (Fix A)

### F2 — The save order and failure collection have no automated tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §3 (`upload.ts`, `useSaveNote`) / Success Criteria
- **Detail**: Only manual checks 3.11 and 3.12 cover the edit order (PATCH → DELETE → alt PATCH → upload) and the rule "a failed image never loses the note". The logic sits inside a hook with direct fetch calls, so the node-environment Vitest suite can't test it.
- **Fix**: Add a pure `applyImageChanges(mode, noteId, changes, api) → Failure[]` in `upload.ts`, with the API calls passed in. Add `src/lib/images/upload.test.ts` (deletes run before uploads, one failure doesn't stop the rest, labels) and include it in 3.1. `useSaveNote` then only handles navigation.
  - Strength: The guarantee is checked on every push, and the hook gets smaller.
  - Tradeoff: One more small module and test file.
  - Confidence: HIGH — the same split as `relation-notice.ts` + `RelationChangeNotice`.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — An image failure during edit drops the relation-change notice

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §3 `useSaveNote`, "any failure" branch
- **Detail**: The plan writes the relation notice only when every step succeeds. If the PATCH changed relations and an image then fails, the user is never told about the relation changes.
- **Fix**: In edit mode, write the relation notice right after the PATCH returns 200, before the image steps. It shows on the next note-page view, which is matched by `noteId`.
- **Decision**: FIXED

### F4 — Pipeline edge cases left to whatever the code does

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 `compress.ts`
- **Detail**: (a) There is no rule keeping each side at least 1 px, so a 16383×1 image gets a 512×0 thumbnail. (b) The blank-canvas rule "and the source wasn't" can't be decided, and the JPEG path's white fill means a blank canvas isn't transparent.
- **Fix**: Clamp both dimension functions to ≥ 1 px and add a 16383×1 thumbnail test. Run the blank-canvas guard on the WebP path only: if every sampled pixel has alpha 0, raise `BrowserImageError`.
- **Decision**: FIXED

### F5 — Missing or delayed details

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2, §4
- **Detail**: (a) §4 lists `new.astro` as a file to change, but describes no change. (b) The `noteitdown:image-failure` key and the edit-page `images` prop arrive in Phase 3, but contract-surfaces only records them in Phase 4. (c) The plan doesn't say whether picks with status `error` count toward the 2-image cap.
- **Fix**: Remove `new.astro` from §4, move those contract-surfaces entries into Phase 3, and say that `error` picks don't count toward the cap.
- **Decision**: FIXED
