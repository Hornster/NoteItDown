<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: D&D Theme Revamp Implementation Plan

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 2 of 5
- **Reviewed phases**: 2
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

- Commit under review: `e23af22` (14 files, +258/−106). Later phases touched only `global.css` (bg-cosmic removal, fonts, `--reading`), `theme-contrast.test.ts` (2 added `reading` pairs) and added `theme-guard.test.ts`. No phase-2 primitive changed after `e23af22`.
- Plan drift, checked one item at a time against the diff: MATCH on all of them. These are the token table (every hex value), the 4 new `@theme inline` entries, `.dark` deleted and `@custom-variant dark` kept, the React Flow overrides (all 8 `--xy-*` names exist as `var(--xy-<name>, …)` in `@xyflow/react/dist/style.css`), the contrast test (all 17 planned pairs plus the `.dark` assertion), button (no `dark:`, full-strength ring, `destructive`, `destructive-text`, `outline`, invalid state), dialog and alert-dialog (overlay, content, close chip), textarea, label, LibBadge deleted, and Input, Select, Card, Badge and Alert as specified (no geometry defaults on Card/Select, no default role on Alert, `div` slots, flex layout). No EXTRA changes.
- `npm run lint`: exit 0.
- `npm run test:unit`: 16 files, 146 tests passed.
- `npx astro check`: 0 errors, 0 warnings, 1 hint.
- `npm run build`: complete.
- `npm run test:e2e`: 6/6 passed, including the Cancel-focus assertion.
- `grep -rn "dark:" src` and `grep -n "^\.dark" src/styles/global.css`: both empty.
- No dev/preview server was running before the tests (lessons.md).
- Checks ran at HEAD (all phases in place), not on `e23af22` alone.

## Findings

### F1 — Base focus outline stays at 50% gold (below 3:1)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css:108
- **Detail**: The base layer still has `* { @apply border-border outline-ring/50; }` ("Base layer unchanged" in the plan). Gold at 50% measures 2.80:1 on the background and 2.62:1 on card. That is the same failure plan-review phase 2 fixed for `button.tsx`, but it was not carried over to the native outline. Every element without its own ring uses that outline for keyboard focus: plain text links (Topbar nav, footer links, `text-primary` links on pages, notice relation links). So their focus indicator falls below the WCAG 1.4.11 threshold of 3:1. Buttons, inputs, selects and textareas are not affected, because they set `outline-none` + `ring-ring`.
- **Fix**: Change the base rule to `outline-ring` (full gold, 6.01:1 on card, 7.37:1 on background).
- **Decision**: FIXED (`outline-ring/50` → `outline-ring`)

### F2 — Contrast test does not pin gold text on card

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/styles/theme-contrast.test.ts:32-52
- **Detail**: `primary` is asserted only on `background`. Gold links and nav are also rendered on card surfaces (the Topbar is a card, and there are links inside page cards and in the success notice). The value passes today (6.01:1), but a future `--card` or `--primary` edit could break it without failing any test.
- **Fix**: Add `["primary", "card", 4.5]` to `PAIRS`.
- **Decision**: FIXED (pair added)

### F3 — Dialog close chip uses `focus:` instead of `focus-visible:`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/dialog.tsx:60
- **Detail**: Phase 2 rewrote the close-button classes but kept shadcn's `focus:ring-ring focus:ring-2 focus:ring-offset-2`. Button, Input, Select and Textarea all use `focus-visible:`. In the image popup the close chip is the only tabbable element, so Radix autofocuses it on open and the gold ring appears even when the popup is opened by mouse. This is a cosmetic inconsistency, not an accessibility failure.
- **Fix**: Switch the three `focus:` ring classes on the close chip to `focus-visible:`.
- **Decision**: FIXED (ring classes on `focus-visible:`; `focus:outline-hidden` kept so mouse focus shows neither ring nor outline)

### F4 — Manual 2.8 (Firefox) ticked without recorded evidence

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dnd-theme-revamp/plan.md:536
- **Detail**: 2.8 says "Chromium and Firefox", but the screenshot project is Chromium only, and no note in the change folder records a Firefox check for Phase 2. Phase 5.10 repeats the same Firefox popup check, so the risk is low. A reader still cannot tell whether 2.8 was verified in Firefox or deferred to 5.10.
- **Fix**: Annotate 2.8 with how it was checked, or `(Firefox: deferred to 5.10)`, following the "waived criteria are annotated" lesson.
- **Decision**: SKIPPED
