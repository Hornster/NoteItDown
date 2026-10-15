<!-- PLAN-REVIEW-REPORT -->
# Plan Review: D&D Theme Revamp — Phase 2 (Token contract and primitives)

- **Plan**: context/changes/dnd-theme-revamp/plan.md
- **Scope**: Phase 2 only
- **Mode**: Deep (inline verification, no sub-agent: Phase 2 touches 11 files, all read directly)
- **Date**: 2026-10-14
- **Verdict**: SOUND after triage (was REVISE; both warnings fixed)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 7/7 paths ✓ (global.css, button.tsx, dialog.tsx, alert-dialog.tsx, textarea.tsx, label.tsx, LibBadge.astro; the 5 new primitives are absent as expected), 6/6 symbols ✓ (`--xy-background-color`, `--xy-background-pattern-color`, `--xy-edge-stroke`, `--xy-controls-button-{background-color,background-color-hover,color,border-color}` in @xyflow/react/dist/style.css:99,139,391,423-431,500; `AlertDialogCancel` defaults to `outline` at alert-dialog.tsx:136; `@custom-variant dark` at global.css:8; LibBadge has no importers), brief↔plan ✓. All 20 contrast ratios in the token table recomputed and match (e.g. destructive-foreground on destructive 4.89, success-foreground on success 4.53, input on card 3.40). xyflow CSS sits in `@layer base` (global.css:4-6), so unlayered `.react-flow` overrides win as planned. Contract surfaces: no surface touched.

## Findings

### F1 — Alert's grid layout breaks notices that have a dismiss button

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §4 — New primitives (`Alert`); consumed in Phase 3 §2–3
- **Detail**: The plan builds `Alert` on shadcn's `has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr]` grid, where only `AlertTitle`/`AlertDescription` carry `col-start-2`. Two of its three consumers do not fit that shape. `RelationChangeNotice.tsx:58-104` and `ImageFailureNotice.tsx:25-45` are `flex items-start justify-between` with a content `<div>` and a trailing dismiss `<button>`. With an icon added, there are 3 direct children in a 2-column grid, so the dismiss button wraps into the 16px icon column on a second row. If a call site passes `flex` to keep its geometry, twMerge drops `grid`, and `justify-between` places the content `<div>` between the icon and the button instead of next to the icon. Either way the notice layout drifts, and the implementer has to redesign the primitive in Phase 3. The `<p>`-count e2e contract (`notes-relations.spec.ts:75-81`) also limits restructuring, because the content `<p>` elements must stay inside the `role="status"` element.
- **Fix A ⭐ Recommended**: Define `Alert` as flex: `flex items-start gap-3`, icon first, `AlertDescription` as `flex-1 min-w-0`, and an optional trailing action (any child after the description, e.g. a dismiss button, gets `shrink-0`). The contract states that consumers put their existing content `<div>` inside `AlertDescription` and keep the dismiss `<button>` as the last child.
  - Strength: Matches all three consumers (ServerError: icon + text; both notices: icon + content + dismiss), keeps the `<p>` children untouched, and needs no call-site geometry overrides.
  - Tradeoff: Departs from stock shadcn Alert markup, so a future `shadcn add alert` would overwrite it.
  - Confidence: HIGH — the current notices already use exactly this flex shape.
  - Blind spot: None significant.
- **Fix B**: Keep the shadcn grid and add a third column via `has-[>[data-slot=alert-action]]:grid-cols-[auto_1fr_auto]` plus an `AlertAction` slot.
  - Strength: Stays close to upstream shadcn.
  - Tradeoff: Another slot component and a more complex selector for 2 consumers.
  - Confidence: MED — the arbitrary `has-` grid selector is untested in this codebase.
  - Blind spot: Behavior without an icon (two columns vs three) needs checking.
- **Decision**: FIXED (Fix A: flex Alert, AlertDescription flex-1, trailing dismiss button stays last)

### F2 — Focus indicator below 3:1 and criterion 2.7 depends on how the dialog is opened

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1–3 (`button.tsx` base classes, contrast test) and Manual criterion 2.7
- **Detail**: FR-002's "Cancel has default focus" is only visible through the focus ring. The plan keeps the button base `focus-visible:ring-ring/50` (button.tsx:8). Gold at 50% over the popover is #7C6636, which is 2.62:1 (2.80:1 on the background), below the 3:1 WCAG 1.4.11 threshold for a focus indicator. The `destructive` variant also keeps `focus-visible:ring-destructive/20` (button.tsx:14), which is effectively invisible on dark surfaces. The contrast test asserts no ring pair at all. Also, Radix focuses Cancel programmatically. When the trigger is clicked with a mouse, Chromium and Firefox do not apply `:focus-visible`, so the manual check "Cancel has the focus ring on open" fails if done by mouse, even though `toBeFocused()` passes.
- **Fix**: In `button.tsx` use a full-strength `focus-visible:ring-ring` (drop `/50`, and drop `ring-destructive/20` from `destructive`). Add `ring on background ≥ 3` and `ring on card ≥ 3` (popover = card) to `theme-contrast.test.ts`. Reword 2.7: "opened via keyboard (Tab to Delete, Enter), Cancel shows the gold focus ring; opened by mouse, Cancel is focused (pinned by e2e)".
  - Strength: Makes the default-focus rule visible and keeps it under test; gold ring is 6.01:1 on popover.
  - Tradeoff: A brighter ring than stock shadcn on every button.
  - Confidence: HIGH — ratios computed from the plan's own hexes; focus-visible heuristics are standard browser behavior.
  - Blind spot: The base layer `outline-ring/50` (global.css:123) applies to non-button focusables too; whether to tighten it is left to the implementer.
- **Decision**: FIXED (Fix in plan: full-strength focus-visible:ring-ring, destructive /20 ring dropped, ring ≥ 3 pair in contrast test, 2.7 checked via keyboard open)

### F3 — "Input: same classes as Textarea" would copy textarea geometry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §4 — `Input`
- **Detail**: `textarea.tsx` carries geometry (`min-h-40 w-full rounded-lg px-3 py-2`). Copied literally, `Input` would be 10rem tall. FormField's `inputBase` already holds the input geometry at the call site.
- **Fix**: Input = Textarea's color, focus and invalid classes plus `w-full` only. No `min-h`; geometry stays at call sites (FormField `inputBase`).
- **Decision**: SKIPPED

### F4 — `dark:` is not inert inside the memory map

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details ("Keep `@custom-variant dark`"); criterion 2.6
- **Detail**: `MemoryMap.tsx:69` `colorMode="dark"` makes React Flow add the `dark` class to its wrapper (`.react-flow.dark`, style.css:53), so `&:is(.dark *)` matches every node inside the map. Any `dark:` utility in a component rendered there (NoteNode, and the Phase 3 Badge) activates. Criterion 2.6 only keeps `ui/` clean, and the plan's claim that the custom variant "makes any `dark:` utility inert" is not true there.
- **Fix**: Correct the note (inert except inside `.react-flow.dark`) and widen 2.6 to `grep -rn "dark:" src` (empty), or add `dark:` to the Phase 4 guard.
- **Decision**: FIXED (Fix in plan: Critical Implementation Details note corrected; criterion 2.6 greps dark: across all of src)

### F5 — Delete-dialog error text drops to 2.17:1 between Phase 2 and Phase 3

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 overview (intermediate state); Phase 3 §3 `DeleteNoteButton.tsx`
- **Detail**: `DeleteNoteButton.tsx:46` is the only token class outside `ui/` (`text-destructive`). Once Phase 2 turns the dialog dark, palette red #A8322D on popover #2E2922 is 2.17:1, so the delete-failure message is unreadable until Phase 3.
- **Fix**: Move the one-class swap `text-destructive` → `text-destructive-text` into Phase 2, or accept it as an interim state.
- **Decision**: SKIPPED

### F6 — Label color left as an "or"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3 — `label.tsx`
- **Detail**: "`text-foreground` (or `text-muted-foreground` where the current hierarchy is secondary…)". Label has one call-site style, and FormField's raw label (FormField.tsx:37) is `text-blue-100/80`, which the plan's own Phase 4 rule (≥ 80% → foreground) maps to `text-foreground`.
- **Fix**: Label → `text-foreground`. Phase 3 FormField uses the same Label.
- **Decision**: SKIPPED
