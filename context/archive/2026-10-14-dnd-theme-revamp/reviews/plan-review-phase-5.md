<!-- PLAN-REVIEW-REPORT -->
# Plan Review: D&D Theme Revamp — Phase 5 (Fonts and final evidence)

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 5 only
- **Mode**: Deep (checked inline without a sub-agent: installed Astro 7.3.2 Fonts API source, `Font.astro` preload filter, a Tailwind 4 compile probe, `licenses.astro`, `Layout.astro`, heading weights across `src/`)
- **Date**: 2026-10-14
- **Verdict**: SOUND after triage (all 4 findings fixed)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding
Grounding: 4/4 paths ✓ (`astro.config.mjs`, `src/layouts/Layout.astro`, `src/styles/global.css`, `src/pages/licenses.astro`; `src/assets/licenses/` holds the LGPL/GPL texts, so `ofl-1.1.txt` fits next to them). 6/6 symbols ✓: top-level `fonts` in the Astro 7.3.2 config schema (`core/config/schemas/base.js:272`), `fontProviders.google()`, `weights`/`styles`/`subsets`/`fallbacks` in `FontFamilySchema`, `<Font cssVariable preload>` (`astro/components/Font.astro`), `data-slot="dialog-title"`/`"alert-dialog-title"` (`dialog.tsx:108`, `alert-dialog.tsx:84`). Tailwind probe: `@theme inline { --font-sans: var(--font-lora); --font-heading: var(--font-cinzel) }` emits `--default-font-family`, a `font-heading` utility, and `--font-heading` when base CSS references it. brief↔plan ✓. Contract surfaces: Phase 5 touches no registered surface.

## Findings

### F1 — Font weights/styles don't match usage; preload pulls every Lora face

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 5 §1 Font registration, §2 Font loading; Performance Considerations
- **Detail**: (1) `<Font cssVariable="--font-lora" preload />` with `preload={true}` returns every face unfiltered (`filter-preloads.js`: `if (preload === true) return data`). That is up to 3 weights × 2 styles × 2 subsets = 12 preload links. Performance Considerations says "only Lora is preloaded", which reads as cheap. (2) Lora `italic` is unused: no `italic`, `<em>` or `<i>` anywhere in `src/`. (3) Cinzel loads `[400, 700]`, but every heading is `font-bold` (700) or `font-semibold` (600, on 5 h2/h3 and the dialog titles). 400 is never used, and 600 falls back to 700.
- **Fix**: Lora `weights: [400, 600, 700]`, drop `styles` (normal only). Cinzel `weights: [600, 700]`. Preload with a filter: `<Font cssVariable="--font-lora" preload={[{ weight: "400", style: "normal", subset: "latin" }]} />`. Update Performance Considerations to match.
- **Decision**: FIXED (Fix in plan: Cinzel [600,700], Lora [400,600,700] normal only, preload filtered to Lora 400 normal latin, Performance Considerations updated)

### F2 — Two automated criteria aren't runnable commands

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 Success Criteria 5.4 and 5.6
- **Detail**: 5.4 says "the build output contains `.woff2` files" without a command or a directory. The Cloudflare adapter writes `dist/client` and `dist/server`, and Astro copies font files under the client `_astro/` tree. 5.6 lists only the `ls` check. The command that produces the shots (`npm run build && SHOT_LABEL=after npm run test:screenshots`) appears only in §4 Contract.
- **Fix**: 5.4 → `npm run build && find dist/client -name '*.woff2' | grep -c .` ≥ 1. 5.6 → `SHOT_LABEL=after npm run test:screenshots && ls .screenshots/theme/after | wc -l` = 17.
- **Decision**: FIXED (Fix in plan: 5.4 uses find dist/client for .woff2, 5.6 includes the SHOT_LABEL=after run)

### F3 — Licenses page shape for fonts is left to guesswork

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 §3 Font licenses
- **Detail**: The `notices` array in `licenses.astro` renders `{n.version}`, and its intro paragraph is specific to HEIC ("converted in your browser with the libraries below…"). The plan says to "add Cinzel and Lora entries (name, license, copyright, source)" plus "a one-sentence intro for fonts". Font entries have no version, and adding them to `notices` makes the HEIC intro wrong. The implementer has to choose between an optional `version` and a separate section.
- **Fix**: Use a separate `fontNotices` array (`name`, `license`, `copyright`, `source`, no version) under its own `<h2>` with the one-sentence font intro. Render it with the same card markup, then add the OFL 1.1 `<pre>` block after the GPL block.
- **Decision**: FIXED (Fix in plan: separate fontNotices array under its own h2; OFL pre block after GPL)

### F4 — Builds now fetch from Google Fonts at build time

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 5 §1; CI (`ci`, `local-stack`, `deploy` jobs)
- **Detail**: With `fontProviders.google()`, `astro build` downloads the font files from Google, and the result is cached in a local `fonts/` cache dir that CI does not keep. Every CI build and every deploy now depends on Google Fonts being reachable. Upstream font updates can also change file hashes and metrics between builds, which would make before/after screenshot runs on different days less comparable. The plan's stop-and-report note covers adapter failure, not this.
- **Fix A ⭐ Recommended**: Accept, and add one line to the plan's Open Risks / Phase 5 note.
  - Strength: Zero extra work. Google Fonts outages are rare, and a failed CI build is retryable with no user impact.
  - Tradeoff: An occasional red CI run or delayed deploy caused by something outside the repo.
  - Confidence: HIGH — the failure is loud (build error), not silent.
  - Blind spot: How Astro behaves when the download fails was not checked (error vs. fallback-only CSS).
- **Fix B**: Commit the woff2 files and use `fontProviders.local()`.
  - Strength: Hermetic, reproducible builds. The OFL files sit in the repo next to the fonts.
  - Tradeoff: Subset/weight files have to be fetched and committed by hand (~8 files), and updating them is manual.
  - Confidence: MED — the local provider's `variants` config shape in 7.3.2 was not verified.
  - Blind spot: Repo size and whether latin-ext needs separate files per weight.
- **Decision**: FIXED (Fix A: accepted risk documented in the Phase 5 implementation note and plan-brief Open Risks)
