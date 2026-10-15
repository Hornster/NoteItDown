<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: D&D Theme Revamp

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 5 of 5
- **Reviewed phases**: 5
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

Commit e319a8a changed 6 files, all listed in the plan: `astro.config.mjs`, `src/layouts/Layout.astro`, `src/styles/global.css`, `src/pages/licenses.astro`, `src/assets/licenses/ofl-1.1.txt` and `plan.md`. Nothing was changed outside the plan. One addition, `styles: ["normal"]`, puts the plan's "normal style only" rule into the config, so it matches the plan.

Automated checks were rerun on the working tree on 2026-10-15:

- `npm run lint`: passes (exit 0)
- `npm run test:unit`: passes, 147/147 tests in 16 files
- `npx astro check`: passes with 0 errors, 0 warnings and 1 hint
- `npm run build`: passes and emits 4 `.woff2` files (variable fonts: one file per family per subset). `--font-lora`, `--font-cinzel` and `--font-heading` appear in the built CSS.
- `npm run test:e2e`: passes, 6/6
- `SHOT_LABEL=after npm run test:screenshots`: passes, 17/17. The file names are identical to the `before/` set.
- `after/delete-dialog.png` shows Cinzel on the h1 and the dialog title and Lora on body text.

## Findings

### F1 — Manual 5.7–5.10 ticked with no recorded evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/dnd-theme-revamp/plan.md (Progress 5.7–5.10)
- **Detail**: All Phase 5 manual items are `[x]` with only the commit SHA. The plan requires 5.9 to note "any font-caused spacing shift … accepted or fixed", and 5.10 requires a Firefox check (FR-015). Neither the plan, change.md nor any review records an outcome. The screenshots confirm the fonts in Chromium (5.7, partly). They do not show diacritics (5.8) or anything in Firefox (5.10). Under the "Waived criteria are annotated, not ticked" lesson, a reader cannot tell what was verified and what was ticked by default.
- **Fix**: Add a short evidence note after 5.8–5.10, such as "spacing shift: none / accepted <where>" and "Firefox <version> OK". Untick any item that was not actually checked.
- **Decision**: FIXED — evidence notes added to Progress 5.8–5.10 from user's manual check (no spacing shift, Firefox OK, diacritics OK).

### F2 — Phase 4 review fixes still uncommitted, including Phase 5 code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: working tree (19 modified files plus untracked reviews, follow-ups and `tests/e2e/support/ui-flows.ts`)
- **Detail**: HEAD (4dc0d7a) marks the change `implemented`, but the Phase 4 triage fixes are not committed. These are guard regex extensions, `--reading` plan row, `outline-ring` and the `text-muted-foreground` swap. One of them also edits the Phase 5 font-notice markup in `src/pages/licenses.astro`. CI and the branch history do not yet contain the reviewed state that these checks were run against.
- **Fix**: Commit the working tree as a `fix(dnd-theme-revamp): impl-review fixes` commit before archiving or merging.
- **Decision**: FIXED — working tree committed on dnd-theme-revamp as `fix(dnd-theme-revamp): impl-review fixes (p4, p5)`.

### F3 — Lora copyright line may drop the Reserved Font Name clause

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/licenses.astro:44-48
- **Detail**: The plan says to take the copyright line from each family's Google Fonts `OFL.txt`. Lora's upstream notice is believed to read "Copyright 2011 The Lora Project Authors (…Lora-Cyrillic), with Reserved Font Name "Lora"". The page shows only "© 2011 The Lora Project Authors". This was not checked against the live file during this review.
- **Fix**: Check `google/fonts/ofl/lora/OFL.txt`. If the Reserved Font Name clause is there, add it to the Lora `copyright` string.
- **Decision**: FIXED — upstream google/fonts `ofl/lora/OFL.txt` confirmed the clause; Lora copyright now ends with `with Reserved Font Name "Lora"`. Cinzel line already matched upstream.
