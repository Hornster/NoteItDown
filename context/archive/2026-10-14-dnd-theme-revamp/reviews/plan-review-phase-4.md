<!-- PLAN-REVIEW-REPORT -->
# Plan Review: D&D Theme Revamp — Phase 4 (Pages and guard)

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 4 only
- **Mode**: Deep (inline verification, no sub-agent: all 12 pages, Welcome.astro, global.css, vitest config and contract-surfaces.md checked directly)
- **Date**: 2026-10-14
- **Verdict**: SOUND after triage (all 4 findings fixed)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 13/13 paths ✓ (12 pages under `src/pages/` + `Welcome.astro`; `global.css`, `compress.ts`, `contract-surfaces.md` exist), 4/4 symbols ✓ (`@utility bg-cosmic` at global.css:117 used by 11 pages + Welcome; `compress.ts:138` `"#fff"` is the only literal the allowlist needs once Phase 3 lands; unit project `include: ["src/**/*.test.ts"]` with `environment: "node"`, so `src/styles/theme-guard.test.ts` runs in `test:unit` and can use `fs`; no e2e/http test selects by color class), brief↔plan ✓. Guard false-positive probe: no `#hex`/`rgb(` literal or palette class in any `src/**/*.ts` file outside the files Phases 3–4 migrate. Contract surfaces: no existing H2 surface touched; the plan adds a new "Theme tokens" section (bullet format matches the file).

## Findings

### F1 — Page classes with no mapping rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1 — Pages (mechanical rules)
- **Detail**: Several page patterns fall outside every listed rule, so the implementer has to guess: (1) the three blurred glow orbs in `Welcome.astro:7-9` (`bg-purple-500/20 blur-[120px]`, `bg-blue-500/15`, `bg-indigo-400/10`) — the rules only say "remove the inline `style` star field", so recoloring them to `bg-primary/20` would pass the guard and criterion 4.6 while contradicting "removed, not recolored"; (2) outlined secondary `<a>` buttons `border border-white/20 … text-white/90 hover:bg-white/10` (`campaigns/[campaignId]/index.astro:54`, `Welcome.astro:37`); (3) dashed empty-state boxes `border-dashed border-white/20 bg-white/5` inside the card (`index.astro:74`, `map.astro:50`) — the sub-panel rule names `border-white/10` only. Also, "Note-type pills in `index.astro`" means `campaigns/[campaignId]/index.astro:92`; `src/pages/index.astro` only renders `<Welcome />`.
- **Fix**: Add three rules to Phase 4 §1: glow orbs in Welcome.astro are deleted with the star field; outlined `<a>` buttons → `buttonVariants({ variant: "outline" })` + existing geometry; dashed empty-state boxes → nested-panel rule keeping `border-dashed`. Name the pill file as `campaigns/[campaignId]/index.astro`.
- **Decision**: FIXED (Fix in plan: dashed-box and outlined-link rules added, glow orbs deleted with the star field, pill files named with lines)

### F2 — Guard has no self-test; a broken regex stays green forever

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §3 — Hard-coded color guard; Manual 4.7
- **Detail**: The guard is "green from the start" and proven only once by a manual injection (4.7). A later edit to the regex (e.g. a missed escape, or a refactor of the file walk that returns zero files) makes it match nothing, and every run stays green with no signal. The same happens if the glob silently stops matching `.astro` files. A scanner whose only failure mode is "always passes" needs a positive control in the suite itself.
- **Fix**: Export the matcher from the test file's scope and add cases in `theme-guard.test.ts`: it flags `hover:bg-purple-500`, `text-white/60`, `bg-[#0a0e1a]`, `rgba(0,0,0,.5)`, and does not flag `text-primary`, `bg-background`, `border-input`; plus assert the walk found > 0 `.astro` and > 0 `.tsx` files. Keep 4.7 as the one-time end-to-end proof.
- **Decision**: FIXED (Fix in plan: matcher self-test cases and a >0 .astro/.tsx file-count assertion added to §3)

### F3 — 4.9 compares against "before" with no "after" set yet

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 Manual Verification 4.9
- **Detail**: "New-note and edit-note pages match the structure and placement of their 'before' screenshots" — the "after" set is only produced in Phase 5 §4, so Phase 4 has nothing like-for-like to compare against besides eyeballing the live page.
- **Fix**: Add to 4.9: `npm run build && SHOT_LABEL=phase4 npm run test:screenshots`, compare `note-new`/`note-edit` against `before/`.
- **Decision**: FIXED (Fix in plan: 4.9 runs `SHOT_LABEL=phase4 npm run test:screenshots`; Progress title updated)

### F4 — "Images couldn't be loaded" errors mapped to gold

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 §1 rule "`amber-200` → `text-primary`" (also Phase 3 §3 NoteForm)
- **Detail**: The only `amber-200` on a page is `[noteId].astro:113` `MESSAGES.NOTE_IMAGES_LOAD_FAILED` ("Images couldn't be loaded right now…"), and NoteForm's `IMAGES_LOAD_FAILED` gets the same mapping in Phase 3. Both are failures, yet the Desired End State says errors use light red + alert icon and contract-surfaces will reserve `--primary` for primary/links/S-07 marking. Gold here blurs that meaning.
- **Fix**: Map both image-load-failure messages to `text-destructive-text` (optionally with an `aria-hidden` `CircleAlert`); keep `amber-200` → `text-primary` only for non-error highlights.
- **Decision**: FIXED (Fix in plan: NOTE_IMAGES_LOAD_FAILED in Phase 4 and IMAGES_LOAD_FAILED in Phase 3 → text-destructive-text)
