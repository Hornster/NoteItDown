<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Image Attachment (S-05) — Phase 5

- **Plan**: context/changes/note-image-attachment/plan.md (scope: Phase 5 — HEIC fallback, `/licenses` and footer)
- **Mode**: Deep (claims verified inline, no sub-agent)
- **Date**: 2026-10-03
- **Verdict**: SOUND (all findings fixed in triage)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Paths ✓ (Layout.astro, middleware, roadmap :185, contract-surfaces "Routes"; licenses.astro / heic.ts / src/assets/licenses are new), heic-to@1.6.5 on npm (LGPL-3.0, libheif 1.23.5) ✓, Progress 5.1–5.11 ↔ criteria ✓, brief↔plan ✓

## Findings

### F1 — Footer appears as a white strip under every page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 5 §3 — Footer
- **Detail**: Every page wraps its content in its own `bg-cosmic min-h-screen` div (11 pages). `body` is `bg-background` and `.dark` is never set, so the body is white (global.css:12, :125). A footer after `<slot />` without its own background shows as a white band below the dark screen. The plan's "styled to work … without changing their layout" gives no concrete approach.
- **Fix**: Footer gets its own dark background matching the gradient end (`bg-[#0a0e1a]`), muted small text and padding; accept it sits below the fold; don't touch the pages' `min-h-screen`.
- **Decision**: FIXED

### F2 — The HEIC check loads the 777 KB decoder for every undecodable file

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 5 §1 — HEIC conversion (with Phase 3 §1 errors)
- **Detail**: `isHeic` is exported by `heic-to` itself, so "on UnsupportedImageError, run isHeic" downloads the whole decoder (3.19 MB raw / 777 KB gzipped, measured) for a corrupt .txt just to say "unsupported", contradicting 5.7. Phase 3 defines UnsupportedImageError as "not HEIC" and has HeicNotSupportedYetError, so it must already detect HEIC; Phase 5 removes that error without saying what compress.ts throws afterwards. No error path for `heicTo` itself failing (corrupt HEIC, unsupported variant, OOM on 48 MP).
- **Fix**: Tiny local `ftyp` brand sniff (heic/heix/heim/heis/hevc/hevx/mif1) in `src/lib/images/heic.ts` outside the lazy chunk; flow processImage → UnsupportedImageError → sniff matches → `import("heic-to")` → heicTo → processImage. compress.ts throws UnsupportedImageError for all decode failures; Phase 3's HeicNotSupportedYetError uses the same sniff. `heicTo` failure → UnsupportedImageError (OOM → BrowserImageError).
  - Strength: Decoder loads only for real HEIC; one error contract across phases; matches change.md "detect from bytes".
  - Tradeoff: ~15 lines of own sniffing; `mif1` also matches AVIF, which browsers decode natively.
  - Confidence: HIGH — isHeic location and chunk size verified in the tarball.
  - Blind spot: Full list of iPhone/Android HEIC brands not surveyed.
- **Decision**: FIXED

### F3 — Licence entry facts left for "during implementation" are already known

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 §1 and §2
- **Detail**: heic-to's LICENSE has no project copyright line (author "Hopper Gee" in package.json). The README build notes use libde265 1.0.16. The plan's `heicTo({ type, quality })` omits the required `blob`.
- **Fix**: Fill in heic-to © Hopper Gee (per package.json), libde265 1.0.16 LGPL-3.0 © struktur AG (confirm against upstream COPYING), and `heicTo({ blob, type: "image/jpeg", quality: 0.92 })`.
- **Decision**: FIXED

### F4 — No runnable check for "separate chunk", and HEIC orientation is untested

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 Success Criteria (5.2, 5.7)
- **Detail**: 5.2 says only "confirm in the build output". The decoder contains `de265_` symbols, so it can be grepped. HEIC rotation lives in irot/imir boxes, not EXIF, and no check covers a portrait HEIC.
- **Fix**: 5.2 → `npm run build && test $(grep -rl de265_ dist/client | wc -l) -eq 1 && ! grep -rlq de265_ dist/server`; 5.7 → add "a portrait iPhone HEIC displays upright".
- **Decision**: FIXED
