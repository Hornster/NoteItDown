<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: D&D Theme Revamp Implementation Plan

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 4 of 5
- **Reviewed phases**: 4
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

Reviewed commit 935ab1f (19 files). All 11 listed pages and `Welcome.astro` were changed as described. `src/pages/index.astro` only renders `<Welcome/>`, so it needed no change. `bg-cosmic` is removed. The guard, the CLAUDE.md bullet, the contract-surfaces "Theme tokens" section and the lessons.md entry are all in place. Geometry classes are preserved, with no restructuring.

Automated checks were run on the current working tree on 2026-10-15, and all passed:

- `npm run lint`
- `npm run test:unit` (147/147)
- `npx astro check` (0 errors)
- `npm run build`
- `npm run test:e2e` (6/6, local Supabase)
- The `bg-cosmic|backdrop-blur|bg-clip-text` grep returned nothing.

The manual items 4.7–4.10 are ticked, and `.screenshots/theme/phase4/` holds all 17 PNGs as evidence for 4.9. The subagents also suggested a finding about prettier class order. It was dismissed: `prettier --check` passes on all of these files.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Guard misses directional borders, `accent-*`, Tailwind 4.3 palettes and `oklch()`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/styles/theme-guard.test.ts:13-23
- **Detail**: `PALETTE_CLASS` needs the palette name to follow the utility prefix directly. Running the regex in node showed that it does not flag these:
  - directional borders: `border-t-white/10`, `border-b-red-500`, `border-x-*`, `divide-y-*`
  - `accent-purple-500`, `inset-shadow-black`, `drop-shadow-*`
  - the palettes `mauve`, `olive`, `mist` and `taupe`, which the installed Tailwind 4.3.3 ships but `PALETTE` does not list

  `ARBITRARY_COLOR` and `COLOR_LITERAL` also miss `oklch(`, `oklab(` and `color-mix(`. shadcn's stock CSS writes its tokens in oklch. The plan asked for the 22 classic palette names and the prefixes it listed, so this is not drift. It is still the guard's job to stop colors from coming back, and it has these holes.
- **Fix**: Extend the regexes and add the new cases to the self-test.
  - Change: add `border-[trblxyse]|divide-[xy]|accent|inset-shadow|inset-ring|drop-shadow|text-shadow` to `UTILITIES` (longer alternatives first) and `mauve|olive|mist|taupe` to `PALETTE`. Add `oklch|oklab|lab|lch|color-mix` to the literal and arbitrary-class rules.
  - Strength: closes the gaps confirmed by running the regex, and keeps the design of a single test file.
  - Tradeoff: a wider pattern can raise false positives. The self-test negatives, plus a run over today's `src/`, which must stay at 0 violations, limit that.
  - Confidence: HIGH — every gap was reproduced against the actual regex.
  - Blind spot: future Tailwind versions can add palettes again. A lower-maintenance option is to read the palette names from `node_modules/tailwindcss/theme.css`, at the cost of coupling the test to the package layout.
- **Decision**: FIXED — UTILITIES, PALETTE and COLOR_FN were extended. The self-test gained 7 positive and 4 negative cases. The guard passes on `src/` with 0 violations.

### F2 — `--reading` token added without a plan record

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/styles/global.css:31, src/pages/campaigns/[campaignId]/notes/[noteId].astro:101
- **Detail**: The plan prescribes the nested-panel rule (`border border-input bg-background`) for the note body. The implementation adds a new token, `--reading: #322f2b`, with two contrast pairs (`theme-contrast.test.ts:51-52`), and uses `bg-reading` once. The token is documented in contract-surfaces.md and in the commit message, but not in plan.md (not in the token table, which marks deviations at :145/:149, and not in the Notes) or in change.md. It probably came out of manual check 4.10 (readability).
  - The input-on-reading ratio is 3.14:1, just above the 3:1 floor.
  - `--reading` is 1.08:1 against `--card`, so "slightly lighter than --background" in contract-surfaces.md undersells that it is almost a card tone.
- **Fix**: Add the token to the plan's token table, marked "new (Phase 4, readability, 4.10)", and reword the contract-surfaces line to say "close to the --card tone; separated by border-input".
- **Decision**: FIXED — a `--reading` row was added to the plan.md token table with contrast ratios 9.79:1 and 3.14:1, and the contract-surfaces.md line was reworded.

### F3 — Inline auth links are distinguished by hue only

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/signin.astro:18, src/pages/auth/signup.astro:18
- **Detail**: "Sign up" / "Sign in" are links inside a `text-muted-foreground` sentence, styled `text-primary hover:underline`. The luminance contrast between link and surrounding text is about 1.07:1, and the underline appears only on hover. That fails WCAG 1.4.1 (use of color). This predates the phase (it was `text-purple-300 hover:underline`), but Phase 4 touched these lines and the gold-on-muted pair makes it worse. Standalone links (Topbar, back links) are not affected.
- **Fix**: Change both links to `text-primary underline underline-offset-4 hover:text-primary/80`.
- **Decision**: FIXED — both links are now always underlined.

### F4 — Guard false positives on hex-like anchors and `rgb(var(...))`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/styles/theme-guard.test.ts:23
- **Detail**: `COLOR_LITERAL` flags `href="#add"`, `#feed`, `url(#bad)` and `// Fixes #123`. Any 3, 4, 6 or 8 character hex-like id trips it, and so does `\b(?:rgba?|hsla?)\(` with a token argument such as `rgb(var(--x))`. The only way out is to allowlist the whole file. Nothing in `src/` trips it today. The self-test only covers `#main`.
- **Fix**: Exclude `var(` arguments with `\((?!\s*var\()`. For `#` literals, ignore matches preceded by `href="`/`url(`, and add `href="#add"` to the self-test negatives.
- **Decision**: FIXED — `href="`/`url(` lookbehinds and a `(?!\s*var\()` lookahead were added. `href="#add"`, `url(#bad)` and `rgb(var(--x))` are now self-test negatives. Comment `#123` refs remain a known false positive.

### F5 — `buttonVariants` on `<a>` carries redundant and conflicting overrides

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/campaigns/[campaignId]/index.astro:~55-80, src/pages/campaigns/[campaignId]/map.astro:~56
- **Detail**: Kept geometry such as `px-4 py-2 text-sm rounded-lg inline-block` sits on top of `buttonVariants()`. `px-4 py-2` repeats what the default size already sets, and `inline-block` overrides the primitive's `inline-flex items-center justify-center gap-2`. `Welcome.astro` uses `h-auto px-6 py-3 text-base` instead. This follows the plan's "keep geometry at call sites" rule, so it is not drift. It does mean that a later restyle of the button primitive will not fully reach these links.
- **Fix**: Skip for now. Revisit in the mobile/layout milestone, where geometry is in scope; drop `inline-block` and the duplicate padding there, or add a size variant.
- **Decision**: DEFERRED — queued in `follow-ups/review-fixes.md` for the mobile/layout milestone.

### F6 — Secondary descriptive text uses `text-foreground` on two pages

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/confirm-email.astro:28, src/pages/licenses.astro:68,86
- **Detail**: Descriptive or secondary lines use `text-muted-foreground` elsewhere (auth helper text, map hint, empty states, licenses.astro:56/79). These lines use `text-foreground`. This matches the plan's mechanical rule (source opacity ≥ 80% → foreground), so the difference comes from the old classes, not a new decision.
- **Fix**: Accept as is (the plan rule was followed), or switch these to `text-muted-foreground` for consistency.
- **Decision**: FIXED — all three lines switched to `text-muted-foreground`.

## Triage summary

- Fixed: F1, F2, F3, F4, F6
- Deferred: F5 (`follow-ups/review-fixes.md`)

Re-verified after the fixes on 2026-10-15. All passed:

- `npm run lint`
- `npm run test:unit` (147/147)
- `npm run build`
- `npm run test:e2e` (6/6)
- `prettier --check` on the touched files
