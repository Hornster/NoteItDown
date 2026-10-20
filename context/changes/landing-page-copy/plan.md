# Landing Page Copy Implementation Plan

## Overview

Replace the starter-template landing page with the NoteItDown copy fixed by PRD v3 (FR-001, FR-002 / US-02): the "NoteItDown" title, the new subtitle and three panels ("Make notes", "Keep noting", "Recall") with topical icons. The browser-tab title and the README stop saying "10x Astro Starter". A new e2e spec pins the copy so later changes (notably FR-015 in S-02) must update it on purpose. Roadmap slice S-01; hard deadline 2026-11-04.

## Current State Analysis

- `/` (`src/pages/index.astro`) renders `src/components/Welcome.astro` inside `src/layouts/Layout.astro` without a `title` prop.
- `src/components/Welcome.astro:14` h1 "10x Astro Starter"; `:16` subtitle "A production-ready starter with authentication, modern tooling, and a cosmic developer experience."; `:19-27` Sign In / Sign Up hero buttons; `:31-99` three `cardVariants()` cards with starter SVG icons (lock, layers, code brackets) and starter headings/texts ("Authentication Ready", "Modern Stack", "Developer Experience").
- `src/layouts/Layout.astro:12` default `title = "10x Astro Starter"` — the tab title of `/`; every other page passes its own title.
- `README.md:1-5` title "10x Astro Starter", the starter screenshot `./public/template.png` (referenced nowhere else) and the starter tagline; `:26-27` clone URL/`cd` point at `przeprogramowani/10x-astro-starter` (actual remote: `Hornster/NoteItDown`); `:206` note says smoke guards "the development of the starter itself".
- No test asserts landing copy: smoke only checks `/` returns 200 (`scripts/smoke.mjs:42`), the screenshot shot only captures `/` (`tests/e2e/screenshots/theme.shot.ts:121`).

## Desired End State

An anonymous visitor opening `/` sees a tab titled "NoteItDown", the h1 "NoteItDown", the subtitle "A TTRPG notepad that makes relations managing and data recall easy." and three panels with the exact PRD copy and topical icons; no starter text remains on the page. The existing Sign In / Sign Up buttons and Topbar stay; panels contain no actions or links. `npm run test:e2e` includes a landing spec that fails if the copy drifts. The README presents the project as NoteItDown.

### Key Discoveries:

- Exact copy (PRD v3 `context/foundation/prd-v3.md:131-133`):
  - Title: `NoteItDown`
  - Subtitle: `A TTRPG notepad that makes relations managing and data recall easy.`
  - Make notes: `Note the NPC, note their quest and reference the NPC in the description`
  - Keep noting: `The references are updated automatically whenever you update, add or delete a note. Immediately.`
  - Recall: `Find where Boblin the Goblin lived through the interactive memory map with search capability.` (trimmed; the money clause is FR-015, shipped with S-02)
- Dictionary rule (`context/foundation/lessons.md`, "Use the central dictionaries in all code"): "NoteItDown" will appear twice in `src/` (h1 + Layout default title) → becomes a `MESSAGES` key with the `_TITLE` suffix (page-title fallback). All other landing strings appear once → stay inline. e2e oracles stay literal and never import `MESSAGES`.
- Color rule: icons keep `stroke="currentColor"` + `text-primary`; no palette classes or hex (guarded by `src/styles/theme-guard.test.ts`).
- e2e conventions: `tests/e2e/*.spec.ts`, `@playwright/test`, chromium project; signed-out specs need no `createTestUser` (no auth calls against the shared GoTrue rate limit).

## What We're NOT Doing

- No layout redesign, new call to action, links, or mobile work (PRD §Non-Goals) — card grid, hero and buttons keep their structure.
- No Recall money clause ("how much money he owes you") — FR-015, ships with S-02 (description-search).
- No change to the Sign In / Sign Up buttons, including for signed-in visitors (existing behavior).
- No fix of the README's stale CI section (still lists `ci`/`smoke` jobs instead of `ci`/`local-stack`/`deploy`) or other README content beyond starter naming — observation only.
- No change to `src/lib/config-status.ts`'s `docsUrl` pointing at the starter repo's Supabase docs (operator-facing banner, still a valid doc link).
- No edits to the PRD copy itself (e.g. the missing final period on the "Make notes" text is kept verbatim — see Open Risks in the brief).

## Implementation Approach

Text-and-icon swap inside the existing `Welcome.astro` markup, one new `MESSAGES` key shared by the h1 and the Layout default title, a new signed-out e2e spec with literal oracles, then doc updates. Phase 1 alone satisfies the deadline-critical FR-001/FR-002; Phase 2 (README) is independent.

## Phase 1: Landing copy, icons and tab title

### Overview

Visitor-facing change: the landing page and its tab title show NoteItDown copy, pinned by a new e2e spec.

### Changes Required:

#### 1. App title message key

**File**: `src/lib/constants/messages.ts`

**Intent**: Add the app name once so the h1 and the default page title share it (used 2+ times in `src/`).

**Contract**: New key `APP_TITLE: "NoteItDown"` in `MESSAGES`, placed with the other page labels/titles.

#### 2. Default page title

**File**: `src/layouts/Layout.astro`

**Intent**: The tab title of `/` (and any page without its own title) becomes "NoteItDown".

**Contract**: `Props.title` default changes from the literal `"10x Astro Starter"` to `MESSAGES.APP_TITLE` (already imported).

#### 3. Landing hero and panels

**File**: `src/components/Welcome.astro`

**Intent**: Replace the h1, subtitle and the three card headings/texts with the PRD copy listed in Key Discoveries, in order Make notes → Keep noting → Recall, and swap the starter icons for topical ones.

**Contract**:
- h1 renders `MESSAGES.APP_TITLE` (import `MESSAGES`); subtitle text inline. Existing classes unchanged.
- Each card keeps its `cardVariants()` wrapper, h3 and p elements and classes; only text changes.
- Icons: replace the lock / layers / code SVGs with Lucide-style 24×24 stroke icons — a pencil (Make notes), a refresh/cycle arrows (Keep noting), a folded map (Recall) — keeping the existing SVG attributes (`stroke="currentColor"`, `stroke-width="2"`, `class="mb-4 text-primary"`) and adding `aria-hidden="true"` since they are decorative.
- Hero buttons (`/auth/signin`, `/auth/signup`) and `Topbar` untouched; panels contain no `<a>` or `<button>`.

#### 4. Landing e2e spec

**File**: `tests/e2e/landing.spec.ts` (new)

**Intent**: Pin FR-001/FR-002 in CI for an anonymous visitor so copy drift (including the future FR-015 Recall change) fails a test.

**Contract**: One signed-out test (no `createTestUser`, zero auth calls) that visits `/` and asserts, with literal strings (never importing `MESSAGES`):
- `page` title is `NoteItDown`; level-1 heading `NoteItDown`; subtitle text visible.
- Level-3 headings exactly `Make notes`, `Keep noting`, `Recall` in that order, each followed by its exact PRD text.
- None of `10x Astro Starter`, `Authentication Ready`, `Modern Stack`, `Developer Experience`, `production-ready starter` appears in the page body.
- The panels contain no links or buttons: scope each panel as `page.getByRole("heading", { level: 3, name }).locator("..")` and assert `getByRole("link")` and `getByRole("button")` have count 0 inside it (no markup changes).

#### 5. Test docs

**Files**: `TESTING.md`, `CLAUDE.md`

**Intent**: Keep the e2e scenario lists accurate.

**Contract**: Add "landing page copy (`landing.spec.ts`, 0 auth calls)" to the `npm run test:e2e` scenario list in `TESTING.md:28` and to the `test:e2e` command line in `CLAUDE.md` (edit `CLAUDE.md`, not `AGENTS.md`).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass (incl. theme guard): `npm run test:unit`
- Type/Astro check passes: `npx astro check`
- Build succeeds: `npm run build`
- New landing spec and full e2e suite pass against the fresh build: `npm run test:e2e`
- No starter copy left in `src/`: `grep -rn -E "10x Astro Starter|Authentication Ready|Modern Stack|Developer Experience|cosmic" src/` returns nothing

#### Manual Verification:

- In `npm run preview`, `/` shows the NoteItDown tab title, h1, subtitle and the three panels with the PRD copy and fitting pencil / refresh / map icons, in both light and dark themes
- Layout matches the previous page (same hero, buttons, three-card grid); no new links or actions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: README rename

### Overview

Repo-facing change: the README presents the project as NoteItDown instead of the starter template.

### Changes Required:

#### 1. README title and intro

**File**: `README.md`

**Intent**: Remove starter naming from the top of the README and describe the app.

**Contract**:
- `# 10x Astro Starter` → `# NoteItDown`.
- Remove the starter screenshot line `![](./public/template.png)`.
- Replace the starter tagline with the PRD subtitle plus one sentence on what the app does (notes linked by exact name, shown on a memory map).
- Clone block: `https://github.com/Hornster/NoteItDown.git` and `cd NoteItDown`.
- Smoke-test note (`README.md:206`): "development of the starter itself" → the app; rest of the note unchanged.

#### 2. Unused starter screenshot

**File**: `public/template.png`

**Intent**: The file is served publicly and referenced only by the removed README line; delete it so no starter asset ships.

**Contract**: File deleted; re-grep (`grep -rn "template.png" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=context .`) confirms no remaining reference before deleting.

### Success Criteria:

#### Automated Verification:

- No starter naming at the README top or clone block: `grep -n -E "10x Astro Starter|10x-astro-starter|template.png|starter template" README.md` returns nothing
- `public/template.png` is gone and unreferenced: `grep -rn "template.png" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=context .` returns nothing
- Build still succeeds: `npm run build`

#### Manual Verification:

- README renders correctly on GitHub (title, intro, clone instructions work from a fresh clone)
- After merge to `main` and the CI `deploy` job, the live landing page shows the new copy (deadline 2026-11-04)

---

## Testing Strategy

### Unit Tests:

- None new; `src/styles/theme-guard.test.ts` must stay green with the new SVGs.

### Integration Tests:

- `tests/e2e/landing.spec.ts` — anonymous visit to `/`, literal copy oracles, starter-string absence, no links/buttons inside panels.

### Manual Testing Steps:

1. `npm run build && npm run preview`, open `/` signed out: check tab title, h1, subtitle, panel order, texts and icons.
2. Toggle dark mode: icons and text use theme tokens.
3. Optionally `SHOT_LABEL=landing npm run test:screenshots` to capture `home` for a before/after look.

## Performance Considerations

None — static server-rendered copy.

## Migration Notes

None. Rollback is a revert of the change commits.

Release timing: production deploys only on push to `main` (CI `deploy` job). Merge after impl-review, no later than ~2026-11-02, so a failed deploy still has slack before the 2026-11-04 deadline.

## References

- Roadmap: `context/foundation/roadmap.md` S-01
- PRD: `context/foundation/prd-v3.md:105-110` (US-02), `:129-136` (FR-001, FR-002, FR-015)
- Landing component: `src/components/Welcome.astro:14-99`
- Default title: `src/layouts/Layout.astro:12`
- Signed-out screenshot of `/`: `tests/e2e/screenshots/theme.shot.ts:120-123`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Landing copy, icons and tab title

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 4fff7fa
- [x] 1.2 Unit tests pass (incl. theme guard): `npm run test:unit` — 4fff7fa
- [x] 1.3 Type/Astro check passes: `npx astro check` — 4fff7fa
- [x] 1.4 Build succeeds: `npm run build` — 4fff7fa
- [x] 1.5 New landing spec and full e2e suite pass against the fresh build: `npm run test:e2e` — 4fff7fa
- [x] 1.6 No starter copy left in `src/` — 4fff7fa

#### Manual

- [x] 1.7 Preview `/` shows NoteItDown tab title, h1, subtitle and three panels with PRD copy and topical icons, light and dark — 4fff7fa
- [x] 1.8 Layout matches the previous page; no new links or actions — 4fff7fa

### Phase 2: README rename

#### Automated

- [x] 2.1 No starter naming at the README top or clone block
- [x] 2.2 `public/template.png` is gone and unreferenced
- [x] 2.3 Build still succeeds: `npm run build`

#### Manual

- [x] 2.4 README renders correctly on GitHub
- [ ] 2.5 After merge to `main` and the CI `deploy` job, the live landing page shows the new copy (deadline 2026-11-04)
