<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Image Attachment (S-05)

- **Plan**: context/changes/note-image-attachment/plan.md
- **Scope**: Phase 5 of 5
- **Reviewed phases**: 5
- **Date**: 2026-10-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run 2026-10-07 at HEAD b7a83db)

| Check | Result |
|-------|--------|
| `grep '"heic-to": "1.6.5"' package.json` | PASS |
| `npm run build` + `de265_` in exactly 1 client file (`heic-to.DV8h2UI7.js`, 3.19 MB), none in `dist/server` | PASS |
| `npm run lint` | PASS |
| `npx astro check` | PASS (0 errors, 0 warnings, 1 hint) |
| `npm test` | PASS (17 files, 173 tests) |
| `npm run preview` + `npm run smoke` | PASS (all steps); `/licenses` signed out → 200 |

Manual 5.7–5.11 are ticked; 5.8 has its own commit (07678cb). Not re-verified here.

## Findings

### F1 — RangeError → BrowserImageError mapping never fires

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/images/heic.ts:33-35
- **Detail**: heic-to decodes in a Web Worker. The worker posts `error: e.toString()` (`node_modules/heic-to/src/worker.js`), and `heicTo` rejects with that string (`src/index.js:48`) or with the string "Can't convert canvas to blob." (`:96`). It never rejects with an `Error` instance, so `error instanceof RangeError` is always false. Out-of-memory and canvas failures on a valid but very large HEIC therefore show "unsupported or corrupt" instead of the browser-failure message. The plan's contract and the JSDoc both promise the memory → `BrowserImageError` mapping.
- **Fix**: Classify the rejection by its string form (`String(error)` matching `/RangeError|memory|canvas to blob/i` → `BrowserImageError`, everything else → `UnsupportedImageError`). Add a unit test that mocks `heic-to` with string rejections.
- **Decision**: FIXED — rejection classified by `String(error)` (`BROWSER_FAILURE_PATTERN`); `convertHeicToJpeg` unit tests added with string rejections and a failed chunk load

### F2 — One 30 s timeout covers the whole HEIC path, and the queue moves on after a timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useImagePicks.ts:106-113 (`IMAGE_PROCESSING_TIMEOUT_MS = 30_000`, src/lib/images/limits.ts:31)
- **Detail**: The timeout from the earlier review fixes wraps `processImage` → the `heic-to` chunk download (~777 KB gzipped) → WASM decode → JPEG encode → a second `processImage`. On a slow connection or a slow device with a 48 MP HEIC this can exceed 30 s, and the user gets a timeout for a file that would have worked. The work can't be cancelled, so after a timeout the queue starts the next pick while the old decode is still running. That is two large decodes in memory at once, which the plan's "one at a time" rule (~192 MB RGBA per 48 MP) was meant to prevent. Manual check 5.8 passed on the developer's machine.
- **Fix A ⭐ Recommended**: Keep the next pick waiting until the timed-out work has actually finished (chain the queue on `work`, not on the timeout race), and start the HEIC budget only after the chunk has loaded (or give the HEIC branch its own, larger budget).
  - Strength: Restores the one-decode-at-a-time memory guarantee, and slow networks no longer count against decode time.
  - Tradeoff: A hung decode blocks later picks in that form until reload, although they still show "Processing…".
  - Confidence: MED — small change in one hook, but the timing behaviour needs a manual check.
  - Blind spot: A real slow-device HEIC run hasn't been measured.
- **Fix B**: Accept as risk and document it in contract-surfaces next to the timeout constant.
  - Strength: No code change; 5.8 passed in practice.
  - Tradeoff: Mobile and slow-network users may hit false timeouts and double memory use.
  - Confidence: MED — depends on real-world device mix (mobile is parked in the roadmap).
  - Blind spot: Behaviour on low-memory devices.
- **Decision**: ACCEPTED + FIXED (partly) — risk accepted and documented in contract-surfaces (Limits); `IMAGE_PROCESSING_TIMEOUT_MS` raised from 30000 to 40000 at the user's request

### F3 — heic-to's singleton worker is never released and can't recover after a crash

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/images/heic.ts:27 (library behaviour in node_modules/heic-to/src/index.js)
- **Detail**: heic-to keeps one module-level Worker for the lifetime of the tab. It holds a WASM heap that grows to fit the largest image decoded, and there's no API to dispose of it. If the worker crashes (for example out of memory), the dead worker is reused, so later HEIC picks fail until the page is reloaded.
- **Fix**: Accept it as library behaviour. Optionally add a sentence about it under the HEIC entry in contract-surfaces.
- **Decision**: ACCEPTED — library behaviour documented in contract-surfaces (HEIC fallback bullet under Limits)

### F4 — Unplanned extras: HeicDecoderLoadError and an npm-audit lockfile bump

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/images/errors.ts:27-32, src/lib/messages.ts:13-14, package-lock.json (http-cache-semantics 4.2.0 → 4.3.0)
- **Detail**: Both are benign. `HeicDecoderLoadError` keeps a failed chunk download from showing as "unsupported or corrupt", which is a sensible extension of the plan's error contract. The lockfile bump is unrelated to S-05.
- **Fix**: Keep both. The commit message already records them; optionally add one line about `HeicDecoderLoadError` to the plan's Phase 5 contract.
- **Decision**: FIXED — both extras kept; `HeicDecoderLoadError` added to the plan's Phase 5 contract as an addendum

### F5 — Small documentation loose ends

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/licenses.astro (libde265 entry), context/changes/note-image-attachment/change.md ("libheif 1.22.x"), context/foundation/roadmap.md:138,160
- **Detail**:
  - The plan asked for the libde265 copyright line to be confirmed against upstream `COPYING`. Nothing in the repo shows that this was done. The versions on the page do match the heic-to README: 1.6.5 → libheif 1.23.5 and LIBDE265_VERSION 1.0.16.
  - `change.md` still says libheif 1.22.x.
  - The roadmap's S-05 heading and table title still say "attach an image". The plan only required updating the Outcome and the At-a-glance cell, so this is not drift.
- **Fix**: Check the libde265 `COPYING` file upstream, correct "1.22.x" in change.md to 1.23.5, and optionally retitle S-05 to "images".
- **Decision**: FIXED — (a) the user checked libde265 `COPYING.md` upstream: LGPL-3.0, matching /licenses; (b) change.md now says libheif 1.23.5; (c) the roadmap S-05 heading and At-a-glance title now say "up to 2 images"

## Triage summary (2026-10-07)

| Outcome | Findings |
|---------|----------|
| Fixed | F1, F4, F5 |
| Accepted (documented) + partly fixed | F2 (timeout 30 s → 40 s) |
| Accepted (documented) | F3 |
