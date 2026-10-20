# Landing Page Copy — Plan Brief

> Full plan: `context/changes/landing-page-copy/plan.md`

## What & Why

Replace the starter-template landing page with NoteItDown's own copy (PRD v3 FR-001, FR-002, US-02). It is the first thing a new visitor sees, it still advertises "10x Astro Starter", and it is required for the course submission on 2026-11-04 (roadmap S-01).

## Starting Point

`/` renders `src/components/Welcome.astro`: h1 "10x Astro Starter", a starter subtitle, Sign In / Sign Up buttons and three starter cards (Authentication Ready, Modern Stack, Developer Experience) with lock / layers / code icons. `Layout.astro` defaults the tab title to "10x Astro Starter"; the README is still the starter's. No test checks landing copy.

## Desired End State

A visitor on `/` sees the tab and h1 "NoteItDown", the subtitle "A TTRPG notepad that makes relations managing and data recall easy." and three panels — Make notes, Keep noting, Recall (trimmed map sentence, no money clause yet) — with pencil / refresh / map icons, same layout, no new links. An e2e spec fails on any copy drift. The README presents NoteItDown.

## Key Decisions Made

| Decision        | Choice                                                    | Why (1 sentence)                                                                 |
| --------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Panel icons     | Topical inline SVGs (pencil, refresh, map), same styling  | No starter imagery left while keeping the card layout unchanged.                 |
| Scope           | Page + default tab title + README                         | No starter naming left for visitors or repo readers.                             |
| Testing         | New `tests/e2e/landing.spec.ts`, literal oracles, 0 auth calls | Pins FR-001/FR-002 in CI so S-02 must update the Recall copy (FR-015) on purpose. |
| App name string | `MESSAGES.APP_TITLE` shared by h1 and Layout default      | Used twice in `src/`, so the dictionary lesson makes it a key; other copy inline. |
| Recall copy     | Trimmed sentence only                                     | PRD: money clause ships with description search (FR-015, S-02).                  |
| Starter image   | Delete `public/template.png`                              | Referenced only by the README line being removed.                                |

## Scope

**In scope:**
- `Welcome.astro` text and icons, `Layout.astro` default title, one `MESSAGES` key
- New landing e2e spec; e2e scenario lists in `TESTING.md` and `CLAUDE.md`
- README title, intro, clone URL, smoke note; delete `public/template.png`

**Out of scope:**
- Layout redesign, new CTAs/links, mobile (PRD Non-Goals)
- Recall money clause (FR-015 → S-02)
- README's stale CI section and other non-naming README content
- `config-status.ts` starter docs link (operator banner)

## Architecture / Approach

Text-and-icon swap inside existing Astro markup; no data, API or styling-token changes. Icons keep `currentColor` + `text-primary` so the theme guard stays green. The e2e spec runs signed out against the production preview like the other specs.

## Phases at a Glance

| Phase                                   | What it delivers                                        | Key risk                                                   |
| --------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Landing copy, icons and tab title    | New landing page + tab title, pinned by e2e spec, docs  | Copy typo vs PRD — mitigated by literal e2e oracles         |
| 2. README rename                        | README presents NoteItDown, starter screenshot removed  | Low — doc-only                                             |

**Prerequisites:** none (S-01 has no dependencies); local Supabase + fresh build for `npm run test:e2e`.
**Estimated effort:** ~1 short session across 2 phases.

## Open Risks & Assumptions

- PRD "Make notes" text has no final period while the other two panels end with one; kept verbatim as the user's fixed copy — adjust in the PRD first if a period is wanted.
- Production must be deployed (merge to `main`) before 2026-11-04 for the deadline to be met.

## Success Criteria (Summary)

- The live landing page shows the NoteItDown title, subtitle and three PRD panels with no starter text.
- `npm run test:e2e` pins the copy; lint, unit, astro check and build stay green.
- The README reads as NoteItDown's, with a working clone URL.
