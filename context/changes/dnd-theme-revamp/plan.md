# D&D Theme Revamp Implementation Plan

## Overview

Re-theme every page of NoteItDown to the D&D "dungeon at torchlight" palette (`context/foundation/materials/dnd-color-palette.md`) through shadcn design tokens, with buttons colored by meaning: gold primary, red only for destructive actions (always with icon + label), neutral outlined Cancel with default focus, green only for success. Add five themed UI primitives so pages consume tokens through components, migrate every hard-coded color onto them, add Cinzel (headings) and Lora (body) fonts, and lock the result in with a hard-coded-color scan and a token-contrast unit test. Roadmap slice S-05; PRD FR-001, FR-002, FR-014, FR-015.

## Current State Analysis

From `context/changes/dnd-theme-revamp/research.md` (complete, commit 9132d34) plus planning-time checks:

- **One stylesheet**, `src/styles/global.css` (128 lines): stock shadcn neutral tokens in `:root` (light, the ones that render) and `.dark` (never activated: no `class="dark"` anywhere in `src/`). `@theme inline` publishes all 31 color tokens + 4 radius steps. Missing: `--destructive-foreground`, any success token, any font token. `bg-cosmic` utility (`global.css:117-119`) holds hex literals.
- **The real theme lives in components**: 289 hard-coded color class occurrences in 34 files (research §4 table), plus hex/rgba literals in `Banner.astro` `<style>`, `Welcome.astro` star field, `Layout.astro` footer and `bg-cosmic`. Purple = primary/links, `white/*` = panels/text, `red-*` = errors and the delete trigger.
- **Primitives** in `src/components/ui/`: `alert-dialog`, `button`, `dialog` (shadcn, mostly semantic but overlays use `bg-black/50`, destructive uses `text-white`, `dark:` variants inert), `label` and `textarea` (drifted to hard-coded colors), `LibBadge.astro` (unused, no import in `src/`). No Input, Select, Card, Badge or Alert; their markup is copy-pasted.
- **Dialog bugs named in FR-001**: alert-dialog content is `bg-background` = white today; the image-popup (`NoteImages.tsx:63-66`) overrides content to `bg-black/80` while its close button (`dialog.tsx:57-64`) takes light-neutral `accent`/`muted-foreground` → low contrast.
- **Memory map**: `MemoryMap.tsx:69` `colorMode="dark"` → React Flow dark defaults; edge stroke `#3e3e3e` is 1.65:1 on `#1B1814` (fails 3:1). `NoteNode.tsx:25-30` hard-coded white/purple.
- **Tests couple to accessible names and roles, not colors**: `tests/e2e/notes-relations.spec.ts:68,70` clicks `button "Delete"` (trigger) and `alertdialog → button "Delete"` (confirm); `expectNotice` (`:76-81`) locates `getByRole("status")` and counts its `<p>` children exactly.
- **Radix already autofocuses Cancel**: `node_modules/@radix-ui/react-alert-dialog/dist/index.mjs:58-60` focuses `cancelRef` on open. Nothing tests it.
- **Success messages exist**: `RelationChangeNotice.tsx` (`role="status"`, "Note saved" / "Note deleted" + relation links). Errors: `ServerError.tsx`, `ImageFailureNotice.tsx`, `FormField.tsx` validation, `DeleteNoteButton.tsx` dialog error, `Banner.astro`.
- **Fonts**: Astro `^7.3.2` has the stable Fonts API (top-level `fonts` with `fontProviders.google()`, `cssVariable`, `subsets`, `fallbacks`; `<Font cssVariable preload />` from `astro:assets`; Tailwind 4 registration via `@theme inline { --font-sans: var(--font-x); }`, confirmed via Context7 `/withastro/docs`). Not yet proven on `@astrojs/cloudflare` `^14.3.4`. The app shows Polish diacritics → `latin-ext` required.

## Desired End State

- Every page renders on the `#1B1814` background with parchment text, ornament-brown panels and gold links/primary buttons; no purple, blue, gradient headings, glass blur or star field remains.
- Buttons by meaning: gold `default`; filled red `destructive` only for the delete confirmation; light-red `destructive-text` trigger with a trash icon + "Delete" label on the note page; neutral outlined Cancel (parchment border, transparent fill) focused when the delete dialog opens.
- Alert dialog and image popup are dark-themed; the popup close button is a parchment icon on a card chip with a visible border, readable over any image.
- The "Note saved / Note deleted" notice uses the green success style (card surface, green border + check icon, parchment text, gold links); errors use light red + alert icon.
- Map: brown background matching the page, muted-brown edges (4.17:1), card-surface nodes with a muted-brown border, outline type badge, themed controls.
- Headings in Cinzel, body in Lora (latin + latin-ext), served by the Astro Fonts API from the Cloudflare build; OFL notices on the licenses page.
- `src/styles/theme-guard.test.ts` fails on any hard-coded color in `src/`; `src/styles/theme-contrast.test.ts` fails if a token pair drops below its WCAG threshold.
- FR-014: header/footer link placement and new/edit note layouts unchanged in structure and placement, confirmed against before/after screenshots.

Verify with: `npm run lint`, `npm run test:unit`, `npx astro check`, `npm run build`, `npm run test:e2e`, plus the screenshot comparison and manual Chromium + Firefox checks below.

### Key Discoveries:

- Token mapping = `context/foundation/materials/index-example.css:60-92` (`.dark` block), whose 5 core values are exactly the palette hexes (research Q1), with the deviations listed in Phase 2.
- `button.tsx:16` outline/ghost hover uses `accent`; `dialog.tsx` close uses `data-[state=open]:bg-accent` → the `--accent` value decides whether neutral buttons stay neutral.
- `alert-dialog.tsx:139-146` `AlertDialogCancel` already defaults to `variant="outline"`, so Cancel styling is controlled from `button.tsx`.
- React Flow 12 reads `var(--xy-<name>, var(--xy-<name>-default))` (`node_modules/@xyflow/react/dist/style.css:27,139,423-431`), so setting the non-`-default` names overrides the dark defaults without touching the library.
- `shadcn` already exports `buttonVariants`; the same pattern (exported `cva` variants) lets `.astro` pages style `<a>`/`<div>` without hydrating React.
- `playwright.config.ts:9` `testMatch: "**/*.spec.ts"`, single `chromium` project; `test:e2e` is bare `playwright test`, so any new project would also run in CI unless `test:e2e` is pinned to `--project=chromium`.

## What We're NOT Doing

- No light mode, no theme toggle, no `class="dark"` activation model; `.dark` block is deleted.
- No square corners (`--radius: 0`), no `--tracking-normal` letter spacing, no shadow scale from the example file: current corner radii and spacing stay.
- No glass/backdrop-blur effects, gradient headings, `bg-cosmic` or star field (all removed, not recolored).
- No Collapsible/Accordion or search Input wiring (S-06), no gold found-node marking (S-07).
- No committed visual-regression baselines (`toHaveScreenshot`); screenshots are evidence for a manual comparison only.
- No layout restructuring: geometry classes (padding, width, radius, gap, flex/grid) stay at call sites; only color/surface classes change. Mobile layout is out of scope (later milestone).
- No Courier Prime / mono font.
- No change to `src/lib/images/compress.ts` canvas fill (`#fff` is image processing, not UI theming; allowlisted in the guard).
- No Safari verification (parked per PRD FR-015).

## Implementation Approach

Evidence first, then contract before pixels: (1) capture "before" screenshots and pin the Cancel-focus rule while the UI is untouched; (2) define the token contract and primitives so every later edit has a semantic target; (3) migrate shared components; (4) migrate pages, delete the leftovers and turn on the hard-coded-color guard once it can pass; (5) add fonts last so a Fonts-API/Cloudflare problem cannot block the color work, then capture "after" screenshots.

Styling primitives export their `cva` variants (`buttonVariants`, `badgeVariants`, `cardVariants`, `alertVariants`) as the single source of styling. React islands render the components; `.astro` pages either render the component server-side (no `client:*` directive) or apply the exported variants to their own element via `cn()`.

## Critical Implementation Details

**Token values are hex, in `:root`.** The palette is specified in hex and the contrast test parses `:root` with a simple `--name: #rrggbb` pattern, so write every color token as a 6-digit hex (not oklch). `global.css` is the only file allowed to contain color literals.

**Keep `@custom-variant dark (&:is(.dark *))`.** With `.dark` deleted it makes any `dark:` utility inert everywhere except inside the memory map: `colorMode="dark"` (`MemoryMap.tsx:69`) adds the `dark` class to `.react-flow`, so `dark:` classes in NoteNode or any primitive rendered there would activate. Hence no `dark:` class anywhere in `src/` (criterion 2.6). Deleting the custom variant would make Tailwind fall back to `prefers-color-scheme`, so `dark:` classes shipped by shadcn would start applying on dark-OS machines. Strip the existing `dark:` classes from `button.tsx` instead.

**Notice markup is a test contract.** `RelationChangeNotice` must keep `role="status"` on the outer element and add no `<p>` inside it (`expectNotice` counts `<p>` children); `ImageFailureNotice` keeps `role="alert"`. The Alert primitive therefore sets no default role and lets the caller pass one; its title/description slots are `<div>`s.

**Accessible names stay identical.** Every icon added to a button or link (trash, alert, check) gets `aria-hidden="true"`, so `button "Delete"`, `button "Cancel"`, `button "Sign out"` etc. resolve exactly as before.

**Playwright wipes `test-results/` on every run.** Screenshots go to a separate gitignored folder (`.screenshots/theme/<label>/`) so the "before" set survives the "after" run.

## Phase 1: Baseline evidence

### Overview

Before any styling edit, add a repeatable screenshot script and capture the "before" set; pin the "Cancel has default focus" rule with an e2e assertion (passes today thanks to Radix).

### Changes Required:

#### 1. Screenshot project

**File**: `playwright.config.ts`, `package.json`, `.gitignore`

**Intent**: Add a second Playwright project that only runs on demand, so screenshots reuse the e2e preview server and preflight without joining the CI e2e run.

**Contract**: New project `{ name: "screenshots", testMatch: "screenshots/**/*.shot.ts", use: Desktop Chrome }`; the `chromium` project keeps the config-level `**/*.spec.ts` match. `package.json`: `test:e2e` becomes `playwright test --project=chromium`; new `test:screenshots` = `playwright test --project=screenshots`. `.gitignore` gains `.screenshots/`. Update `TESTING.md` and the CLAUDE.md Commands list with `test:screenshots` (label via `SHOT_LABEL` env, output folder).

#### 2. Theme screenshot script

**File**: `tests/e2e/screenshots/theme.shot.ts` (new)

**Intent**: Capture full-page PNGs of every themed surface into `.screenshots/theme/${SHOT_LABEL ?? "adhoc"}/`, with stable names so before/after pairs line up.

**Contract**: Seeding runs once in `beforeAll`: `createTestUser()` (`tests/support/test-user.ts`, one auth call, auto-created campaign), then one UI sign-in in a fresh context (pattern of `signInViaUi` in `notes-relations.spec.ts`) whose session is saved with `context.storageState()`. Through that signed-in page it creates two notes where one mentions the other (so a relation and a map edge exist) and uploads one generated PNG (≈64×64, `setInputFiles` on `#images`) to a note. Signed-in tests reuse the session via `test.use({ storageState })` or `browser.newContext({ storageState })`; no test depends on another test's side effects. `note-saved-notice` performs its own edit and shoots right after the redirect (the notice is one-shot, consumed from sessionStorage on render). `delete-dialog` and `image-popup` open their overlay inside their own test and never confirm the delete. Auth budget: 2 calls per run (`createTestUser` + one UI sign-in). Shots (file name = key): `home`, `signin`, `signup`, `confirm-email`, `licenses` (signed out); `dashboard` (redirects to the campaign page), `campaign-new`, `campaign-edit`, `note-new`, `note-view`, `note-edit`, `note-saved-notice`, `delete-dialog` (dialog open), `image-popup` (popup open, close button visible), `map` (waits until 2 `.react-flow__node` and 1 `.react-flow__edge` are visible), `header` (viewport shot, top of the dashboard), `footer` (viewport shot, scrolled to the bottom of the dashboard). Uses `waitForHydration` before interacting with islands. Every shot passes `animations: "disabled"` and `caret: "hide"`; `fullPage: true` except the dialog/popup/header/footer shots. Each shot is its own `test` so one failure does not hide the others.

#### 3. Cancel default-focus assertion

**File**: `tests/e2e/notes-relations.spec.ts`

**Intent**: Pin FR-002's "Cancel has default focus" so the restyle cannot regress it.

**Contract**: In `deleteNoteViaUi`, after clicking the trigger and before confirming, assert `page.getByRole("alertdialog").getByRole("button", { name: "Cancel" })` `toBeFocused()`. Literal "Cancel" (e2e oracles never import `MESSAGES`, per lessons.md).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- e2e suite passes including the new Cancel-focus assertion: `npm run test:e2e`
- `npm run test:e2e` does not run the screenshot project: `npm run test:e2e -- --list | grep -c "\[screenshots\]"` = 0
- Screenshot run produces all 17 PNGs: `npm run build && SHOT_LABEL=before npm run test:screenshots` then `ls .screenshots/theme/before | wc -l` = 17

#### Manual Verification:

- The "before" PNGs show the current cosmic/purple UI with data present (notes, relation edge, image, notice, open dialogs)
- No `src/` file changed in this phase (`git diff --stat main -- src` empty)

**Implementation Note**: Check for a running dev/preview server before testing (lessons.md). After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Token contract and primitives

### Overview

Replace the token layer with the D&D mapping, add the derived tokens the palette lacks, theme React Flow through its variables, fix the existing shadcn primitives and add Input, Select, Card, Badge and Alert. Pages still paint their own hard-coded colors after this phase; dialogs and anything already on tokens turn dark.

### Changes Required:

#### 1. Token layer

**File**: `src/styles/global.css`

**Intent**: Make the D&D palette the only token set, dark-only, with every value used by components defined and published.

**Contract**: `:root` holds `--radius: 0.625rem` (unchanged) and these hex values; `.dark` block deleted; `@custom-variant dark` kept (see Critical Implementation Details); `@theme inline` publishes every color token below as `--color-<name>` (adds `destructive-foreground`, `destructive-text`, `success`, `success-foreground`).

| Token(s) | Value | Note |
|---|---|---|
| `--background`, `--sidebar`, `--primary-foreground`, `--sidebar-primary-foreground`, `--success-foreground` | `#1B1814` | palette background |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground`, `--destructive-foreground`, `--sidebar-foreground` | `#E8DCC2` | parchment |
| `--card`, `--popover`, `--secondary`, `--muted`, `--border`, `--sidebar-accent`, `--sidebar-border` | `#2E2922` | ornament |
| `--primary`, `--ring`, `--chart-1`, `--sidebar-primary`, `--sidebar-ring`, `--sidebar-accent-foreground` | `#C9A24A` | gold |
| `--accent` | `#4A4135` | **deviation**: neutral hover surface so Cancel/ghost never turn gold (parchment on it 7.36:1) |
| `--muted-foreground` | `#AAA18E` | **deviation**: parchment at 70% over background (6.90:1 bg, 5.63:1 card); example `#8D7856` fails 4.5:1 |
| `--input` | `#8D7856` | **deviation**: field borders visible (4.17:1 bg, 3.40:1 card); example value was invisible |
| `--destructive`, `--chart-2` | `#A8322D` | palette red (fills only) |
| `--destructive-text` | `#E57368` | **new**: red for text/icons/borders on dark surfaces (5.88:1 bg, 4.80:1 card) |
| `--success` | `#5E8C5A` | **new**: palette's optional green (icon/border 4.53:1 bg, 3.69:1 card) |
| `--chart-3` | `#5D513F` | decorative only (map dots) |
| `--chart-4` | `#8D7856` | |
| `--chart-5` | `#DCCFAD` | |

React Flow overrides (unlayered, scoped to `.react-flow`), each pointing at a token: `--xy-background-color` → `--background`; `--xy-background-pattern-color` → `--chart-3`; `--xy-edge-stroke` → `--input`; controls button background → `--secondary`, hover → `--accent`, color → `--secondary-foreground`, border → `--input`. Verify each variable name exists in `node_modules/@xyflow/react/dist/style.css` before using it. `bg-cosmic` stays until Phase 4 (pages still use it). Base layer unchanged (`body` already `bg-background text-foreground`).

#### 2. Token contrast test

**File**: `src/styles/theme-contrast.test.ts` (new)

**Intent**: Turn the measured contrast table into a regression test so a future token edit cannot silently break AA.

**Contract**: Reads `src/styles/global.css` as text, extracts `:root` `--name: #hex` pairs, computes WCAG 2.x ratios and asserts: foreground on background ≥ 4.5 and on card ≥ 4.5; primary on background ≥ 4.5; primary-foreground on primary ≥ 4.5; muted-foreground on background and card ≥ 4.5; destructive-foreground on destructive ≥ 4.5; destructive-text on background and card ≥ 4.5; accent-foreground on accent ≥ 4.5; success-foreground on success ≥ 4.5; input on background and card ≥ 3; success on background and card ≥ 3; ring on background and card ≥ 3 (focus indicator; popover = card). Also asserts no `.dark {` block exists. Fails with the pair name and measured ratio.

#### 3. Existing primitives

**File**: `src/components/ui/button.tsx`

**Intent**: Buttons express meaning purely through tokens; Cancel (outline) is the palette's neutral parchment-outlined button.

**Contract**: Remove every `dark:` class. Base focus ring at full strength: `focus-visible:ring-ring` (drop `/50`; gold on popover is 6.01:1, at 50% it is 2.62:1, below 3:1). `destructive`: `bg-destructive text-destructive-foreground hover:bg-destructive/90`, and drop `focus-visible:ring-destructive/20` (invisible on dark) so it uses the base gold ring. `outline`: parchment border (`border-foreground`), transparent fill, `text-foreground`, `hover:bg-accent hover:text-accent-foreground`. New variant `destructive-text`: transparent, `text-destructive-text`, underline on hover, for in-list delete triggers. `default`, `secondary`, `ghost`, `link` keep their token classes. Invalid state uses `destructive-text` for border/ring.

**File**: `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`

**Intent**: Dialogs are dark panels; the close button is readable over any content (fixes the image-popup close button).

**Contract**: Overlays `bg-black/50` → `bg-background/80`. Content `bg-background` → `bg-popover text-popover-foreground` with `border-border`. `DialogContent` close button: a chip with `bg-card text-foreground border border-input`, full opacity, `hover:bg-accent`, focus ring `ring-ring`; drop the `data-[state=open]:bg-accent`/`text-muted-foreground` classes. No behavior change.

**File**: `src/components/ui/textarea.tsx`, `src/components/ui/label.tsx`

**Intent**: Restore the drifted primitives to tokens so every consumer follows.

**Contract**: Textarea: `border-input bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring`, invalid → `border-destructive-text`. Label: `text-foreground` (or `text-muted-foreground` where the current hierarchy is secondary; keep it consistent with `FormField` labels). Props/signatures unchanged.

**File**: `src/components/ui/LibBadge.astro`

**Intent**: Delete the unused starter leftover (no import in `src/`, confirmed).

**Contract**: File removed.

#### 4. New primitives

**File**: `src/components/ui/input.tsx`, `src/components/ui/select.tsx`, `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/alert.tsx` (new)

**Intent**: Give every repeated surface/control one token-based implementation (shadcn "new-york" shape, pure markup, no new Radix dependency).

**Contract**:
- `Input`: `React.ComponentProps<"input">`, Textarea's color, focus and invalid classes plus `w-full` only: no `min-h`, padding or radius (Textarea's `min-h-40 rounded-lg px-3 py-2` stays in Textarea); call sites pass their geometry. File inputs styled with `file:` utilities on tokens.
- `Select`: wrapper around native `<select>` (`React.ComponentProps<"select">`), the same color, focus and invalid classes and no geometry (not even `w-full`, so the compact CampaignSwitcher keeps its size); `<option>` elements get `bg-popover text-popover-foreground` via a child selector so consumers drop their `bg-slate-800` options.
- `Card`: `div` with `cardVariants` (`bg-card text-card-foreground border border-border`); **no padding or radius defaults** so call sites keep their geometry (FR-014). Export `cardVariants`.
- `Badge`: shadcn badge with `default` (gold), `secondary`, `outline` (`border-input text-foreground`) variants; export `badgeVariants`.
- `Alert`: `alertVariants` with `default` (card surface, `border-border`), `destructive` (card surface, `border-destructive-text`, icon and text `text-destructive-text`), `success` (card surface, `border-success`, icon `text-success`, text `text-foreground`). `AlertTitle`/`AlertDescription` are `div`s. No default `role`; caller passes `role`. Layout is flex, not the shadcn `has-[>svg]` grid (both notices carry a trailing dismiss button): `Alert` = `flex items-start gap-3`, leading icon `[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0.5`, `AlertDescription` = `flex-1 min-w-0`, and any child after it (e.g. a dismiss `<button>`) stays last with `shrink-0`. Consumers move their existing content `<div>` (with its `<p>` children) into `AlertDescription` and keep the dismiss button as the last child.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass, including the new contrast test: `npm run test:unit`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- e2e passes (dialogs restyled, names and focus unchanged): `npm run test:e2e`
- No `.dark` selector in `global.css` and no `dark:` class anywhere in `src/`: `grep -rn "dark:" src; grep -n "^\.dark" src/styles/global.css` both empty

#### Manual Verification:

- Delete dialog opens as a dark ornament panel with parchment text, filled red "Delete" and parchment-outlined Cancel; Cancel hover is brown, not gold; opened via keyboard (Tab to "Delete", Enter), Cancel shows the gold focus ring (opened by mouse, `:focus-visible` does not apply to Radix's programmatic focus; focus itself is pinned by the e2e assertion)
- Image popup close button is clearly visible over a light and a dark image (Chromium and Firefox)
- Map shows brown background, muted-brown edges and themed controls

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Shared components

### Overview

Migrate the layout chrome and every shared component onto tokens and the new primitives. Only color/surface classes change; geometry classes stay.

**Nested-panel rule** (applies here and in Phase 4): top-level surfaces use `cardVariants()`. A panel rendered inside a card (picker image rows, image thumbnails/placeholders, sub-panels on pages) uses `border border-input bg-background`, a darker inset well. `--card`, `--muted` and `--border` share `#2E2922`, so card-on-card would have no visible boundary; `--input` on card is 3.40:1.

**Leftover mappings** (classes no section below names): decorative field icons (`text-white/40` spans in FormField/NoteForm) and icon-only buttons (image remove X, notice dismiss) → `text-muted-foreground hover:text-foreground`; pending spinners on submit buttons (`border-white/30 border-t-white`) → `border-current/30 border-t-current` (inherits `primary-foreground`); the "Add image" `<label>` styled as a button → `border-input text-foreground hover:bg-accent` with its geometry kept; base text such as the Topbar container `text-white/80` and the NoteNode name `text-white` → `text-foreground`.

### Changes Required:

#### 1. Layout chrome

**File**: `src/layouts/Layout.astro`, `src/components/Topbar.astro`, `src/components/Banner.astro`

**Intent**: Header, footer and config banner on tokens, with link placement untouched (FR-014).

**Contract**: Footer `bg-[#0a0e1a] text-blue-100/60` → `bg-background border-t border-border text-muted-foreground`, link hover underline unchanged. Topbar container → `cardVariants` surface; email text `text-muted-foreground`; nav links and the Sign out button → `text-primary hover:text-primary/80 hover:underline`. Banner keeps its scoped `<style>` and variants but every color becomes `var(--token)`: `error` = card background, `--destructive-text` text and border; `warning` = card background, foreground text, `--primary` border; `info` = card background, foreground text, `--input` border.

#### 2. Auth components

**File**: `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx`, `ServerError.tsx`, `SignUpForm.tsx`

**Intent**: Forms use Input/Label and the default (gold) button; errors use light red with an icon.

**Contract**: `FormField` renders `Input` + `Label`, keeps `inputBase`'s geometry (`rounded-lg px-3 py-2 pl-10`, `transition-colors`) as the `className` passed to `Input`, and passes `aria-invalid={error ? true : undefined}` to `Input`, so the primitive's `aria-invalid:` style draws the light-red border (replaces the conditional `border-red-400/60 focus:ring-red-400` class); its error text → `text-destructive-text` with an `aria-hidden` `CircleAlert` icon (keep the existing `<p>` error element; there is no error id or `aria-describedby` today, and none is added). `SubmitButton` drops the `bg-purple-600 … hover:bg-purple-500 text-white` override and uses the `default` variant (geometry classes like width stay). `PasswordToggle` → `text-muted-foreground hover:text-foreground`. `ServerError` → `Alert variant="destructive"` with the existing `CircleAlert` icon, same text. `SignUpForm` hint text → `text-muted-foreground`.

#### 3. Notes components

**File**: `src/components/notes/DeleteNoteButton.tsx`

**Intent**: In-list trigger is a light-red text action with trash icon + label; the dialog error uses the error style.

**Contract**: Trigger → `Button variant="destructive-text" size="sm" className="h-auto p-0"` (stays inline with the adjacent "Edit" text link, `[noteId].astro:77-89`) with `<Trash2 aria-hidden />` + `{MESSAGES.DELETE_LABEL}` (accessible name stays "Delete"). Confirm stays `AlertDialogAction variant="destructive"`, add the same trash icon. Dialog error `text-destructive` → `text-destructive-text`. Cancel untouched (outline default, Radix focus).

**File**: `src/components/notes/NoteImages.tsx`

**Intent**: Image thumbnails and popup on tokens; popup no longer overrides the content to `bg-black/80`.

**Contract**: Popup `DialogContent` className keeps geometry (`w-auto max-w-[95vw] p-2 sm:max-w-[95vw]`) and drops color overrides (inherits `bg-popover`, the Phase 2 close-button chip). Thumbnail ring → `ring-ring`; loading text → `text-muted-foreground`; error text → `text-destructive-text`; thumbnail buttons and unavailable placeholders → nested-panel rule (they sit inside the note page card).

**File**: `src/components/notes/NoteForm.tsx`, `src/components/notes/NoteImagePicker.tsx`

**Intent**: Note create/edit form on primitives with layout untouched (FR-014).

**Contract**: Raw `<select>` → `Select` (drop `bg-slate-800` options); raw `<input>` → `Input`; purple submit override → `default` variant; content `Textarea` gets `aria-invalid={contentError ? true : undefined}` and the type `Select` gets `aria-invalid={!isNewType && typeError ? true : undefined}` (invalid border, same as FormField); errors `red-300` → `text-destructive-text`; `MESSAGES.IMAGES_LOAD_FAILED` (`amber-200` today) → `text-destructive-text`, it is a failure message; other `amber-200` hints → `text-primary` (gold highlight) or `text-muted-foreground` where it is plain help text; `white/*` panels (picker image rows) → nested-panel rule (the form sits inside the page card); `blue-100/*` text → `text-foreground` / `text-muted-foreground` preserving the current primary/secondary hierarchy. Labels/ids unchanged (e2e uses `getByLabel("Content")`, `getByLabel("Type")`).

**File**: `src/components/notes/RelationChangeNotice.tsx`

**Intent**: The "Note saved / Note deleted" notice is the green success notice.

**Contract**: Outer element → `Alert variant="success"` with `role="status"` and an `aria-hidden` `CircleCheck` icon; inner `<p>` structure unchanged (no added `<p>`); relation links → `text-primary underline hover:text-primary/80`; dismiss button → `text-muted-foreground hover:text-foreground`, same `aria-label`.

**File**: `src/components/notes/ImageFailureNotice.tsx`

**Intent**: Image-failure notice uses the error style.

**Contract**: Outer → `Alert variant="destructive"` with `role="alert"` and an `aria-hidden` `CircleAlert` icon; list and dismiss button as in RelationChangeNotice.

#### 4. Campaign components

**File**: `src/components/campaigns/CampaignForm.tsx`, `src/components/campaigns/CampaignSwitcher.tsx`

**Intent**: Same migration as the note form.

**Contract**: Purple submit override → `default` variant; switcher `<select>` → `Select`, keeping its own geometry (`max-w-[10rem] truncate rounded-lg px-2 py-1 text-xs sm:max-w-[14rem] sm:text-sm`); NoteForm's type `Select` keeps `w-full appearance-none rounded-lg px-3 py-2 pl-10`; `white/*` → tokens.

#### 5. Memory map node

**File**: `src/components/memory-map/NoteNode.tsx`

**Intent**: Nodes readable on the brown map without using gold (reserved for S-07 found-node marking).

**Contract**: Box → `bg-card text-card-foreground border border-input hover:bg-accent` (geometry and `MAP_NODE_*` sizing unchanged); type pill → `Badge variant="outline"`. `MemoryMap.tsx` keeps `colorMode="dark"` (colors come from the Phase 2 `--xy-*` overrides); `StraightEdge.tsx` unchanged.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- e2e passes (notice role/paragraph structure, Delete/Cancel names, form labels unchanged): `npm run test:e2e`
- No hard-coded palette class or hex literal remains in `src/components/` and `src/layouts/` (`Welcome.astro` excluded, it is Phase 4): `grep -rnE '(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|placeholder|decoration|caret|ring-offset)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-[0-9]{2,3})?(/[0-9]{1,3})?\b|-\[#|#[0-9a-fA-F]{3,6}\b' src/components src/layouts --exclude=Welcome.astro` returns nothing

#### Manual Verification:

- Header and footer links sit in the same places as in `.screenshots/theme/before/header.png` and `footer.png`
- Note page shows the light-red "Delete" trigger with trash icon; dialog confirm is filled red with icon; Cancel is neutral
- Saving a note shows the green-bordered success notice with readable gold relation links; dismiss works
- Sign-in with a wrong password shows the light-red error with icon; form fields have visible borders; submitting an empty field shows a light-red border on that field
- Map nodes, outline type badges and edges are legible; clicking a node still navigates

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Pages and guard

### Overview

Migrate the 12 pages and `Welcome.astro`, delete the decorative leftovers, then add the hard-coded-color guard test (green from the start) and record the convention.

### Changes Required:

#### 1. Pages

**File**: `src/pages/index.astro` + `src/components/Welcome.astro`, `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/campaigns/new.astro`, `src/pages/campaigns/[campaignId]/{index,edit,map}.astro`, `src/pages/campaigns/[campaignId]/notes/{new,[noteId]}.astro`, `src/pages/campaigns/[campaignId]/notes/[noteId]/edit.astro`, `src/pages/licenses.astro`

**Intent**: Every page on the palette with structure and placement unchanged.

**Contract**: Mechanical rules applied per page:
- `bg-cosmic` wrapper → plain wrapper (body already `bg-background`), keep `min-h-screen`/padding/flex classes.
- Glass panel `rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl` → `cardVariants()` + the same geometry (`rounded-2xl p-8 …`), no blur.
- Sub-panels `border-white/10 bg-white/5` → `cardVariants()` when top-level; inside a card → the Phase 3 nested-panel rule (`border border-input bg-background`), not `bg-muted` (same hex as card).
- Gradient heading `bg-gradient-to-r from-… to-… bg-clip-text text-transparent` → `text-foreground` (palette: headings are parchment).
- Dashed empty-state boxes `border-dashed border-white/20 bg-white/5` (`campaigns/[campaignId]/index.astro:74`, `map.astro:50`) → nested-panel rule, keeping `border-dashed`.
- `<a>` styled as primary button (`bg-purple-600 … hover:bg-purple-500`) → `buttonVariants()` with the existing size/geometry.
- `<a>` styled as outlined secondary button (`border border-white/20 … hover:bg-white/10`; `campaigns/[campaignId]/index.astro:54`, `Welcome.astro:37`) → `buttonVariants({ variant: "outline" })` with the existing size/geometry.
- Text links `text-purple-300 hover:text-purple-100` → `text-primary hover:text-primary/80`.
- `text-blue-100/*`, `text-white/*` → `text-foreground` (≥ 80% opacity today) or `text-muted-foreground` (< 80%).
- Note-type pills in `campaigns/[campaignId]/index.astro:92` and `[noteId].astro:90` → `badgeVariants({ variant: "outline" })`.
- `amber-200` → `text-primary`, except failure messages: `[noteId].astro:113` `NOTE_IMAGES_LOAD_FAILED` → `text-destructive-text` (errors are light red).
- `Welcome.astro`: remove the inline `style` star field and the three blurred glow orbs (`Welcome.astro:7-9`, deleted, not recolored); same rules as above.

#### 2. Remove leftovers

**File**: `src/styles/global.css`

**Intent**: Delete the `bg-cosmic` utility once nothing uses it.

**Contract**: `@utility bg-cosmic` removed; `grep -rn bg-cosmic src` empty.

#### 3. Hard-coded color guard

**File**: `src/styles/theme-guard.test.ts` (new)

**Intent**: Fail CI and the unit run when a hard-coded color returns anywhere in `src/`.

**Contract**: Walks `src/**/*.{astro,tsx,ts,css}` excluding `*.test.ts`. Fails on (a) Tailwind palette classes: `(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|placeholder|decoration|caret|ring-offset)-(<the 22 Tailwind palette names>|white|black)(-\d{2,3})?(\/\d{1,3})?` (research §4 regex, including variant prefixes); (b) arbitrary color classes `-[#…]`, `-[rgb(…)]`; (c) `#rgb`/`#rrggbb`/`rgb(`/`rgba(`/`hsl(` literals in any file other than `src/styles/global.css`. Explicit allowlist (file + reason): `src/lib/images/compress.ts` (canvas fill). Failure message lists `file:line: match`. Self-test in the same file so a broken matcher or walk cannot stay green: the matcher flags `hover:bg-purple-500`, `text-white/60`, `bg-[#0a0e1a]`, `rgba(0,0,0,.5)` and does not flag `text-primary`, `bg-background`, `border-input`; the walk returns > 0 `.astro` and > 0 `.tsx` files. Note: it lives in the `unit` project, so CI and `npm run test:unit` run it; the per-edit `related` hook will not (no import graph link), which is acceptable.

#### 4. Record the convention

**File**: `CLAUDE.md` (Key conventions), `docs/reference/contract-surfaces.md`, `context/foundation/lessons.md` (via `/10x-lesson`)

**Intent**: The next agent uses tokens and primitives instead of colors, and S-06/S-07 know the load-bearing token names.

**Contract**: CLAUDE.md bullet: colors only through semantic tokens/primitives (`src/components/ui/`), guard = `theme-guard.test.ts`, token values only in `global.css`. contract-surfaces.md: a "Theme tokens" section naming `--primary` (gold: primary/links/S-07 marking), `--destructive`/`--destructive-text` (destructive actions and errors), `--success` (success notices only), `--accent` (neutral hover), and the `destructive-text` button variant. lessons.md entry recorded through `/10x-lesson` (not hand-edited).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass, including the new guard: `npm run test:unit`
- Type check passes: `npx astro check`
- Build succeeds: `npm run build`
- e2e passes: `npm run test:e2e`
- `grep -rn "bg-cosmic\|backdrop-blur\|bg-clip-text" src` returns nothing

#### Manual Verification:

- Guard proves itself: temporarily add `text-purple-300` to any component, `npm run test:unit` fails naming that file:line; revert
- Every page (signed in and signed out) shows only palette colors; no purple/blue remains
- New-note and edit-note pages match the structure and placement of their "before" screenshots (`npm run build && SHOT_LABEL=phase4 npm run test:screenshots`, compare `note-new`/`note-edit` against `before/`)
- Long note text on the note page is comfortable to read (parchment on brown)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 5.

---

## Phase 5: Fonts and final evidence

### Overview

Add Cinzel for headings and Lora for body through the Astro Fonts API, prove it works in the Cloudflare build, credit the fonts, and capture the "after" screenshots for the FR-014 comparison.

### Changes Required:

#### 1. Font registration

**File**: `astro.config.mjs`

**Intent**: Self-host both families from Google Fonts at build time, including Polish diacritics.

**Contract**: Top-level `fonts` array (import `fontProviders` from `astro/config`): `{ provider: fontProviders.google(), name: "Cinzel", cssVariable: "--font-cinzel", weights: [600, 700], subsets: ["latin", "latin-ext"], fallbacks: ["serif"] }` and `{ provider: fontProviders.google(), name: "Lora", cssVariable: "--font-lora", weights: [400, 600, 700], subsets: ["latin", "latin-ext"], fallbacks: ["serif"] }`. Weights match usage: headings and dialog titles are `font-semibold`/`font-bold` only; no italic is used anywhere in `src/`, so normal style only.

#### 2. Font loading and tokens

**File**: `src/layouts/Layout.astro`, `src/styles/global.css`

**Intent**: Lora is the default text font; Cinzel applies to headings and dialog titles.

**Contract**: `<Font cssVariable="--font-lora" preload={[{ weight: "400", style: "normal", subset: "latin" }]} />` (a bare `preload` preloads every face) and `<Font cssVariable="--font-cinzel" />` (from `astro:assets`) in `<head>`. `@theme inline`: `--font-sans: var(--font-lora)` and `--font-heading: var(--font-cinzel)` (gives a `font-heading` utility). Base layer: `h1, h2, h3, [data-slot="dialog-title"], [data-slot="alert-dialog-title"]` use `var(--font-heading)`.

#### 3. Font licenses

**File**: `src/pages/licenses.astro`, `src/assets/licenses/ofl-1.1.txt` (new)

**Intent**: The self-hosted font files are redistributed, so credit them under the SIL Open Font License.

**Contract**: A separate `fontNotices` array (the existing `notices` renders `version` and its intro is HEIC-specific) with Cinzel and Lora entries (name, license "OFL-1.1", copyright line and source URL taken from each family's Google Fonts `OFL.txt`; no version), rendered under its own `<h2>` with a one-sentence font intro and the same card markup as `notices`. The OFL 1.1 text (`?raw` import) is a `<pre>` block after the GPL block, styled like the LGPL/GPL blocks. Strings used once stay inline (lessons.md duplication boundary).

#### 4. After screenshots

**Intent**: Produce the "after" evidence set.

**Contract**: `npm run build && SHOT_LABEL=after npm run test:screenshots` → `.screenshots/theme/after/` with the same 17 names as `before/`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Type check passes: `npx astro check`
- Build succeeds on the Cloudflare adapter and emits font files: `npm run build && find dist/client -name '*.woff2' | grep -c .` ≥ 1
- e2e passes: `npm run test:e2e`
- After-screenshot run produces all 17 PNGs: `SHOT_LABEL=after npm run test:screenshots && ls .screenshots/theme/after | wc -l` = 17

#### Manual Verification:

- In `npm run preview`, DevTools shows Lora on body text and Cinzel on h1/dialog titles; font requests return 200 from the app's own origin
- Polish diacritics (the config-missing banner text, or a note named "Zażółć gęślą jaźń") render in Lora/Cinzel, not the fallback
- FR-014: each before/after pair compared; header/footer link placement and new/edit note layouts unchanged in structure and placement; any font-caused spacing shift is noted and accepted or fixed
- FR-015: attach an image and open the popup in Chromium and Firefox; close button visible and working
- Licenses page lists Cinzel and Lora with the OFL text

**Implementation Note**: If the Fonts API fails on the Cloudflare adapter (build error or fonts not served in preview), stop and report before choosing a fallback; the color work from Phases 1–4 stands on its own. Accepted risk: `fontProviders.google()` downloads the fonts during every `astro build` (CI keeps no font cache), so a Google Fonts outage fails CI or deploy builds loudly; retry, do not vendor the files unless it recurs.

---

## Testing Strategy

### Unit Tests:

- `theme-contrast.test.ts`: every text/foreground pair ≥ 4.5:1, every boundary/icon pair ≥ 3:1, against both background and card where both occur; no `.dark` block.
- `theme-guard.test.ts`: no hard-coded color classes or literals in `src/` outside `global.css` and the allowlist. Proven once manually by injecting a violation.

### Integration Tests:

- No change; no data or API behavior is touched.

### E2E Tests:

- Existing suite unchanged and green after every phase (it pins accessible names, `role="status"` notice structure, labels and navigation).
- New assertion: Cancel is focused when the delete dialog opens.
- `tests/e2e/screenshots/theme.shot.ts`: on-demand evidence, not part of CI.

### Manual Testing Steps:

1. Compare each `.screenshots/theme/before/*.png` with its `after/` pair (FR-014).
2. Note page → Delete → dialog: Cancel focused, Cancel hover neutral, confirm filled red with icon; Escape closes.
3. Edit a note so a relation changes → green success notice with gold links.
4. Wrong password on sign-in → light-red error with icon.
5. Attach an image, open the popup over a light image, close it via the button (Chromium + Firefox).
6. Map: edges visible, nodes readable, node click navigates, controls usable.

## Performance Considerations

Two font families (Cinzel 600/700, Lora 400/600/700, normal style, latin + latin-ext) add font downloads; only Lora 400 latin is preloaded, everything else loads on demand. Removing `backdrop-blur` from ~10 panels reduces paint cost.

## Migration Notes

None: styling only, no data, routes or stored state change. Rollback = revert the branch.

## References

- Research: `context/changes/dnd-theme-revamp/research.md`
- Palette: `context/foundation/materials/dnd-color-palette.md`
- Token mapping source: `context/foundation/materials/index-example.css:60-92`
- Roadmap slice: `context/foundation/roadmap.md` S-05
- PRD: `context/foundation/prd-v2.md` FR-001, FR-002, FR-014, FR-015
- Radix Cancel autofocus: `node_modules/@radix-ui/react-alert-dialog/dist/index.mjs:58-60`
- e2e contracts: `tests/e2e/notes-relations.spec.ts:65-81`
- Astro Fonts API: Context7 `/withastro/docs` (guides/fonts, reference/configuration-reference `fonts`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baseline evidence

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — bb1c1ab
- [x] 1.2 e2e suite passes including the new Cancel-focus assertion: `npm run test:e2e` — bb1c1ab
- [x] 1.3 `npm run test:e2e` does not run the screenshot project (`--list` shows no `[screenshots]` tests) — bb1c1ab
- [x] 1.4 Screenshot run produces all 17 "before" PNGs — bb1c1ab

#### Manual

- [x] 1.5 The "before" PNGs show the current UI with data present — bb1c1ab
- [x] 1.6 No `src/` file changed in this phase — bb1c1ab

### Phase 2: Token contract and primitives

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — e23af22
- [x] 2.2 Unit tests pass, including the new contrast test: `npm run test:unit` — e23af22
- [x] 2.3 Type check passes: `npx astro check` — e23af22
- [x] 2.4 Build succeeds: `npm run build` — e23af22
- [x] 2.5 e2e passes (dialogs restyled, names and focus unchanged): `npm run test:e2e` — e23af22
- [x] 2.6 No `.dark` selector in `global.css` and no `dark:` class anywhere in `src/` — e23af22

#### Manual

- [x] 2.7 Delete dialog is dark with filled red Delete, neutral outlined Cancel focused on open (gold ring visible when opened via keyboard) — e23af22
- [x] 2.8 Image popup close button clearly visible over light and dark images (Chromium and Firefox) — e23af22
- [x] 2.9 Map shows brown background, muted-brown edges and themed controls — e23af22

### Phase 3: Shared components

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — e8602b0
- [x] 3.2 Unit tests pass: `npm run test:unit` — e8602b0
- [x] 3.3 Type check passes: `npx astro check` — e8602b0
- [x] 3.4 Build succeeds: `npm run build` — e8602b0
- [x] 3.5 e2e passes (notice structure, Delete/Cancel names, form labels unchanged): `npm run test:e2e` — e8602b0
- [x] 3.6 No hard-coded palette class or hex literal remains in `src/components/` and `src/layouts/` (Welcome.astro excluded) — e8602b0

#### Manual

- [x] 3.7 Header and footer links in the same places as the "before" screenshot — e8602b0
- [x] 3.8 Light-red Delete trigger with trash icon; filled red confirm with icon; neutral Cancel — e8602b0
- [x] 3.9 Green-bordered success notice with readable gold relation links; dismiss works — e8602b0
- [x] 3.10 Wrong-password error is light red with icon; form fields have visible borders; invalid field has a light-red border — e8602b0
- [x] 3.11 Map nodes, outline badges and edges legible; node click navigates — e8602b0

### Phase 4: Pages and guard

#### Automated

- [x] 4.1 Lint passes: `npm run lint`
- [x] 4.2 Unit tests pass, including the new guard: `npm run test:unit`
- [x] 4.3 Type check passes: `npx astro check`
- [x] 4.4 Build succeeds: `npm run build`
- [x] 4.5 e2e passes: `npm run test:e2e`
- [x] 4.6 No `bg-cosmic`, `backdrop-blur` or `bg-clip-text` left in `src`

#### Manual

- [x] 4.7 Guard fails on an injected `text-purple-300` naming file:line, then reverted
- [x] 4.8 Every page shows only palette colors
- [x] 4.9 New-note and edit-note pages match the structure of their "before" screenshots (`SHOT_LABEL=phase4` run)
- [x] 4.10 Long note text is comfortable to read

### Phase 5: Fonts and final evidence

#### Automated

- [ ] 5.1 Lint passes: `npm run lint`
- [ ] 5.2 Unit tests pass: `npm run test:unit`
- [ ] 5.3 Type check passes: `npx astro check`
- [ ] 5.4 Build succeeds on the Cloudflare adapter and emits font files
- [ ] 5.5 e2e passes: `npm run test:e2e`
- [ ] 5.6 After-screenshot run produces all 17 PNGs

#### Manual

- [ ] 5.7 Preview serves Lora on body and Cinzel on headings from the app origin
- [ ] 5.8 Polish diacritics render in the web fonts
- [ ] 5.9 FR-014 before/after comparison done; layouts unchanged in structure and placement
- [ ] 5.10 FR-015 image attach and popup checked in Chromium and Firefox
- [ ] 5.11 Licenses page lists Cinzel and Lora with the OFL text
