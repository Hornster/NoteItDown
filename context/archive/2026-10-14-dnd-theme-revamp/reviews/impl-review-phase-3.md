<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: D&D Theme Revamp Implementation Plan

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 3 of 5
- **Reviewed phases**: 3
- **Date**: 2026-10-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

Reviewed commit e8602b0 (18 files). All 17 planned component files were changed as described, with no unplanned source files. Automated checks were run on the current working tree (2026-10-15): `npm run lint` passed, `npm run test:unit` passed (147/147), `npx astro check` had 0 errors, `npm run build` passed, `npm run test:e2e` passed (6/6), and the hard-coded color grep for 3.6 found nothing. The manual items 3.7–3.11 are ticked. The phase 4 and "after" screenshot sets give visual evidence for them.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Delete trigger keeps 10px side padding despite `p-0`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/notes/DeleteNoteButton.tsx:36
- **Detail**: The plan sets `className="h-auto p-0"` so the trigger lines up with the adjacent "Edit" text link. The `sm` size also includes `has-[>svg]:px-2.5`, and the new Trash2 icon makes that rule apply. tailwind-merge keeps both classes because their modifiers differ. The built CSS (`.has-\[\>svg\]\:px-2\.5:has(>svg){padding-inline:…*2.5}`) has a higher specificity (0,2,0) than `.p-0`, so the trigger gets 10px of side padding and sits further from "Edit" than the `gap-3` spacing intends.
- **Fix**: Add `has-[>svg]:px-0` to the trigger className. tailwind-merge then replaces the size's `has-[>svg]:px-2.5`.
- **Decision**: FIXED (`has-[>svg]:px-0` added)

### F2 — Label colors differ within one form

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/auth/FormField.tsx:37
- **Detail**: Before the theme, the FormField labels and the `Label` primitive used the same color (`text-blue-100/80`). Phase 2 mapped `Label` to `text-foreground`, and the plan says to keep it "consistent with `FormField` labels". FormField now overrides its label to `text-muted-foreground`. On the note form, "Name" and "New type name" are therefore muted, while "Type" and "Content" (`NoteForm.tsx:136,191`) are parchment. By the plan's own rule (≥ 80% opacity → `text-foreground`), all of them should be foreground.
- **Fix**: Remove `text-muted-foreground` (and the redundant `mb-1 block text-sm`) from FormField's `<Label>` so it uses the primitive's default.
- **Decision**: FIXED (FormField `<Label>` uses the primitive default, `text-foreground`)

### F3 — `<optgroup>` labels not themed in the native dropdown (PLAUSIBLE)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/select.tsx:9 (consumed by src/components/notes/NoteForm.tsx:152,163)
- **Detail**: Select themes only `[&_option]`. The note-type dropdown also has "Predefined" and "Custom" `<optgroup>` labels. These inherit parchment text from the `bg-transparent` select, and there is no `color-scheme: dark`. In Chromium and Firefox the popup's group-label rows can render parchment on the default light canvas. This was not verified visually because native popups do not appear in screenshots. The issue existed before this phase (`text-white` select with unstyled optgroups).
- **Fix**: Add `[&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground` to the Select primitive, then check the dropdown in Chromium and Firefox.
- **Decision**: FIXED (optgroup selectors added to Select; manual Chromium/Firefox dropdown check still pending)

### F4 — Image thumbnail ring shows on mouse click

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/notes/NoteImages.tsx:35
- **Detail**: The thumbnail button kept `focus:ring-2 focus:ring-ring`. Every primitive uses `focus-visible:`, and the phase-2 review fixed the same pattern on the dialog close chip (F3). Clicking a thumbnail draws the gold ring, which then stays on the thumbnail after the popup closes and returns focus. This behavior existed before this phase. Only the color changed.
- **Fix**: Change it to `focus-visible:ring-2 focus-visible:ring-ring focus:outline-none`.
- **Decision**: FIXED (ring classes moved to `focus-visible:`)
