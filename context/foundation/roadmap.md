---
project: NoteItDown
version: 2
status: draft
created: 2026-10-09
updated: 2026-10-16
prd_version: 2
main_goal: quality
top_blocker: time
milestone_id: polish-and-hardening
milestone_seq: 2
milestone_status: open
---

# Roadmap: NoteItDown

> Derived from `context/foundation/prd-v2.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: Polish & Hardening — D&D theme, findable notes, risk-first tests** — Status: open

- **Intent:** Turn the working MVP into a polished, safer base: every page wears the D&D palette, notes are findable on the dashboard and the memory map, the riskiest flows are pinned by automated tests, and the constants rule applies across the whole repo — without changing any preserved behavior.
- **Source materials:** `context/foundation/prd-v2.md` (v2)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 through FR-015, US-01 (full PRD v2 scope).

## Vision recap

The MVP is shipped and working; this milestone polishes it and firms up its base instead of adding new domain behavior. Users get a dark D&D-themed app and can find notes by name on a grouped dashboard and on the memory map; the developer gets tests that cover the riskiest flows (auth, notes CRUD, relation management, per-user/campaign isolation), faster feedback while editing, and one consistent home for status codes, database error codes and user-facing messages. Full mobile support is explicitly the first thing to give way and is parked.

## North star

**S-06: User can find a note on the D&D-themed dashboard — notes grouped by type, with a name search.** — this is the core of US-01 and the primary success criterion a user meets on every visit; under the `quality` goal it lands as soon as the test net, constants sweep and theme it depends on are in place.

> "North star" here means the smallest end-to-end user-visible flow whose delivery proves the milestone achieved its purpose — it is placed as early as its prerequisites allow, because the rest of the milestone mostly exists to make it safe and good-looking.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                                  | Prerequisites | PRD refs                               | Status   |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------- | -------- |
| F-01 | e2e-framework-spike         | (foundation) an e2e framework runs one sign-in scenario locally and as a CI job on push               | —             | FR-007                                 | done     |
| S-01 | auth-risk-tests             | developer can rely on named auth risk scenarios, each covered by a test that runs in CI               | F-01          | FR-007, FR-008, FR-010                 | done        |
| S-02 | notes-relations-risk-tests  | developer can rely on named risk scenarios for notes CRUD, relations and data isolation               | F-01          | FR-008, FR-011, FR-012, FR-013         | done |
| S-03 | per-file-check-hook         | developer gets lint + related unit tests run automatically for a modified file                        | —             | FR-006                                 | done        |
| S-04 | constants-sweep             | developer finds no hardcoded status codes, Postgres error codes or duplicated messages in `src/`      | S-01, S-02    | FR-009, FR-010, FR-011, FR-012         | done |
| S-05 | dnd-theme-revamp            | user sees the D&D palette on every page, with buttons colored by meaning                              | S-04          | FR-001, FR-002, FR-014, FR-015         | done |
| S-06 | dashboard-grouping-search   | user can find a note on the dashboard — grouped by type, with a name search                           | S-05          | US-01, FR-003, FR-004, FR-011          | in-progress |
| S-07 | map-search                  | user can search the memory map and have the match centered or all matches marked                      | S-06          | US-01, FR-005, FR-013                  | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                                      | Note                                                                                       |
| ------ | ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| A      | Risk test net      | `F-01` → `S-01` → `S-02`                   | Quality goal: the safety net lands first; `S-01` and `S-02` can run in parallel after `F-01`. |
| B      | Constants & UI     | `S-04` → `S-05` → `S-06` → `S-07`          | Joins Stream A at `S-01` + `S-02`; carries the north star `S-06`.                          |
| C      | Dev feedback loop  | `S-03`                                     | Standalone; can start immediately alongside `F-01`.                                        |

## Baseline

What's already in place in the codebase as of `2026-10-09` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 islands, shadcn/ui; theme is the generic shadcn neutral token set in `src/styles/global.css` (no D&D palette yet); dashboard is a flat note list; memory map in `src/components/memory-map/` has no search.
- **Backend / API:** present — auth and domain routes (`src/pages/api/auth/*`, `src/pages/dashboard.ts`, `src/pages/map.ts`, `src/pages/notes/*`, `src/pages/campaigns/*`); constants dictionaries exist in `src/lib/constants/` but ~17 hardcoded status/SQLSTATE literals remain across 7 files.
- **Data:** present — Supabase migrations with per-user RLS for campaigns, notes, relations and note-image storage; no schema change in scope.
- **Auth:** present — signup/signin/signout, cookie session, `src/middleware.ts` route guard; no auth-specific automated tests.
- **Deploy / infra:** present — `wrangler.jsonc`, GitHub Actions CI (lint, unit tests, `astro check`, build; smoke job runs the integration suite + smoke against local Supabase; auto-deploy on merge); husky pre-commit runs lint-staged only.
- **Testing:** partial — 11 unit test files under `src/lib/`, 7 integration test files under `tests/integration/`; no e2e framework; no per-file test hook.
- **Observability:** absent — out of scope for this milestone (shared error boundary parked).

## Foundations

### F-01: e2e framework spike

- **Outcome:** (foundation) an e2e framework is installed and one sign-in scenario passes locally and as a CI job on push, against a local Supabase only.
- **Change ID:** e2e-framework-spike
- **PRD refs:** FR-007, Open Question 1, Constraints (local Supabase only)
- **Unlocks:** S-01, S-02; reduces Open Roadmap Question 1 (does the e2e framework fit the timeline?)
- **Prerequisites:** —
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Does the e2e run share the existing smoke job's local-Supabase setup, or need its own CI job? — Owner: `/10x-plan`. Block: no.
- **Risk:** Biggest unknown in the milestone (PRD FR-007); sequenced first so a misfit surfaces while the integration suite can still serve as the fallback, and kept to one scenario so it doesn't turn into a full e2e suite.
- **Status:** done

## Slices

### S-01: Auth risk tests

- **Outcome:** developer can rely on an explicit list of named auth risk scenarios (signup, signin, signout, session behavior, protected-route redirect), each covered by at least one test that runs on push in CI.
- **Change ID:** auth-risk-tests
- **PRD refs:** FR-007, FR-008, FR-010
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Does the existing `smoke` auth check overlap the new auth e2e scenarios enough to retire part of it? — Owner: user. Block: no.
- **Risk:** Binding PRD constraint — auth tests must land before any auth page or route is edited (S-04, S-05); map existing coverage first, add only the gaps.
- **Status:** done

### S-02: Notes, relations & isolation risk tests

- **Outcome:** developer can rely on an explicit list of named risk scenarios for notes & campaigns CRUD, automatic relation management (including pinned relation-change notice wording), memory-map navigation and per-user/per-campaign data isolation — each with at least one test running in CI.
- **Change ID:** notes-relations-risk-tests
- **PRD refs:** FR-008, FR-011, FR-012, FR-013
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03
- **Blockers:** —
- **Unknowns:**
  - Which scenarios need e2e versus the existing integration suite (extend, don't duplicate)? — Owner: `/10x-plan`. Block: no.
- **Risk:** Binding PRD constraint — relation-notice wording is pinned by tests before S-04 moves the text; the gap is in isolation and end-to-end coverage, since relation unit/integration tests already exist.
- **Status:** done

### S-03: Per-file check hook

- **Outcome:** developer gets lint and the related unit tests run automatically for a modified file, finishing within ~10 s; integration tests stay on push/CI.
- **Change ID:** per-file-check-hook
- **PRD refs:** FR-006
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Which hook surface triggers it (editor/agent file-edit hook, git hook, or watcher) and how "related tests" are resolved for a file? — Owner: user. Block: no.
- **Risk:** Independent of the product path, so it can fill gaps in the calendar; the ~10 s budget is the failure mode — a slow hook gets disabled.
- **Status:** done

### S-04: Constants sweep

- **Outcome:** developer finds no hardcoded HTTP status codes, Postgres error codes or duplicated user-facing messages left in `src/` (comments and `.md` excluded), with identical runtime behavior and the rule recorded in `lessons.md`.
- **Change ID:** constants-sweep
- **PRD refs:** FR-009, FR-010, FR-011, FR-012
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Which repeated strings in `.astro` / `.tsx` count as "duplicated user-facing messages" versus one-off copy? — Owner: `/10x-plan`. Block: no.
- **Inherited from S-01:** four logged auth defects (`test-plan.md` §6.6: malformed-body 500, prefix over-match, raw Supabase message / enumeration, literal 401s), and `UI_BASELINE.signupDuplicateEmail` in `tests/e2e/auth-session.spec.ts` must change on purpose.
- **Risk:** Touches auth routes and the relation-notice text, so it waits for S-01/S-02 to pin that behavior; it is its own change, landed before S-05 so refactor and theming diffs don't mix.
- **Status:** done

### S-05: D&D theme revamp

- **Outcome:** user sees the D&D palette on every page (dark background, parchment text, grey ornaments), with buttons colored by meaning — gold primary, red only for destructive actions with icon and label, a neutral Cancel that has default focus, green only for success — including the fixed alert-dialog and image-popup close button.
- **Change ID:** dnd-theme-revamp
- **PRD refs:** FR-001, FR-002, FR-014, FR-015
- **Prerequisites:** S-04
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Does `context/foundation/materials/dnd-color-palette.md` define a value for every theme token in use, and do map node/edge colors meet WCAG AA on the dark background? — Owner: `/10x-plan`. Block: no.
- **Risk:** Largest blast radius per the PRD (layout/UI regressions are noticed first); applied through shared palette tokens so a later mobile milestone changes layout only; before/after screenshots of header/footer and edit/new note layouts must be taken before editing.
- **Status:** done

### S-06: Dashboard grouping & search

- **Outcome:** user can find a note on the dashboard — notes grouped by type (groups A–Z, collapsed, expanding to notes A–Z), with a case-insensitive name search that triggers on pause, Enter, or blur-if-changed, filtering groups in place.
- **Change ID:** dashboard-grouping-search
- **PRD refs:** US-01, FR-003, FR-004, FR-011
- **Prerequisites:** S-05
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - What is a "typical campaign size" for the ~300 ms search-responsiveness target? — Owner: user. Block: no.
- **Risk:** Replaces the current note list, so every existing entry point (open/create/edit/delete note, campaign switching) must stay reachable; search matching stays separate from relation detection.
- **Status:** in-progress

### S-07: Memory-map search

- **Outcome:** user can search memory-map nodes by name with the same triggers as the dashboard — one match centers the viewport, several matches are all marked in gold, no match shows a neutral "no notes found" message.
- **Change ID:** map-search
- **PRD refs:** US-01, FR-005, FR-013
- **Prerequisites:** S-06
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Does the found-node marking stay legible against the themed nodes/edges (WCAG AA) without a separate highlight token? — Owner: `/10x-plan`. Block: no.
- **Risk:** Reuses the search input and trigger behavior from S-06; marking and centering must not change click-to-navigate on nodes or connections.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                        |
| ---------- | -------------------------- | ------------------------------------------------------------------ | --------------------- | -------------------------------------------- |
| F-01       | e2e-framework-spike        | Spike: e2e framework with one sign-in scenario in CI               | yes                   | Run `/10x-plan e2e-framework-spike`          |
| S-01       | auth-risk-tests            | Risk-first tests: authentication scenarios                         | no                    | Waits for F-01                               |
| S-02       | notes-relations-risk-tests | Risk-first tests: notes CRUD, relations, data isolation            | no                    | Waits for F-01                               |
| S-03       | per-file-check-hook        | Per-file hook: lint + related unit tests on modify                 | yes                   | Run `/10x-plan per-file-check-hook`          |
| S-04       | constants-sweep            | Apply constants rule across `src/`                                 | no                    | Waits for S-01, S-02                         |
| S-05       | dnd-theme-revamp           | D&D palette theme on every page + meaning-colored buttons          | no                    | Waits for S-04                               |
| S-06       | dashboard-grouping-search  | Dashboard: notes grouped by type with name search                  | no                    | North star; waits for S-05                   |
| S-07       | map-search                 | Memory map: search, center and mark found nodes                    | no                    | Waits for S-06                               |

## Open Roadmap Questions

1. **Does the new e2e framework fit the 3-week estimate?** The estimate covers 8 threads including a new e2e framework; the early e2e spike (F-01) is the validation checkpoint. — Owner: user. Block: no (resolved at the end of F-01; the integration suite is the fallback).
2. **If time runs short before 2026-10-29, which in-scope item gives way next after mobile?** Mobile is already parked; the PRD names no second cut. — Owner: user. Block: no (relevant only if F-01 resolves Question 1 negatively).

## Observations

- **`astro dev` returns 500 `fetch failed` on the request after one whose body was never read** — dev-only bug in the Cloudflare dev tooling (`@cloudflare/vite-plugin` → `miniflare.dispatchFetch` → undici), not in app code; the production preview and deployed Workers are unaffected. Makes smoke's edit-note step fail under `astro dev`. Found 2026-10-11 during `auth-risk-tests`. Full explanation, repro and fix options: `TESTING.md` → "Known issue: `astro dev` fails the request after an unread request body". Not scheduled; revisit on a Cloudflare tooling upgrade or if it starts disrupting manual testing.

## Parked

- **Mobile / phone-width layouts** — Why parked: PRD §Non-Goals; deferred to a later milestone, theme goes through palette tokens so later work changes layout only.
- **Per-user note-image storage quota and full-resolution image popup path** — Why parked: PRD §Non-Goals; accepted risk while signups are effectively only the author.
- **Changing relation detection or searching inside note content** — Why parked: PRD §Non-Goals; search matches note names only.
- **Coverage-percentage targets and a full e2e suite** — Why parked: PRD §Non-Goals; e2e covers only the risky flows.
- **Shared error boundary / 503 helper** — Why parked: PRD §Non-Goals; the DB-error-handling observation stays open.
- **Safari verification of image upload/view** — Why parked: PRD FR-015 resolution; manual checks cover Chromium and Firefox only.

## Milestone History

- **M-1: MVP — Notes with Auto-Detected Relations & Memory Map** (`mvp-memory-map`) — closed 2026-10-08. All six items done (F-01, S-01–S-05): full PRD v1 scope (FR-001–FR-011, US-01) shipped — notes with exact-name auto-relations on a memory map, multi-campaign support, edit/delete with relation-change notice, and up to 2 images per note.

## Done

(Empty — `/10x-archive` appends an entry here when a change whose `Change ID` matches an item above is archived.)
- **F-01: (foundation) an e2e framework is installed and one sign-in scenario passes locally and as a CI job on push, against a local Supabase only.** — Archived 2026-10-09 → `context/archive/2026-10-09-e2e-framework-spike/`. Lesson: —.
- **S-03: developer gets lint and the related unit tests run automatically for a modified file, finishing within ~10 s; integration tests stay on push/CI.** — Archived 2026-10-10 → `context/archive/2026-10-10-per-file-check-hook/`. Lesson: —.
- **S-01: developer can rely on an explicit list of named auth risk scenarios (signup, signin, signout, session behavior, protected-route redirect), each covered by at least one test that runs on push in CI.** — Archived 2026-10-11 → `context/archive/2026-10-10-auth-risk-tests/`. Lesson: —.
- **S-02: developer can rely on an explicit list of named risk scenarios for notes & campaigns CRUD, automatic relation management (including pinned relation-change notice wording), memory-map navigation and per-user/per-campaign data isolation — each with at least one test running in CI.** — Archived 2026-10-12 → `context/archive/2026-10-11-notes-relations-risk-tests/`. Lesson: —.
- **S-04: developer finds no hardcoded HTTP status codes, Postgres error codes or duplicated user-facing messages left in `src/` (comments and `.md` excluded), with identical runtime behavior and the rule recorded in `lessons.md`.** — Archived 2026-10-13 → `context/archive/2026-10-13-constants-sweep/`. Lesson: —.
- **S-05: user sees the D&D palette on every page (dark background, parchment text, grey ornaments), with buttons colored by meaning — gold primary, red only for destructive actions with icon and label, a neutral Cancel that has default focus, green only for success — including the fixed alert-dialog and image-popup close button.** — Archived 2026-10-15 → `context/archive/2026-10-14-dnd-theme-revamp/`. Lesson: —.
