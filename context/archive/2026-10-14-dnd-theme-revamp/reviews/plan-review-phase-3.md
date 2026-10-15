<!-- PLAN-REVIEW-REPORT -->
# Plan Review: D&D Theme Revamp — Phase 3 (Shared components)

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 3 only
- **Mode**: Deep (inline verification, no sub-agent: all 17 Phase 3 files read directly)
- **Date**: 2026-10-14
- **Verdict**: SOUND after triage (was REVISE; all 6 findings fixed)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 17/17 paths ✓ (Layout.astro, Topbar.astro, Banner.astro, 5 auth components, 6 notes components, 2 campaign components, NoteNode.tsx), 6/7 symbols ✓ (`CircleAlert` in FormField/ServerError, `MESSAGES.DELETE_LABEL`, popup geometry `w-auto max-w-[95vw] p-2 sm:max-w-[95vw]` at NoteImages.tsx:69, `role="status"`/`role="alert"` on both notices, `MAP_NODE_*` sizing, e2e `getByLabel("Content"|"Type")`; ✗ FormField "id and aria-describedby wiring" does not exist, see F3), brief↔plan ✓. e2e `expectNotice` uses `getByRole("status").locator("p")` (descendants, notes-relations.spec.ts:76), so moving the content `<div>` into a `div` AlertDescription keeps the count. `SignInForm.tsx` and `MemoryMap.tsx`/`StraightEdge.tsx` have no color classes, so their absence from the file list is correct. Contract surfaces: no surface touched.

## Findings

### F1 — Nested panels vanish: card on card with a card-colored border

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §3 (`NoteImages` "panels → cardVariants", `NoteForm`/`NoteImagePicker` "`white/*` panels → cardVariants"); Phase 4 §1 sub-panel rule
- **Detail**: `cardVariants` = `bg-card border-border`, and the token table sets `--card`, `--muted` and `--border` all to `#2E2922`. The components migrated here sit inside page panels that Phase 4 turns into cards: NoteForm/NoteImagePicker inside the glass panel at `notes/[noteId]/edit.astro:58`, NoteImages thumbnails inside `[noteId].astro:60`. Today they are visible as `bg-white/5` on `bg-white/10`. After migration, an image row in the picker is `#2E2922` fill with a `#2E2922` border on a `#2E2922` card: no boundary at all (1.00:1). Only the alt-text input border remains, so the new/edit note layout (FR-014) loses its visible row structure. Phase 4's fallback "`bg-muted` where nested inside a card" does not help, because `--muted` is the same hex.
- **Fix A ⭐ Recommended**: Define a nested-panel rule once: top-level surfaces use `cardVariants()`; panels inside a card use `border border-input bg-background` (a darker inset well; border 3.40:1 on card, 4.17:1 on background). Apply it in Phase 3 (picker rows, image thumbnails/placeholders) and replace the `bg-muted` fallback in Phase 4 §1 with it.
  - Strength: Uses existing tokens, needs no new token or contrast-test pair, and boundary contrast is already measured in the plan.
  - Tradeoff: Inverted depth (darker inside lighter) instead of the current lighter-inside-lighter look.
  - Confidence: HIGH — ratios are the plan's own measured values.
  - Blind spot: Whether the inset look reads well next to the note-content box on the note page; checked in the screenshot comparison.
- **Fix B**: Add a `--card-nested` token (e.g. `#3A342B`, a step lighter than card) published as `bg-card-nested`, with a `nested` variant on `cardVariants`.
  - Strength: Keeps today's "lighter inside lighter" depth.
  - Tradeoff: One more token to name, add to the contrast test (foreground and muted-foreground on it) and to contract-surfaces.md; Phase 2 must be reopened.
  - Confidence: MED — the hex value is not measured yet.
  - Blind spot: Must stay clearly distinct from `--accent` (#4A4135, the hover surface).
- **Decision**: FIXED (Fix A: nested-panel rule `border border-input bg-background` in the Phase 3 overview, applied to NoteImages and picker rows; the Phase 4 `bg-muted` fallback replaced)

### F2 — Criterion 3.6 cannot pass and has no runnable command

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Success Criteria, Automated 3.6
- **Detail**: "No hard-coded palette class remains in `src/components/` … (research regex returns nothing for those folders)". `src/components/Welcome.astro` has 19 matches today and is migrated only in Phase 4 §1, so 3.6 fails by construction. The criterion also points at a prose regex in research.md §4 instead of a command.
- **Fix**: Rewrite 3.6 as a runnable command that excludes Welcome.astro, e.g. `grep -rnE '(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|placeholder|decoration|caret|ring-offset)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-[0-9]{2,3})?(/[0-9]{1,3})?\b|-\[#' src/components src/layouts --exclude=Welcome.astro` returns nothing (Welcome.astro is Phase 4).
- **Decision**: FIXED (Fix in plan: 3.6 is a runnable grep that also catches hex literals, with `--exclude=Welcome.astro`; Progress title updated)

### F3 — FormField error border is lost; contract cites wiring that does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2 — `FormField`; §3 — `NoteForm` Textarea
- **Detail**: The contract says "keep the existing error element, id and `aria-describedby` wiring". FormField.tsx:42-62 has neither an error id nor `aria-describedby`. Today the red error border comes from a conditional class (`border-red-400/60 focus:ring-red-400`, FormField.tsx:53). Phase 2 moves the invalid style into the primitives as `aria-invalid:` classes (textarea.tsx:10 pattern), but neither FormField nor NoteForm's content Textarea sets `aria-invalid`. Once FormField renders `Input` and drops its own color classes, an invalid field keeps its normal border. Criterion 3.10 ("light-red error with icon") would still pass because it only looks at the text.
- **Fix**: FormField passes `aria-invalid={error ? true : undefined}` to `Input` (NoteForm passes the same to `Textarea` from `contentError`), so the primitive's `aria-invalid:border-destructive-text` style applies. Drop the "id and aria-describedby" wording, or add it on purpose (`id={`${id}-error`}` + `aria-describedby`). Add "invalid field shows a light-red border" to 3.10.
- **Decision**: FIXED (Fix in plan: FormField, NoteForm Textarea and type Select pass `aria-invalid`; nonexistent id/aria-describedby wording corrected; 3.10 extended)

### F4 — Input copies Textarea's `min-h-40`, so every form field becomes 10rem tall

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §4 `Input`/`Select` ("same classes as Textarea"); consumed in Phase 3 §2 `FormField`, §3 `NoteForm`, §4 `CampaignSwitcher`
- **Detail**: Carry-over of Phase 2 review F3 (skipped there), which becomes concrete here. `textarea.tsx:9` contains `min-h-40 w-full rounded-lg px-3 py-2`. Copied into `Input` and `Select`, it makes every FormField (sign-in, sign-up, note name, campaign name) and the type select 10rem tall, and pushes `CampaignSwitcher` (`px-2 py-1 text-xs max-w-[10rem]`) to a full-width, 10rem box in the Topbar. That breaks FR-014 (header and new/edit note layouts unchanged) at the exact phase whose manual check 3.7 compares the header.
- **Fix**: In Phase 3, state that `Input`/`Select` carry only color, focus and invalid classes (no `min-h`, no padding or radius, `w-full` only on Input), and that call sites keep their own geometry: FormField keeps `inputBase`'s `rounded-lg px-3 py-2 pl-10`; CampaignSwitcher keeps `max-w-[10rem] … px-2 py-1 text-xs sm:max-w-[14rem] sm:text-sm` (no `w-full`).
- **Decision**: FIXED (Fix in plan: Phase 2 §4 Input/Select are geometry-free except `w-full` on Input; FormField keeps `inputBase` geometry; CampaignSwitcher and the NoteForm type select keep their own sizes)

### F5 — Leftover `white/*` classes with no stated mapping

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §1–5
- **Detail**: Several classes fall outside every listed mapping, so the implementer has to guess: field icon spans `text-white/40` (FormField.tsx:41, NoteForm.tsx:137,193), image remove/dismiss X buttons `text-white/60 hover:text-white` (NoteImagePicker.tsx:68,115), the pending spinners `border-white/30 border-t-white` on a gold button (SubmitButton.tsx:22, NoteForm.tsx:226, CampaignForm.tsx:80), the "Add image" label styled as a button (NoteImagePicker.tsx:139-140), the Topbar base `text-white/80` and NoteNode name `text-white`.
- **Fix**: Add one mapping line to Phase 3: decorative icons and icon-only buttons → `text-muted-foreground hover:text-foreground`; spinners → `border-current/30 border-t-current` (inherits `primary-foreground`); "Add image" label → `border-input hover:bg-accent text-foreground` with geometry kept; base text → `text-foreground`.
- **Decision**: FIXED (Fix in plan: "Leftover mappings" paragraph added to the Phase 3 overview)

### F6 — `size="sm"` adds padding to the Delete trigger next to a bare Edit link

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §3 — `DeleteNoteButton.tsx`
- **Detail**: Today the trigger is a bare `text-sm` text button sitting beside the "Edit" text link (`[noteId].astro:77-89`). `Button size="sm"` adds `h-8 px-3 has-[>svg]:px-2.5` and `rounded-md`, so "Delete" gains about 10px of horizontal padding and no longer lines up with "Edit" as a text action. The `destructive-text` variant is described as a text action ("underline on hover").
- **Fix**: Render the trigger with `className="h-auto p-0"` (or give `destructive-text` its own padding-free shape) so it stays inline with the Edit link.
- **Decision**: FIXED (Fix in plan: trigger gets `className="h-auto p-0"`)
