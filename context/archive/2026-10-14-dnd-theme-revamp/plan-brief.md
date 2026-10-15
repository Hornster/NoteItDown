# D&D Theme Revamp — Plan Brief

> Full plan: `context/changes/dnd-theme-revamp/plan.md`
> Research: `context/changes/dnd-theme-revamp/research.md`

## What & Why

Roadmap slice S-05 (FR-001, FR-002, FR-014, FR-015): the user sees the D&D palette on every page — dark background, parchment text, brown ornaments — with buttons colored by meaning: gold primary, red only for destructive actions with icon and label, a neutral Cancel with default focus, green only for success. It is applied through shared tokens so a later mobile milestone changes layout, not colors, and it fixes the light-themed alert dialog and the low-contrast image-popup close button.

## Starting Point

`src/styles/global.css` holds stock shadcn neutral tokens (light `:root` renders, `.dark` is dead code). The real look is a purple/blue "cosmic glass" theme hard-coded in components: 289 color-class occurrences in 34 files, plus hex literals. Input, Select, Card, Badge and Alert don't exist; their markup is copy-pasted.

## Desired End State

Every page renders in the palette with unchanged structure and link placement. Dialogs are dark; the popup close button reads over any image. The note-saved notice is green-bordered, errors are light red with an icon, and the in-list Delete is a light-red trash-icon action. Map edges and nodes pass contrast. Headings are in Cinzel, body text in Lora. Two unit tests keep hard-coded colors out and token contrast at AA.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Token mapping | `index-example.css` `.dark` block, palette's exact 5 colors | Its core values round-trip exactly to the palette hexes | Research |
| Activation model | D&D values directly in `:root`, `.dark` deleted, `@custom-variant dark` kept inert | Dark-only app; a second mode adds nothing | Plan (evidence) |
| Token corrections | `--muted-foreground #AAA18E`, `--input #8D7856`, new `--success #5E8C5A` / `--success-foreground` = background | The example values fail AA, or the token is missing | Research |
| `--accent` | Neutral brown `#4A4135` | Cancel and ghost buttons stay neutral on hover; gold remains the single positive accent | Plan |
| Fonts | Cinzel headings, Lora body, Astro Fonts API, latin + latin-ext | D&D feel without capitals-only note bodies; Polish diacritics | Plan |
| In-list delete | New `--destructive-text #E57368` (5.88:1), trash icon + "Delete" label, `destructive-text` button variant | Palette red as text is 2.66:1; filled red stays for the final confirmation | Plan |
| Error messages | Light red + alert icon (same `--destructive-text`) | Universal error convention, AA-compliant | Plan |
| Decor and shape | Remove `bg-cosmic`, gradients, glass blur and star field; keep the current corner radii and spacing | Pure color change, so FR-014 layouts don't shift | Plan |
| Primitives | Add Input, native Select, Card, Badge, Alert; Collapsible left to S-06 | Collapses duplicated markup with no new Radix dependency | Plan |
| Success style | Card surface, green border and check icon, parchment text, gold links | Gold links on a green fill fail contrast | Plan (evidence) |
| Map colors | Edges muted brown `#8D7856` (4.17:1), outline type badge, no gold | Gold is reserved for S-07's found-node marking | Plan (evidence) |
| Regression guard | Vitest scan of `src/` for palette classes and color literals, plus a token-contrast test | Runs in CI and the unit suite; cheap | Plan |
| Verification | On-demand Playwright screenshot project (before/after) + e2e Cancel-focus assertion | Repeatable FR-014 evidence; the focus rule is pinned | Plan |

## Scope

**In scope:**
- Token layer and React Flow variable overrides in `global.css`
- Fixes to `button`, `dialog`, `alert-dialog`, `textarea` and `label`
- 5 new primitives; deleting `LibBadge.astro`
- Migrating every component and all 12 pages
- Fonts via the Astro Fonts API, with OFL credits on `/licenses`
- Guard and contrast unit tests, the screenshot script and the Cancel-focus e2e
- Convention notes in CLAUDE.md, `contract-surfaces.md` and lessons

**Out of scope:**
- Light mode or a toggle
- Square corners, letter spacing, shadow scale
- Collapsible/search (S-06) and gold node marking (S-07)
- Committed visual baselines
- Layout or mobile changes
- Mono font, Safari checks

## Architecture / Approach

Contract before pixels. `global.css` is the only place color values live (hex tokens in `:root`, published via `@theme inline`). The primitives in `src/components/ui/` export `cva` variants (`buttonVariants`, `cardVariants`, `badgeVariants`, `alertVariants`). React islands render the components; `.astro` pages apply the variants to their own elements, so nothing extra hydrates. Only color/surface classes change; geometry classes stay at call sites. The map is themed through React Flow's `--xy-*` variables pointing at tokens.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baseline evidence | Screenshot project, 17 "before" PNGs, Cancel-focus e2e | Seeding data (relation, image) in the script |
| 2. Token contract & primitives | D&D tokens, contrast test, fixed dialogs/button, 5 new primitives | Intermediate state: pages still paint their own colors |
| 3. Shared components | Chrome, auth, notes, campaigns and map node on tokens | Breaking e2e contracts (`role="status"` `<p>` count, accessible names) |
| 4. Pages & guard | 12 pages migrated, leftovers deleted, guard test, conventions recorded | Layout drift on FR-014 pages |
| 5. Fonts & final evidence | Cinzel/Lora via Fonts API, OFL credits, "after" PNGs | Fonts API unproven on the Cloudflare adapter |

**Prerequisites:** S-04 done (yes). Local Supabase running for e2e/screenshots. Branch `dnd-theme-revamp`.
**Estimated effort:** ~4–5 sessions across 5 phases; Phases 3 and 4 are the wide ones (~30 files).

## Open Risks & Assumptions

- The Astro Fonts API has not been proven on `@astrojs/cloudflare`. Phase 5 stops and reports before choosing a fallback; the color work stands without it.
- Builds download the fonts from Google Fonts every time (no CI cache). An outage fails the build loudly; retry is the accepted remedy.
- Cinzel/Lora metrics may shift spacing slightly. Under FR-014 this is checked manually against screenshots, not prevented.
- The guard is regex-based: dynamically composed class names could slip past it. Review covers that.
- `--destructive-text` and `--accent` are derived values not in the palette file; they are documented in `contract-surfaces.md`.

## Success Criteria (Summary)

- Every page shows only palette colors, and buttons read by meaning (gold, red with icon, neutral focused Cancel, green success).
- Header/footer and new/edit note layouts match their "before" screenshots in structure and placement; image attach and popup work in Chromium and Firefox.
- `npm run test:unit` fails on any reintroduced hard-coded color or sub-AA token pair; the e2e suite stays green.
