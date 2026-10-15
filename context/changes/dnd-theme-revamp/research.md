---
date: 2026-10-14T19:38:57+02:00
researcher: Claude (Opus 5.5) for Hornster
git_commit: 9132d34
branch: dnd-theme-revamp
repository: NoteItDown
topic: "Current styles config: tokens, @theme publishing, UI primitives, hard-coded colors, missing primitives"
tags: [research, styles, tailwind, shadcn, theme, dnd-theme-revamp]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Follow-up: reference materials (index-example.css, layout-example.tsx.txt) checked against Open Questions 1-3"
---

# Research: Current styles config for the D&D theme revamp

**Date**: 2026-10-14T19:38:57+02:00
**Researcher**: Claude (Opus 5.5) for Hornster
**Git Commit**: 9132d34 (branch created from `main` at this commit; no code changes yet)
**Branch**: dnd-theme-revamp
**Repository**: NoteItDown

## Research Question

1. The exact path to the main styles file and the list of variables defined in `:root` and `.dark`.
2. Variables that are correctly published in `@theme` / `@theme inline` blocks.
3. The components that are physically present in `src/components/ui/`.
4. A table of files in `src/` that use hard-coded color classes (e.g. `bg-blue-*`) instead of semantic ones (e.g. `bg-primary`).
5. The UI primitives that are missing and will be needed to display data and controls.

## Summary

- **One stylesheet**: `src/styles/global.css` (128 lines) is the only file in `src/styles/`. It is imported once in `src/layouts/Layout.astro:2` and registered as the shadcn CSS entry in `components.json` (`tailwind.css`, `baseColor: "neutral"`, `style: "new-york"`).
- **The token set is the stock shadcn neutral set.** `:root` defines 32 variables (`--radius` + 31 colors, `global.css:10-43`). `.dark` defines 31 color variables (`global.css:45-77`). **`.dark` is never activated**: no file in `src/` adds a `dark` class (the only match for `.dark` in the inspected `src/` tree is `global.css` itself). So the light `:root` values are what render, and pages hide this by painting their own dark background on top.
- **Publishing in `@theme inline` is complete for the existing tokens.** All 31 color variables have a matching `--color-*` entry, and `--radius` is published as 4 radius steps (`global.css:79-115`). No plain `@theme` block exists. There are no tokens for success, warning, info, or destructive-foreground.
- **`src/components/ui/` has 6 files**: `alert-dialog.tsx`, `button.tsx`, `dialog.tsx`, `label.tsx` and `textarea.tsx` (shadcn React), plus `LibBadge.astro` (a starter Astro badge). `textarea.tsx`, `label.tsx` and `LibBadge.astro` have already been edited away from semantic tokens to hard-coded colors.
- **Hard-coded colors are everywhere in the UI.** The regex sweep below found **289 occurrences in 34 files** of `src/`. The real palette in use is a "cosmic" purple/blue glass look: `bg-cosmic` (`#0a0e1a` gradient), `bg-white/5–10` panels, `text-blue-100/*` body text, `purple-*` for primary actions and links, and `red-*` for errors. Besides the class sweep there are inline hex/rgba literals in `Banner.astro`, `Welcome.astro`, `Layout.astro` and the `bg-cosmic` utility.
- **Missing primitives**: Input, Select, Card, Badge, Alert/Notice, Collapsible/Accordion, Separator and Skeleton are the clear gaps. Today these are copy-pasted class strings on raw HTML (`<input>`, `<select>`, `<div>` panels, `<a>` styled as buttons). Collapsible/Accordion and the search Input are also direct prerequisites of S-06.

## Detailed Findings

### 1. Main styles file and defined variables

Path: **`src/styles/global.css`**. Its structure:

- `global.css:1-6`: `@import "tailwindcss"`, `@import "tw-animate-css"`, and React Flow's stylesheet imported inside `@layer base`.
- `global.css:8`: `@custom-variant dark (&:is(.dark *));`, so a `dark:` variant applies only to elements that are *descendants* of `.dark`.
- `global.css:117-119`: custom utility `bg-cosmic` with hard-coded hex gradient `#0a0e1a → #0f1529 → #0a0e1a`.
- `global.css:121-128`: base layer, `* { border-border outline-ring/50 }`, `body { bg-background text-foreground }`.

**`:root` (`global.css:10-43`), 32 variables:**

| Group | Variables |
|---|---|
| Radius | `--radius` (0.625rem) |
| Surface | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground` |
| Intent | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive` |
| Form | `--border`, `--input`, `--ring` |
| Chart | `--chart-1` … `--chart-5` |
| Sidebar | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` |

All color values are shadcn's neutral oklch defaults. Light values include `--background: oklch(1 0 0)` (white) and `--primary: oklch(0.205 0 0)` (near-black). The one chromatic token is `--destructive: oklch(0.577 0.245 27.325)`.

**`.dark` (`global.css:45-77`), 31 variables:** the same names as `:root` minus `--radius`, with the shadcn neutral dark values.

**Observations relevant to the revamp:**
- `.dark` is dead code today. No `class="dark"` or `classList` toggle exists in `src/`, and `Layout.astro:15` renders `<html lang="en">` without a class. The `dark:` variants inside `button.tsx:8,14,16,18` therefore never apply.
- `--destructive-foreground` is not defined. `button.tsx:14` works around this with a literal `text-white`.
- The palette spec (`context/foundation/materials/dnd-color-palette.md`) defines 5 colors (+1 optional green) under its own names (`--color-bg`, `--color-ornament`, `--color-text`, `--color-accent`, `--color-danger`). These names clash in spirit with Tailwind's `--color-*` namespace, and `--color-accent` would collide with the shadcn `--color-accent` published at `global.css:96`. The palette must be mapped onto the shadcn token names, not pasted in as is (see Open Questions).

### 2. Variables published in `@theme inline`

`global.css:79-115` contains a single `@theme inline` block. There is no plain `@theme` block.

- **Radius (4)**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, all derived from `--radius`.
- **Color (31)**: `--color-<name>: var(--<name>)` for every color variable in `:root`. The exact list is background, foreground, card, card-foreground, popover, popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, destructive, border, input, ring, chart-1…5, sidebar, sidebar-foreground, sidebar-primary, sidebar-primary-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border, sidebar-ring.

Verdict: every color variable declared in `:root` is published, and no published `--color-*` points at an undeclared variable. These are not published because they don't exist:
- `destructive-foreground`
- any `success` / `warning` / `info` intent (the palette's optional green `#5E8C5A` has no token)
- any token for the "ornament/panel" role that sits apart from `card`
- any font-family token (no `--font-*` in the inspected file)

### 3. Components present in `src/components/ui/`

`git ls-files src/components/ui` and `ls` agree on 6 files:

| File | Kind | Token status |
|---|---|---|
| `alert-dialog.tsx` | shadcn (Radix `react-alert-dialog`). Exports Root/Trigger/Portal/Overlay/Content/Header/Footer/Title/Description/Media/Action/Cancel | Mostly semantic. The overlay is a literal `bg-black/50` (`alert-dialog.tsx:24`). Content uses `bg-background`, which today resolves to **white** (light `:root`) |
| `button.tsx` | shadcn `cva` button. Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, icon | Semantic, except `destructive` uses `text-white` (`button.tsx:14`) |
| `dialog.tsx` | shadcn (Radix `react-dialog`) with a built-in close button (`XIcon`, `dialog.tsx:57-64`) | Overlay `bg-black/50` (`dialog.tsx:30`). The close button is semantic (`ring-offset-background`, `focus:ring-ring`, `data-[state=open]:bg-accent`) |
| `label.tsx` | Simplified label on a plain `<label>` (no Radix) | Hard-coded `text-blue-100/80` (`label.tsx:6`) |
| `textarea.tsx` | Textarea on a plain `<textarea>` | Hard-coded `border-white/20 bg-white/10 text-white placeholder-white/40 ring-purple-400`, invalid state `red-400` (`textarea.tsx:9-10`) |
| `LibBadge.astro` | Astro starter badge (not shadcn) | Hard-coded `bg-blue-900/50 text-blue-200`, `bg-purple-500/30 text-purple-200` (`LibBadge.astro:10,12`). No `import` of it was found in `src/` (only its own file), so it may be unused |

How the primitives are used elsewhere: `<Button>` is used in 6 files (SubmitButton, CampaignForm, DeleteNoteButton, NoteForm ×4, NoteImagePicker, NoteImages). `SubmitButton.tsx:18` overrides the variant with `bg-purple-600 … hover:bg-purple-500`, so the semantic default variant is visually unused there. Separately, `NoteForm.tsx:222` and `CampaignForm.tsx:76` carry the same purple override string.

Notes on the roadmap's "fixed alert-dialog and image-popup close button" items:
- `DeleteNoteButton.tsx:31-65`: the trigger is a raw `<button>` with `text-red-300` (no icon). Cancel uses `AlertDialogCancel` (outline variant). The action uses `variant="destructive"`. Nothing sets default focus on Cancel explicitly (Radix AlertDialog focuses Cancel by default, but this inspection did not verify that behavior).
- `NoteImages.tsx:63-66`: the image popup `DialogContent` is overridden to `border-white/10 bg-black/80` and uses the default `dialog.tsx` close button. That button's colors come from `accent`/`muted-foreground`/`ring`, which are the light neutral values today.

### 4. Files using hard-coded color classes

**Method**: a regex sweep over `src/**/*.{astro,tsx,ts}` for `(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|placeholder|decoration|caret|ring-offset)-(<22 Tailwind palette names>|white|black)(-NNN)?(/NN)?` plus arbitrary hex `(bg|text|border|from|via|to|fill|stroke)-[#…]`. It counts occurrences, including those behind variants like `hover:` or `focus:`. Result: **289 occurrences in 34 files.** Semantic-token classes (`bg-primary`, `text-muted-foreground`, …) are not counted.

| # | File | Count | Hard-coded families seen (distinct) |
|---|---|---|---|
| 1 | `src/components/Welcome.astro` | 28 | purple-500/600, blue-500, indigo-400, gradient blue-200→purple-200→pink-200, blue-100/*, white/*, purple-300 |
| 2 | `src/pages/campaigns/[campaignId]/index.astro` | 26 | white/*, gradient blue-200→purple-200, purple-100/300/500/600, blue-100/70 |
| 3 | `src/components/notes/NoteImagePicker.tsx` | 24 | white/*, purple-400 ring, blue-100/*, red-300, amber-200 |
| 4 | `src/components/notes/NoteForm.tsx` | 19 | white/*, purple-400/500/600, slate-800 (`<option>`), red-300, amber-200 |
| 5 | `src/pages/campaigns/[campaignId]/map.astro` | 17 | white/*, gradient blue-200→purple-200, blue-100/*, purple-500/600 |
| 6 | `src/components/Topbar.astro` | 17 | white/*, blue-100/70, purple-100/300 (nav links) |
| 7 | `src/pages/campaigns/[campaignId]/notes/[noteId].astro` | 16 | white/*, gradient, purple-100/200/300/500, blue-100/*, amber-200 |
| 8 | `src/pages/licenses.astro` | 15 | white/*, gradient, blue-100/*, purple-300 |
| 9 | `src/components/notes/NoteImages.tsx` | 10 | white/*, purple-400 ring, blue-100/*, black/80, red-300 |
| 10 | `src/components/auth/FormField.tsx` | 10 | white/*, blue-100/80, red-300/400, purple-400 ring |
| 11 | `src/pages/campaigns/[campaignId]/notes/[noteId]/edit.astro` | 8 | white/*, gradient, purple-100/300, blue-100/70 |
| 12 | `src/pages/campaigns/[campaignId]/edit.astro` | 8 | white/*, gradient, purple-100/300, blue-100/70 |
| 13 | `src/components/campaigns/CampaignSwitcher.tsx` | 8 | white/*, purple-400 ring, slate-800 (`<option>`) |
| 14 | `src/pages/auth/signup.astro` | 7 | white/*, gradient, blue-100/60, purple-300 |
| 15 | `src/pages/auth/signin.astro` | 7 | white/*, gradient, blue-100/60, purple-300 |
| 16 | `src/pages/auth/confirm-email.astro` | 7 | white/*, gradient, blue-100/80, purple-300 |
| 17 | `src/components/ui/textarea.tsx` | 7 | white/*, purple-400, red-400 |
| 18 | `src/components/notes/RelationChangeNotice.tsx` | 7 | purple-100/300, white/*, blue-100/90 |
| 19 | `src/pages/campaigns/[campaignId]/notes/new.astro` | 6 | white/*, gradient, blue-100/70 |
| 20 | `src/components/memory-map/NoteNode.tsx` | 6 | white/*, purple-200/500 (type badge) |
| 21 | `src/pages/campaigns/new.astro` | 5 | white/*, gradient |
| 22 | `src/components/notes/ImageFailureNotice.tsx` | 5 | red-100/300/500, white/* |
| 23 | `src/components/ui/LibBadge.astro` | 4 | blue-200/900, purple-200/500 |
| 24 | `src/components/campaigns/CampaignForm.tsx` | 4 | purple-500/600, white |
| 25 | `src/components/auth/SubmitButton.tsx` | 4 | purple-500/600, white |
| 26 | `src/components/auth/ServerError.tsx` | 3 | red-300/500/900 |
| 27 | `src/layouts/Layout.astro` | 2 | `bg-[#0a0e1a]` footer, blue-100/60 |
| 28 | `src/components/notes/DeleteNoteButton.tsx` | 2 | red-200/300 (trigger link) |
| 29 | `src/components/auth/PasswordToggle.tsx` | 2 | white/40, white/70 |
| 30 | `src/components/ui/label.tsx` | 1 | blue-100/80 |
| 31 | `src/components/ui/dialog.tsx` | 1 | black/50 (overlay) |
| 32 | `src/components/ui/button.tsx` | 1 | white (destructive text) |
| 33 | `src/components/ui/alert-dialog.tsx` | 1 | black/50 (overlay) |
| 34 | `src/components/auth/SignUpForm.tsx` | 1 | blue-100/50 |

**Color literals outside Tailwind classes** (not in the count above):
- `src/styles/global.css:118`: `bg-cosmic` utility gradient hexes. It is used on 11 page wrappers plus `Welcome.astro:5`.
- `src/components/Banner.astro:28-40`: scoped `<style>` with 9 hex values for the info/warning/error variants (light backgrounds). It is rendered by `Layout.astro:24` when config is missing.
- `src/components/Welcome.astro:14`: inline `style` with three `rgba(255,255,255,…)` radial-gradient star fields.
- `src/lib/images/compress.ts:138`: `ctx.fillStyle = "#fff"`, a canvas fill for image compression and not UI theming. It is out of scope.

**Repeated patterns that a token or primitive would collapse:**
- Glass panel `rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl`: 10 page wrappers (all auth, campaign and note pages).
- Gradient heading `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text … text-transparent`: 11 pages.
- Primary action `rounded-lg bg-purple-600 … text-white hover:bg-purple-500`: 7 places. Three are `<Button>` overrides (`SubmitButton.tsx:18`, `NoteForm.tsx:222`, `CampaignForm.tsx:76`). Four are `<a>` links styled as buttons (`Welcome.astro:31`, `index.astro:60,78`, `map.astro:54`).
- Text links `text-purple-300 hover:text-purple-100`: Topbar (6×) and page back-links.
- Form control `border-white/20 bg-white/10 text-white placeholder-white/40 focus:ring-purple-400`: `FormField.tsx`, `textarea.tsx`, `NoteForm.tsx` select, `CampaignSwitcher.tsx` select, `NoteImagePicker.tsx` inputs.

**Memory map**: `MemoryMap.tsx:69` sets `colorMode="dark"` on React Flow, so `<Background />` and `<Controls />` take React Flow's own dark CSS variables, not app tokens. `StraightEdge.tsx` renders `BaseEdge` with no stroke override, so edge color is React Flow's default for dark mode. `NoteNode.tsx:25-30` is hard-coded white/purple.

### 5. Missing UI primitives

Derived from the raw HTML controls found in the sweep (`<input>`, `<select>`, `<button>`, `<ul>` outside `ui/`) and from the S-05/S-06/S-07 outcomes in `context/foundation/roadmap.md:147-184`:

| Primitive | Evidence of need today | Needed by |
|---|---|---|
| **Input** | Raw `<input>` in `FormField.tsx:42` and `NoteImagePicker.tsx:73,121,146`, with styles duplicated from `textarea.tsx` | S-05 (consistency); S-06/S-07 name search |
| **Select** (native-styled or Radix) | Raw `<select>` in `NoteForm.tsx:140` and `CampaignSwitcher.tsx:20`, each with `<option className="bg-slate-800 text-white">` | S-05 |
| **Card** (panel) | 10 copies of the glass-panel class string on page wrappers; repeated `border-white/10 bg-white/5` sub-panels in `index.astro`, `map.astro`, `licenses.astro`, `[noteId].astro`, `NoteImages.tsx` | S-05 ("ornaments/panels" role) |
| **Badge** | Note-type pill hard-coded in `NoteNode.tsx:30`, `index.astro`, `[noteId].astro`; `LibBadge.astro` is a starter leftover | S-05, S-06 (group headers by type) |
| **Alert / Notice** | `ServerError.tsx`, `ImageFailureNotice.tsx`, `RelationChangeNotice.tsx`, `Banner.astro` each build their own box; there is no success intent at all | S-05 (green only for success) |
| **Collapsible / Accordion** | None exists | S-06 (groups collapsed, expand to notes) |
| **Separator** | Not found as a component; dividers are ad-hoc borders | S-05 (grey ornaments), optional |
| **Skeleton / Spinner** | Loading states are text-only (`MESSAGES.IMAGE_FULL_LOADING` in `NoteImages.tsx`; "Deleting…" in `DeleteNoteButton.tsx:61`) | Optional |

Not needed per this inspection: Table (no tabular data in the inspected views), Tabs, Toast (no toast use found; notices are inline).

Radix packages installed (`package.json:27-29`): only `react-alert-dialog`, `react-dialog` and `react-slot`. Adding shadcn Select, Collapsible or Accordion would add Radix packages. Input, Card, Badge, Alert and Separator are pure-markup shadcn components with no new runtime dependency. `lucide-react` is already present (`package.json:41`) for the destructive-action icon.

## Code References

- `src/styles/global.css:10-43`: `:root` tokens (light neutral, the ones in effect)
- `src/styles/global.css:45-77`: `.dark` tokens (never activated)
- `src/styles/global.css:79-115`: `@theme inline` publishing
- `src/styles/global.css:117-119`: `bg-cosmic` hex gradient utility
- `components.json:6-11`: shadcn CSS entry and neutral base color
- `src/layouts/Layout.astro:15,38`: `<html>` without a `dark` class; footer `bg-[#0a0e1a]`
- `src/components/ui/button.tsx:12-19`: button variants
- `src/components/ui/dialog.tsx:57-64`: dialog close button
- `src/components/ui/alert-dialog.tsx:120-146`: Action/Cancel wrap `Button` (Cancel defaults to `outline`)
- `src/components/notes/DeleteNoteButton.tsx:34,53`: delete trigger (raw red link), destructive action
- `src/components/notes/NoteImages.tsx:63-66`: image-popup content override
- `src/components/memory-map/MemoryMap.tsx:69`: `colorMode="dark"`
- `src/components/memory-map/NoteNode.tsx:25-30`: hard-coded node and type badge
- `context/foundation/materials/dnd-color-palette.md`: target palette, contrast table, destructive-action rules

## Architecture Insights

- The app's real theme lives in the components, not in tokens. The shadcn token layer exists and is correctly wired, but almost no app markup consumes it. Re-theming through tokens alone (FR-001/FR-002, "applied through shared palette tokens") therefore requires migrating the 289 class occurrences onto semantic classes first, or simultaneously.
- Because `.dark` is unused and the app is dark-only, the simplest consistent model is to put the D&D values directly in `:root`, and to either delete `.dark` or make it identical. Otherwise shadcn `dark:` variants inside `button.tsx` keep diverging from what renders.
- Primitive edits (`textarea.tsx`, `label.tsx`) have already drifted from shadcn's semantic classes. Restoring tokens there propagates to every consumer.

## Historical Context (from prior changes)

Not investigated for this request. The S-05 roadmap entry (`context/foundation/roadmap.md:147-158`) and the palette file are the relevant prior decisions. S-04 (constants-sweep, `context/archive/2026-10-13-constants-sweep/`) only concerned messages and status codes, not styles.

## Related Research

None under `context/changes/**/research.md` covers styling.

## Open Questions

> Questions 1-3 are answered by the follow-up below ("Follow-up 2026-10-14: reference materials vs Open Questions 1-3"). The remaining `/10x-plan` decisions are listed there.

1. **Token mapping**: how do the palette's 5 (+1) colors map onto shadcn's 31 tokens? A likely mapping: background → `--background`; ornament → `--card`/`--secondary`/`--muted`/`--border`; parchment → `--foreground` and `*-foreground`; gold → `--primary`/`--ring`; red → `--destructive`. New `--success` and `--destructive-foreground` would also need publishing. Owner: `/10x-plan`.
2. **Palette coverage**: the palette has no value for `--muted-foreground` (secondary text), `--input`, chart colors or the sidebar set. Muted text needs a derived parchment shade with verified AA contrast. Owner: `/10x-plan`.
3. **Map contrast**: node, edge and type-badge colors need WCAG AA checks against `#1B1814`, and React Flow's own dark CSS variables (`--xy-*`) may need overriding. This research did not measure contrast. Owner: `/10x-plan`.
4. **Fate of `.dark`, `bg-cosmic`, the gradient headings, `Welcome.astro` star field and `Banner.astro`**: replace, re-token or delete. This is a product choice for the theme.
5. **Unused leftovers**: is `LibBadge.astro` used anywhere? No import was found in `src/`; confirm it before deleting.

---

## Follow-up 2026-10-14: reference materials vs Open Questions 1-3

**Question**: can `context/foundation/materials/index-example.css` (a shadcn theme file, 181 lines) and `context/foundation/materials/layout-example.tsx.txt` (a Next.js root layout, 39 lines) be translated, mapped or applied directly to answer Open Questions 1 (token mapping), 2 (palette coverage) and 3 (map contrast)?

**Method**: each oklch value in the example was converted to sRGB hex, and each palette hex to oklch, with the standard OKLab matrices. WCAG 2.x contrast ratios were computed from relative luminance. Scripts are not committed. React Flow's variables were read from `node_modules/@xyflow/react/dist/style.css` (installed `^12.12.0`, `package.json:35`). Font subsets were read from the Google Fonts `css2` endpoint. The Astro Fonts API was checked through Context7 (`/withastro/docs`).

### Verdict

- **Q1, mapping: answered by the example. Partly a direct copy, with edits.** The example's 5 core oklch values round-trip exactly to the 5 palette hexes. It also adds 3 derived shades. Its `.dark` block is the shadcn token mapping of the D&D palette. Its `:root` block is a light "parchment" variant that this app does not need.
- **Q2, coverage: mostly answered. Two tokens need corrected values and one is still missing.** The example fills every shadcn token, including `--destructive-foreground`, chart and sidebar. But its dark `--muted-foreground` fails AA and its dark `--input` makes form-field borders invisible. There is no `--success`.
- **Q3, map contrast: not answered by the example.** It has nothing for React Flow. The measured pairs below show that React Flow's dark defaults fail on `#1B1814`, and they show which example values pass.
- **The file cannot be pasted over `global.css` as is.** The example omits `@import "tw-animate-css"` and the `@xyflow/react` stylesheet import (`global.css:2,4-6`). Both are in use. The example also activates its dark values only under `.dark`, and no element in `src/` has that class (see section 1).
- **`layout-example.tsx.txt` cannot be applied.** It uses `next/font/google` and Next's `Metadata`, which do not exist in Astro. Its intent translates to Astro's stable Fonts API (details at the end).

### Q1: example values vs palette

| Example oklch | Hex | Palette role |
|---|---|---|
| `0.2110 0.0090 75.1278` | `#1B1814` | Background |
| `0.2840 0.0144 76.3009` | `#2E2922` | Ornaments / panels |
| `0.8973 0.0370 86.1738` | `#E8DCC2` | Text (parchment) |
| `0.7308 0.1154 85.1872` | `#C9A24A` | Accent (gold) |
| `0.4946 0.1550 26.8750` | `#A8322D` | Danger (blood red) |
| `0.8564 0.0476 89.5858` | `#DCCFAD` | Not in palette. Darker parchment, used only in the light `:root` |
| `0.5837 0.0549 79.3586` | `#8D7856` | Not in palette. Muted brown: dark `--muted-foreground`, `--chart-4` |
| `0.4416 0.0322 77.7862` | `#5D513F` | Not in palette. Mid brown: dark `--chart-3` |

The palette has no green, so the optional `#5E8C5A` (oklch `0.5934 0.0898 142.49`) does not occur in the example.

**Dark-block mapping (`index-example.css:60-92`)**, grouped by palette role:

| Palette role | Tokens in the example `.dark` |
|---|---|
| Background `#1B1814` | `--background`, `--input`, `--sidebar`, all `*-foreground` on gold (`--primary-foreground`, `--accent-foreground`, `--sidebar-primary-foreground`) |
| Ornament `#2E2922` | `--card`, `--popover`, `--secondary`, `--muted`, `--border`, `--sidebar-accent`, `--sidebar-border` |
| Parchment `#E8DCC2` | `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--destructive-foreground`, `--sidebar-foreground` |
| Gold `#C9A24A` | `--primary`, `--accent`, `--ring`, `--chart-1`, `--sidebar-primary`, `--sidebar-ring`, `--sidebar-accent-foreground` |
| Red `#A8322D` | `--destructive`, `--chart-2` |
| Muted brown `#8D7856` | `--muted-foreground`, `--chart-4` |

This matches the "likely mapping" in Open Question 1 with two differences. `--accent` is gold, not ornament. And `--input` is the background color.

**`--accent` = gold changes hover states.** Today shadcn uses `accent` as a hover surface: `hover:bg-accent` on the outline and ghost buttons (`button.tsx:16,18`) and `data-[state=open]:bg-accent` on the dialog close button (`dialog.tsx`). With the example's value, those hovers turn gold, and outline/ghost text turns `--accent-foreground` (background color). That keeps 7.37:1, but a neutral Cancel (outline) would flash gold on hover. The palette says gold is "the single positive accent" and Cancel should be neutral. Choice for `/10x-plan`: keep `--accent` gold, or set `--accent` to ornament / a lighter brown so neutral buttons stay neutral.

**What the example adds beyond colors**: `--destructive-foreground` (published in its `@theme inline`, line 129). Font tokens (`--font-sans/serif/mono`, lines 93-95, published at 147-149). `--radius: 0rem` (square corners). A shadow scale (`--shadow-*`). Letter spacing (`--tracking-*`, `body { letter-spacing }`). The current `global.css` has none of these except `--radius`. Notes on applying them:
- `--radius: 0rem` makes `--radius-sm` = `calc(0rem - 4px)` and `--radius-md` = `calc(0rem - 2px)`. Per CSS Values, a `calc()` result outside a property's range is clamped, so `border-radius` renders 0. It is harmless but square corners are a visual choice. The app currently uses literal `rounded-lg/xl/2xl/full` in many class strings (section 4), and those use Tailwind's fixed radius scale, so they stay rounded unless migrated to tokens.
- The dark `--shadow-2xl` has alpha `2.00` (line 110), which clamps to 1. Harmless.
- `--spacing: 0.25rem` in `:root` equals Tailwind's default, so it changes nothing.
- `--tracking-normal: 0.05em` widens all body text through `body { letter-spacing }`. This is a visual choice.

### How to apply the example given that `.dark` is never activated

The example keeps the `@custom-variant dark (&:is(.dark *))` model (line 3), the same as `global.css:8`. Two options would render its dark values:
- **(a) Put the example's `.dark` values in `:root`, and delete or align `.dark`.** This matches the Architecture Insight above. Consequence: `dark:` variants inside `button.tsx` (lines 14, 16, 18) stop applying, so those buttons use only their base classes. This is the simpler model for a dark-only app.
- **(b) Add `class="dark"` to `<html>` in `Layout.astro:15`.** This uses the example as written. But `&:is(.dark *)` matches only descendants of `.dark`, so with the class on `<html>` the `dark:` variants apply to everything below `<html>`. `MemoryMap` already passes `colorMode="dark"`, which sets its own `.react-flow.dark` scope. The light `:root` would then become dead code instead of `.dark`.

Either option works with the token names. Choosing between them is a `/10x-plan` decision. Option (a) removes the light parchment block, which nothing in the PRD asks for.

### Q2: coverage and contrast of the example's dark tokens

Contrast is measured against `#1B1814` (background) and `#2E2922` (card/panel). AA = 4.5:1 for normal text, 3:1 for large text and for UI component boundaries (WCAG 1.4.11).

| Pair (example dark tokens) | Ratio | Result |
|---|---|---|
| `--foreground` parchment on background | 13.01 | Pass |
| parchment on card/ornament | 10.61 | Pass |
| `--primary` gold on background | 7.37 | Pass |
| gold on card | 6.01 | Pass |
| `--primary-foreground` (background) on gold | 7.37 | Pass |
| `--destructive-foreground` parchment on red | 4.89 | Pass (normal text) |
| **`--muted-foreground` `#8D7856` on background** | **4.17** | **Fail for normal text**, pass for large text |
| **`--muted-foreground` `#8D7856` on card** | **3.40** | **Fail for normal text** |
| `--border` ornament on background | 1.23 | Fails 1.4.11 if the border is the only boundary cue |
| **`--input` (= background) as a field border on card** | **1.23** | **Fails 1.4.11.** On the page background it is the same color and invisible |
| red `#A8322D` as text/outline on background | 2.66 | Fails 4.5:1 and 3:1 |
| `#5E8C5A` green (not in example) on background | 4.53 | Pass, barely |
| background text on green | 4.53 | Pass, barely |
| parchment on green | 2.87 | Fail |

The palette file's own figures are approximate (12:1, 7:1, 4.9:1, 1.3:1). The exact ratios above agree within rounding, except parchment on background, which is 13.0, not ~12.

**What still needs a value or a correction:**
1. **`--muted-foreground`.** Replace `#8D7856` for text use. Parchment blended over the background passes on both surfaces from 60% opacity upward. At 70% (`#AAA18E`) it is 6.90 on background and 5.63 on card. At 65% (`#A09785`) it is 6.11 and 4.98. The example's `#8D7856` remains fine for decoration such as icons, chart lines and edges, which need 3:1.
2. **`--input`.** The example value (background color) makes input borders invisible on the background. `#8D7856` as `--input` gives 4.17 on background and 3.40 on card, which passes the 3:1 boundary rule on both. `#5D513F` gives 2.29/1.86 and fails.
3. **`--success` / `--success-foreground`.** These are missing from both the example and the app. With `#5E8C5A`, the foreground must be the background color (4.53), not parchment (2.87). The palette file does not say this.
4. **Red as text or outline.** The palette file suggests "red text or a red outline" for lighter in-list delete actions. `#A8322D` on the background is 2.66:1, so that use fails AA for text and the 3:1 boundary rule. Today's in-list trigger (`DeleteNoteButton.tsx:34`, `text-red-300`) is exactly that case. Options: a parchment-text trigger with a trash icon, or a separate lighter red for text-on-dark. A lighter red is a new value that the palette does not have.
5. **Chart and sidebar tokens** are filled by the example. No usage of `sidebar` or `chart-N` classes was found in `src/**/*.{tsx,astro,ts}`, so their values do not affect rendering today.

### Q3: memory-map colors

The example has no React Flow values. React Flow 12 styles read `var(--xy-<name>, var(--xy-<name>-default))` (for example `style.css:139` edge stroke, `:27` background, `:423-431` controls), so setting the non-`-default` names on `.react-flow` (or `:root`) overrides the dark defaults without touching the library. `MemoryMap.tsx:69` sets `colorMode="dark"`, which applies the `.react-flow.dark` defaults (`style.css:53-96`).

| Map element | Current value | Ratio on `#1B1814` | Candidate from the example | Ratio |
|---|---|---|---|---|
| Edge stroke | `#3e3e3e` (`--xy-edge-stroke-default`, dark) | 1.65 (fails 3:1) | muted brown `#8D7856` | 4.17 |
| | | | gold `#C9A24A` | 7.37 |
| Background dots | `#555` | 2.37 | decorative, no AA requirement; `#5D513F` gives 2.29 | — |
| Flow background | `#141414` (`--xy-background-color-default`, dark) | — | set to `var(--background)` so the map matches the page | — |
| Node boundary | `NoteNode.tsx:25` `border-white/10 bg-white/5` | — | card `#2E2922` fill: 1.23 vs background (fails 3:1 as the only cue); `--input`-style `#8D7856` border: 4.17 | 4.17 |
| Node text | `text-white` | — | parchment on card | 10.61 |
| Type badge | `bg-purple-500/30 text-purple-200` (`NoteNode.tsx:30`) | — | shadcn default badge (background text on gold) | 7.37 |
| | | | secondary badge (parchment on ornament) | 10.61 |
| | | | gold text on 20% gold over card (`#4D412A`), measured as a blended color | 4.16 (fails 4.5) |
| Controls buttons | `#2b2b2b` bg, `#f8f8f8` text, `#5b5b5b` border | — | secondary (parchment on ornament), `#8D7856` border | 10.61 / 4.17 |

Whether a note node counts as a "graphical object" under 1.4.11 depends on reading the guideline. The node's name text identifies it on its own. Edges carry the relation, so their 3:1 matters most. Final choices belong to `/10x-plan`. The table gives measured candidates from values already in the example.

### `layout-example.tsx.txt`: fonts in Astro

- `next/font/google` and `Metadata` (`layout-example.tsx.txt:3-4,22`) are Next.js only. The Astro equivalent is the stable Fonts API: a top-level `fonts` array in `astro.config.mjs` with `fontProviders.google()`, `name` and `cssVariable`, plus `<Font cssVariable="…" />` from `astro:assets` in the `<head>` of `Layout.astro`. Astro's docs say to register Tailwind 4 fonts through `@theme inline { --font-sans: var(--font-xyz); }`. The installed Astro is `^7.3.2` (`package.json:36`). This research did not build with the Fonts API on the Cloudflare adapter, so that combination is unverified.
- The example puts `--font-sans: Cinzel, serif` straight into `:root` (line 93), and `@theme inline` re-exports it. In Astro, use a separate Fonts-API variable (for example `--font-cinzel`) and map `--font-sans` to it in `@theme inline`. That avoids two declarations of the same name.
- **Subsets**: the example requests only `subsets: ["latin"]`. The app has Polish text with diacritics (`src/lib/config-status.ts` matched `[ąęłśżźćń…]`). Google Fonts serves `latin-ext` for all three families: Cinzel (latin, latin-ext), Lora (also cyrillic and vietnamese), Courier Prime (latin, latin-ext). `latin-ext` must be included.
- **Cinzel as `--font-sans`**: Tailwind's preflight uses `--font-sans` as the default font, so every piece of body text, including long notes, would render in Cinzel. Cinzel is an inscription-style font with capitals only, so lowercase letters render as small caps. This is a known design property of the family. It was not rendered in this session. Choice for `/10x-plan`: Cinzel for headings only (for example a `--font-heading` token), with Lora for body text.

### Decisions handed to `/10x-plan`

Settled by evidence:
- The token mapping is the example's `.dark` block (table above). It uses the palette's exact 5 colors.
- Three dark tokens must deviate from the example: `--muted-foreground`, `--input`, and the new `--success`/`--success-foreground`.
- React Flow is themed by overriding `--xy-*` (non-`-default`) variables. Its dark defaults fail 3:1 for edges on the new background.
- Fonts need the Astro Fonts API with `latin-ext`, not `next/font`.

Genuine choices:
- Activation model (a) dark values in `:root` vs (b) `class="dark"` on `<html>`.
- `--accent` gold (as in the example) vs neutral, which decides whether neutral and Cancel buttons turn gold on hover.
- Radius `0rem` and `tracking-normal 0.05em`: adopt or skip.
- Cinzel for body text or for headings only.
- How lighter in-list delete actions look, since red text fails AA on the background.
- Edge color: muted brown (`#8D7856`) or gold.
