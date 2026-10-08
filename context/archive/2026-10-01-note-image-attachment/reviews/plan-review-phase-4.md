<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Image Attachment (S-05) — Phase 4

- **Plan**: context/changes/note-image-attachment/plan.md (scope: Phase 4 — Note page display)
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-03
- **Verdict**: SOUND (all findings fixed in triage)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
3/3 paths ✓ (note page exists; `dialog.tsx` and `NoteImages.tsx` are new; `components.json` is new-york), symbols ✓ (`listNoteImages`/`toImageViews` from Phase 1), Progress 4.1–4.9 ↔ criteria ✓, brief↔plan ✓

## Findings

### F1 — Thumbnail refresh misses errors that fire before hydration

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 §2 (onError) and §3 (`client:visible`)
- **Detail**: The SSR'd `<img>` loads before React attaches handlers, and React doesn't replay an `error` event that fired before hydration. `client:visible` waits for the viewport while `loading="lazy"` fetches earlier, so an expired thumbnail in a long-open tab fails before hydration and is never refreshed. Manual check 4.8 (editing in devtools) runs after hydration and can't catch it. `client:visible` would also be new to the codebase; every existing island uses `client:load`.
- **Fix**: `client:load`, plus a mount effect that treats `img.complete && img.naturalWidth === 0` as an error (same refresh-once path); extend 4.8 with the pre-hydration case.
  - Strength: Covers errors before and after hydration; matches the island convention.
  - Tradeoff: Eager hydration of a tiny island.
  - Confidence: MED — long-standing React behaviour, not re-checked for 19.2.
  - Blind spot: bfcache restore path untested.
- **Decision**: FIXED

### F2 — Popup: stale-response race and no DialogTitle

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §2 (popup)
- **Detail**: A late GET for image A can show A inside B's dialog. Radix Dialog logs a console error when `DialogContent` has no `DialogTitle`.
- **Fix**: Tag the fetch with its image id and drop mismatched responses (or abort on close); render a `DialogTitle` with the alt text or fallback (`sr-only` is fine).
- **Decision**: FIXED

### F3 — Thumbnail display size and "image N" numbering undecided

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §2
- **Detail**: Two 512 px thumbnails don't fit side by side in the ~608 px card. The fallback's N could be `position + 1` or the display index (a lone image at position 1 would read "image 2").
- **Fix**: The width/height attributes set the aspect ratio only; use a 2-column grid with `h-auto w-full`; N = 1-based display index.
- **Decision**: FIXED
