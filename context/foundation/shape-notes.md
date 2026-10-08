---
project: "NoteItDown"
context_type: brownfield
created: 2026-10-08
updated: 2026-10-08
timeline_budget:
  delivery_weeks: 3
  hard_deadline: 2026-10-29
  after_hours_only: true
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "change category"
      decision: "hardening/tech-debt + visual UI revamp (+ dashboard/map search); image follow-ups later moved out in Phase 3; mobile support not included"
    - topic: "scope give-way order"
      decision: "mobile (Android phone-width) support is deferred first if scope is too large"
    - topic: "persona"
      decision: "same solo TTRPG participant; developer (author) as secondary persona for tests/hooks/constants"
    - topic: "must preserve"
      decision: "auth session behavior, notes & campaigns CRUD, relation forming, memory-map navigation, CI/deploy; image handling secondary"
    - topic: "access control"
      decision: "no change; current login + flat model + per-user RLS preserved; storage quota is a usage limit, not an access change"
    - topic: "button colors"
      decision: "follow palette file: red only for destructive; Cancel = neutral outlined parchment + default focus; gold = primary/positive; green #5E8C5A only for success messages"
    - topic: "milestone scope cut"
      decision: "storage quota and full-res image popup moved out to a later milestone; remaining 8 threads incl. e2e stay; ~3 weeks"
    - topic: "dashboard grouping & search"
      decision: "categories = note types (A-Z, collapsible); notes A-Z within group; search by note name"
    - topic: "success criteria"
      decision: "primary = themed app + working dashboard/map searches guarded by risk tests on push; secondary = repo-wide constants + lesson"
    - topic: "search behavior"
      decision: "case-insensitive substring on note name; blur re-runs only if text changed; dashboard filters groups in place + auto-expands; map: center on 1, mark many (gold), neutral 'no notes found' on 0"
    - topic: "test strategy bounds"
      decision: "hook = lint + unit only; CI on push = integration + e2e limited to risky flows (auth, notes CRUD, relations, per-user/campaign isolation); e2e spike early; explicit risk-scenario list; extend existing tests"
    - topic: "sequencing constraints"
      decision: "constants refactor is its own change before UI revamp; auth tests before auth edits; relation-notice wording pinned by tests before constants move"
    - topic: "business logic"
      decision: "no domain logic change; search is a separate lookup aid, not relation matching"
    - topic: "constraints"
      decision: "no schema/data migration; URLs, API routes and response shapes unchanged"
    - topic: "product framing"
      decision: "no change: web app, small scale; after-hours; hard deadline 2026-10-29 (~3 weeks)"
    - topic: "non-goals"
      decision: "no mobile layouts; no image quota/full-res popup; no relation-rule change or content search; no coverage-% targets, no full e2e suite, no shared error boundary"
  frs_drafted: 15
  quality_check_status: accepted
---

# Shape Notes: NoteItDown — next milestone (post-MVP)

> Prior MVP shape session archived → `context/foundation/archive/shape-notes-2026-10-08-1856.md`.

## Seed idea (verbatim)

> In this milestone we will be aiming for making the UI look better and work with mobile devices (only Android OS for now. Reference file for color usage is prepared and will be provided when needed), making sure the tests cover the most risky areas of the application flow. We will see if we can add some hooks and/or triggers for the tests, too, to make development faster. Another thing to do will be to refactor the code to utilize constants instead of hardcoded values (i.e. HTTP or POSTGRES codes, string literals, etc.). Secondary things to work with are: user storage quota for note images, full-size image popup path to full resolution. These are parts of Observations and Parked segments of the @context/foundation/roadmap.md .

## Current System

- **Purpose:** NoteItDown helps a solo TTRPG participant keep campaign notes (NPCs, places, quests, observations, custom types) connected automatically through exact-name matching, shown on a navigable memory map.
- **Architecture:** SSR web app (monolith) on Cloudflare Workers, with Supabase as the backing service.
- **Tech stack:** Astro 7 SSR + React 19 islands, Tailwind 4, shadcn/ui, Supabase (Postgres + Auth + Storage), Cloudflare Workers, Vitest unit + integration suites, GitHub Actions CI (lint/check/build + smoke), husky + lint-staged pre-commit.
- **User base:** solo users, small scale. So far only the author has used the deployed app. Mobile users are expected in the future.
- **Core functionality (M-1 MVP, shipped and working):** auth (signup/signin/signout), multi-campaign with a default campaign at signup, notes CRUD with predefined/custom types, automatic exact-name relation detection, memory map with navigation, a relation-change notice on edit/delete, up to 2 images per note.
- **Partial prior work:** `src/lib/constants/` (`http-status.ts`, `db-error-codes.ts`, `messages.ts`, `db-constraints.ts`) already exists. The constants rule was applied to the newest code (commit `5bf36f1`) but not across older code.

## Vision & Problem Statement

The MVP is done and working. This milestone is about polishing it and building a firmer base: rules that came up during MVP development become applied project conventions, and the observations the MVP left behind get resolved.

- **UI polish:** the app should look better, following a prepared color reference (to be provided). Known leftovers include the light-themed alert-dialog that clashes with the dark pages and the low-contrast close button on the image popup.
- **Risk-oriented test coverage:** tests should cover the riskiest areas of the application flow. The goal is coverage of risk, not a coverage percentage.
- **Faster development feedback:** explore hooks and/or triggers that run tests, to speed up development.
- **Constants over hardcoded values:** refactor the remaining code to use constants (HTTP codes, Postgres error codes, user-facing string literals, etc.) instead of hardcoded values wherever possible.
- **New dashboard & map usability:** notes on the dashboard grouped by type, with a name search; a search on the memory map that finds and highlights or centers on nodes. These were added during shaping to improve readability.
- ~~Secondary — image follow-ups~~ — **moved out to a later milestone** during Phase 3 scoping: the per-user storage quota for note images and the full-resolution path for the image popup.

**Why now:** this is the natural next step after the MVP. It is not driven by an incident or by user feedback.

**Deferred:** full mobile (Android phone-width) support. The user expects mobile users in the future, but has no mobile users today and has explicitly allowed postponing it if scope is too large. It is the first thing to give way.

## User & Persona

**Primary persona (unchanged):** the solo TTRPG participant (GM or player) from the MVP. Their experience changes mostly through the visual revamp and the image follow-ups.

**Secondary persona:** the developer (the author) maintaining the codebase. The constants refactor, risk-oriented tests and test hooks/triggers serve this persona.

## Access Control

**Current model:** login is required (Supabase email + password, cookie-based session). The user model is flat, with no roles. Signed-out users are kept out of protected routes, and per-user RLS isolates campaigns, notes, relations and note-image storage.

No changes planned — current model preserved. (The per-user note-image storage quota, moved out to a later milestone, would be a usage limit within this model, not an access change.)

## Success Criteria

### Primary

Every page of the app uses the D&D palette (`context/foundation/materials/dnd-color-palette.md`) instead of the generic default theme. The dashboard shows notes grouped by type with a working search, and the memory map has a working search. Authentication, notes CRUD and automatic relation management are covered by automated tests that run on push in CI.

Change flow (end user):
1. From the first page, the app shows the dark D&D theme.
2. On the dashboard, notes are grouped by note type. Groups are sorted A–Z and collapsed; clicking a group expands it (dropdown style) to show its notes, sorted A–Z.
3. A search bar on the dashboard finds notes by name. Search starts after a short pause in typing, on Enter, or when the field loses focus.
4. On the memory map, a search bar with the same trigger behavior centers the viewport on the found node when there is one match. With several matches, every matching node is visibly marked as found (e.g. colored edge or title color, in gold).
5. Header/footer link placement and the edit/new note layouts are unchanged. Buttons are colored by meaning: gold for primary/positive actions, red only for destructive actions (delete and its confirmation). Cancel is a neutral outlined parchment button and gets the default focus in confirmation dialogs. Green `#5E8C5A` is used only for success messages.

Change flow (developer):
1. Modifying a file runs the related checks through a hook: lint for that file and the related tests.
2. On push, CI also runs integration/e2e tests on top of the existing jobs.
3. Risk-first test coverage targets authentication, notes CRUD and automatic relation management.

### Secondary

The constants rule is applied across the whole repo: no hardcoded HTTP status codes, Postgres error codes or duplicated user-facing messages remain in `src/` (comments and `.md` files excluded). A lesson recorded in `context/foundation/lessons.md` prevents regressions.

### Guardrails

- Preserved flows keep working: auth session behavior, notes & campaigns CRUD, relation forming, memory-map navigation.
- CI/deploy stays green: the existing lint/check/build/smoke jobs and auto-deploy keep working.
- Layout stays unchanged where promised: header/footer link placement and the edit/new note layouts.
- Palette contrast holds: text/button pairs meet the palette's stated contrast (at least WCAG AA for normal text), and red is never used outside destructive actions.

**Blast radius (user's assessment):** layout/UI regressions are the most likely to be noticed first. Problems from the constants refactor are expected to be caught by automated tests.

**Timeline:** about 3 weeks of after-hours work, after scoping down. The per-user note-image storage quota and the full-resolution image popup path were moved out to a later milestone. Mobile support was already deferred.

## Functional Requirements

### UI theme & feedback

- FR-001: User sees the D&D palette theme on every page (dark, nearly black background, parchment text, grey ornaments), per `context/foundation/materials/dnd-color-palette.md`. This covers the MVP leftovers: the light-themed alert-dialog and the low-contrast image-popup close button. Priority: must-have. Change: modified
  > Socrates: Counter-argument considered: "theming now, then redoing it for mobile later = double
  > work." Resolution: kept. The theme is applied through shared palette tokens, so a later mobile
  > milestone changes layout, not colors.
- FR-002: User sees buttons colored by meaning: gold for primary/positive actions; red only for destructive actions (delete and its confirmation); Cancel as a neutral outlined parchment button with default focus in confirmation dialogs; green `#5E8C5A` only for success messages. Priority: must-have. Change: modified
  > Socrates: Counter-argument considered: "color alone fails color-blind users / gold and green
  > overlap." Resolution: kept as written. The user validated the palette against protanopia,
  > deuteranopia, tritanopia and achromatopsia in a simulator; all colors stay distinguishable. Gold
  > (primary/positive action) and green (success message) have related but different meanings.

### Dashboard

- FR-003: User can see notes on the dashboard grouped by note type. Groups are sorted A–Z and collapsed by default; a group expands on click (dropdown style) to show its notes, sorted A–Z. Priority: must-have. Change: modified
  > Socrates: Counter-argument considered: "how search results display relative to groups is undefined."
  > Resolution: while searching, groups are filtered in place. Groups without matches are hidden; groups
  > with matches auto-expand and show only the matching notes. Clearing the search restores the
  > collapsed view.
- FR-004: User can search notes by name on the dashboard. The search triggers after a short pause in typing, on Enter, or when the search field loses focus. Priority: must-have. Change: new
  > Socrates: Counter-arguments considered: "the blur trigger is surprising" and "matching rules are
  > undefined" (equal weight). Resolution: blur stays, but re-runs the search only if the text changed
  > since the last search, so clicking a note doesn't reshuffle the list. Matching is a case-insensitive
  > substring match on the note name.

### Memory map

- FR-005: User can search memory-map nodes by note name, with the same search triggers as FR-004. With a single match the viewport centers on that node; with multiple matches every matching node is visibly marked as found. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: "no-match feedback is undefined." Resolution: with no
  > matches, a visible "no notes found" message in neutral parchment text (not red) appears near the
  > search bar, and the viewport stays where it is.

### Developer workflow

- FR-006: Developer gets lint and the related tests run automatically for a modified file, through a hook. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: "integration tests in the hook need local Supabase, so it is
  > slow or fails offline." Resolution: the hook runs lint + unit tests only; integration tests run on
  > push/CI.
- FR-007: Developer gets integration/e2e tests run in CI on push, in addition to the existing jobs (this introduces an e2e framework). Priority: must-have. Change: new
  > Socrates: Counter-argument considered: "a new e2e framework is the biggest unknown in the
  > milestone." Resolution: kept, but e2e is limited to the risky flows (see FR-008), and the framework
  > is set up in an early spike so blockers surface early. The existing integration suite remains the
  > fallback.
- FR-008: Developer can rely on automated tests that cover the riskiest flows: authentication, notes CRUD and automatic relation management. Coverage is oriented to risk, not to a percentage. Priority: must-have. Change: modified
  > Socrates: Counter-arguments considered: "relation tests overlap existing unit tests", "multi-
  > campaign isolation (RLS) is missing from the list", "'risk-oriented' has no done-criterion."
  > Resolution: per-user/per-campaign data isolation is added to the risky flows. Done means an explicit
  > list of named risk scenarios per flow, each with at least one test. Existing tests are mapped first
  > and only the gaps are added (extend, don't duplicate).
- FR-009: Developer uses shared constants for HTTP status codes, Postgres error codes and user-facing messages across all of `src/` (finishing the partial refactor from the previous milestone; comments and `.md` files excluded). A lesson in `lessons.md` records the rule. Priority: must-have. Change: modified
  > Socrates: Counter-arguments considered: "it touches many files alongside the UI revamp" and
  > "'wherever possible' is open-ended." Resolution: the literal kinds are bounded to HTTP status codes,
  > Postgres error codes, user-facing messages and repeated domain strings. The refactor is its own
  > change, sequenced before the UI revamp so the diffs don't mix.

### Preserved

- FR-010: User can sign up, sign in and sign out; session behavior is unchanged. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: "retheming the auth pages and the constants work in auth
  > routes both touch auth." Resolution: auth tests land before any auth page or route is edited.
- FR-011: User can create, view, edit and delete notes, and create and switch campaigns. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: "dashboard regrouping replaces the current note list."
  > Resolution: every current entry point stays reachable from the grouped dashboard (open, create, edit
  > and delete a note; campaign switching).
- FR-012: App detects relations by exact-name matching and shows the relation-change notice on note edit/delete. Priority: must-have. Change: preserved
  > Socrates: Counter-arguments considered: "the constants refactor touches the relation-change
  > messages" and "search's case-insensitive matching may be confused with relation matching."
  > Resolution: search matching code stays separate from relation detection. The relation-notice wording
  > and behavior are pinned by tests before the constants refactor moves the text.
- FR-013: User can navigate between connected notes on the memory map. Priority: must-have. Change: preserved
  > Socrates: Counter-arguments considered: "map search marking/centering may interfere with click-to-
  > navigate" and "retheming may make edges/nodes hard to see." Resolution: search marking and centering
  > must not change click-to-navigate on nodes or connections. Map nodes and edges must meet palette
  > contrast against the dark background.
- FR-014: Header/footer link placement and the edit/new note layouts stay unchanged. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: "retheming may shift spacing/sizes unintentionally."
  > Resolution: "unchanged" means the same structure and placement. Spacing shifts caused by theming are
  > checked manually against before/after screenshots of those pages.
- FR-015: User can attach up to 2 images to a note and view them in the popup. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: "the popup restyle (close button) touches the image
  > component." Resolution: after the restyle, upload and view get a manual check in Chromium and
  > Firefox; Safari verification stays parked.

## User Stories

### US-01: User finds a note quickly on the themed dashboard and on the map

- **Given** a signed-in user with a campaign that has notes of several types
- **When** they open the dashboard
- **Then** they see the D&D-themed page with notes grouped by type (groups sorted A–Z, collapsed)
- **And** expanding a group shows its notes sorted A–Z
- **When** they type part of a note's name into the dashboard search and pause, press Enter or leave the field
- **Then** the matching notes are shown (groups filtered in place, matching groups auto-expanded)
- **When** they search the same name on the memory map
- **Then** the viewport centers on that node (one match), or all matching nodes are marked as found (several matches), or a "no notes found" message appears (no match)

*Before:* the dashboard showed a flat list in the default theme, and the map had no search.

## Business Logic

No domain logic change. This is a UI, search and engineering-hardening change.

The existing domain rule is preserved unchanged: relations between notes in the same campaign are detected automatically by exact-name matching, and are re-detected with a visible notice when a note is edited or deleted (FR-012). The new note search (FR-004, FR-005) is a lookup aid with its own case-insensitive substring matching on note names. It is deliberately kept separate from relation detection and does not create, change or influence relations.

## Constraints & Preserved Behavior

- **No schema or data migration.** Existing campaigns, notes, relations and note images stay as they are.
- **Backward compatibility:** page URLs and API routes are unchanged, and so are API response shapes. The constants refactor (FR-009) must keep HTTP status codes and user-facing messages identical in behavior; it changes where values are defined, not what they are.
- **Supabase free-tier limits:** integration and e2e tests (locally and in CI) run only against a local Supabase, never against the hosted project.
- **Existing integrations that must keep working:** Supabase Auth/Postgres/Storage, Cloudflare Workers deploy, and the GitHub Actions CI jobs (lint, `astro check`, build, smoke) with auto-deploy on merge.
- **Preserved behavior:** auth session behavior; notes & campaigns CRUD; exact-name relation forming and the relation-change notice; memory-map click-to-navigate; header/footer link placement; edit/new note layouts; image attach + popup view (FR-010 to FR-015).
- **Sequencing constraints (from the Socrates round):** the constants refactor is its own change, done before the UI revamp. Auth tests land before any auth page or route is edited. The relation-notice wording is pinned by tests before the constants refactor moves it.

## Non-Functional Requirements

- **Contrast:** text and button color pairs meet at least WCAG AA for normal text, including map node labels and edges and the search-match highlight. Background ornaments are exempt; they are intentionally low-contrast (~1.3:1) per the palette.
- **Search responsiveness:** dashboard and map search results update within ~300 ms after the search triggers, for a typical campaign size.
- **Developer feedback speed:** the per-file hook (lint + unit tests) finishes within ~10 s.
- **Destructive actions are not signaled by color alone:** red buttons carry an icon and an explicit label, and Cancel has the default focus in confirmation dialogs.

## Product Framing

- **Product type:** no change — existing web app.
- **Target scale:** no change — small (only the author so far; mobile users expected in a later milestone).
- **Timing:** after-hours work; hard deadline 2026-10-29 (~3 weeks, matching `delivery_weeks: 3`).

## Non-Goals

- **Mobile / phone-width layouts.** Deferred to a later milestone. The theme goes through palette tokens so that later work changes layout only.
- **Per-user note-image storage quota and a full-resolution path for the image popup.** Moved to a later milestone during Phase 3 scoping. The quota stays an accepted risk while signups are effectively only the author.
- **Changing relation detection, or searching inside note content.** The exact-name relation rule is untouched, and search matches note names only.
- **Coverage-percentage targets and a full e2e suite.** Tests are driven by risk; e2e covers only the risky flows (auth, notes CRUD, relations, per-user/campaign isolation). A shared error boundary / 503 helper is also out of scope; the DB-error-handling Observation stays open.

## Quality cross-check

Ran 2026-10-08. All 6 brownfield elements are present (Access Control, Business Logic, project artifacts, timeline-cost acknowledgment, Non-Goals, preserved behavior). No gaps.

Note (not a gap): the 3-week estimate covers 8 threads, including a new e2e framework. The early e2e spike (FR-007) is the checkpoint for validating it.

## Forward: technical-roadmap

Informational only; not a PRD section.

- Change sequencing raised during shaping: constants refactor (FR-009) → risk tests for auth, notes CRUD, relations and isolation (FR-008, with the relation-notice wording pinned) → e2e spike + CI job (FR-007) → per-file hook (FR-006) → UI revamp (FR-001/002) → dashboard grouping + search (FR-003/004) → map search (FR-005). The constants-before-UI and tests-before-auth-edits constraints are binding; the rest is a suggestion.
- Color reference: `context/foundation/materials/dnd-color-palette.md`.
