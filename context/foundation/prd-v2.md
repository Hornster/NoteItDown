---
project: "NoteItDown"
version: 2
status: draft
created: 2026-10-08
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: 2026-10-29
  after_hours_only: true
---

# PRD: NoteItDown — next milestone (post-MVP)

## Current System Overview

- **Purpose:** NoteItDown helps a solo TTRPG participant keep campaign notes (NPCs, places, quests, observations, custom types) connected automatically through exact-name matching, shown on a navigable memory map.
- **Architecture:** SSR web app (monolith) on Cloudflare Workers, with Supabase as the backing service.
- **Tech stack:** Astro 7 SSR + React 19 islands, Tailwind 4, shadcn/ui, Supabase (Postgres + Auth + Storage), Cloudflare Workers, Vitest unit + integration suites, GitHub Actions CI (lint/check/build + smoke), husky + lint-staged pre-commit.
- **User base:** solo users, small scale. So far only the author has used the deployed app. Mobile users are expected in the future.
- **Core functionality (M-1 MVP, shipped and working):** auth (signup/signin/signout), multi-campaign with a default campaign at signup, notes CRUD with predefined/custom types, automatic exact-name relation detection, memory map with navigation, a relation-change notice on edit/delete, up to 2 images per note.
- **Current access model:** login is required (Supabase email + password, cookie-based session). The user model is flat, with no roles. Signed-out users are kept out of protected routes, and per-user RLS isolates campaigns, notes, relations and note-image storage.
- **Partial prior work:** `src/lib/constants/` (`http-status.ts`, `db-error-codes.ts`, `messages.ts`, `db-constraints.ts`) already exists. The constants rule was applied to the newest code (commit `5bf36f1`) but not across older code.

## Problem Statement & Motivation

The MVP is done and working. This milestone is about polishing it and building a firmer base: rules that came up during MVP development become applied project conventions, and the observations the MVP left behind get resolved.

- **UI polish:** the app should look better, following a prepared color reference (`context/foundation/materials/dnd-color-palette.md`). Known leftovers include the light-themed alert-dialog that clashes with the dark pages and the low-contrast close button on the image popup.
- **Risk-oriented test coverage:** tests should cover the riskiest areas of the application flow. The goal is coverage of risk, not a coverage percentage.
- **Faster development feedback:** explore hooks and/or triggers that run tests, to speed up development.
- **Constants over hardcoded values:** refactor the remaining code to use constants (HTTP codes, Postgres error codes, user-facing string literals, etc.) instead of hardcoded values wherever possible.
- **New dashboard & map usability:** notes on the dashboard grouped by type, with a name search; a search on the memory map that finds and highlights or centers on nodes. These were added during shaping to improve readability.

**Why now:** this is the natural next step after the MVP. It is not driven by an incident or by user feedback.

**Deferred:** full mobile (Android phone-width) support. The user expects mobile users in the future, but has no mobile users today and has explicitly allowed postponing it if scope is too large. It is the first thing to give way.

## User & Persona

**Primary persona (unchanged):** the solo TTRPG participant (GM or player) from the MVP. Their experience changes mostly through the visual revamp and the new dashboard and map searches.

### Secondary persona

The developer (the author) maintaining the codebase. The constants refactor, risk-oriented tests and test hooks/triggers serve this persona.

## Success Criteria

### Primary

- Every page of the app uses the D&D palette (`context/foundation/materials/dnd-color-palette.md`) instead of the generic default theme.
- The dashboard shows notes grouped by type with a working search, and the memory map has a working search.
- Authentication, notes CRUD and automatic relation management are covered by automated tests that run on push in CI.

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

- The constants rule is applied across the whole repo: no hardcoded HTTP status codes, Postgres error codes or duplicated user-facing messages remain in `src/` (comments and `.md` files excluded).
- A lesson recorded in `context/foundation/lessons.md` prevents regressions.

### Guardrails

- Preserved flows keep working: auth session behavior, notes & campaigns CRUD, relation forming, memory-map navigation.
- CI/deploy stays green: the existing lint/check/build/smoke jobs and auto-deploy keep working.
- Layout stays unchanged where promised: header/footer link placement and the edit/new note layouts.
- Palette contrast holds: text/button pairs meet the palette's stated contrast (at least WCAG AA for normal text), and red is never used outside destructive actions.

**Blast radius (user's assessment):** layout/UI regressions are the most likely to be noticed first. Problems from the constants refactor are expected to be caught by automated tests.

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

## Scope of Change

### UI theme & feedback

- [modified] FR-001: User sees the D&D palette theme on every page (dark, nearly black background, parchment text, grey ornaments), per `context/foundation/materials/dnd-color-palette.md`. This covers the MVP leftovers: the light-themed alert-dialog and the low-contrast image-popup close button. Priority: must-have
  > Socrates: Counter-argument considered: "theming now, then redoing it for mobile later = double
  > work." Resolution: kept. The theme is applied through shared palette tokens, so a later mobile
  > milestone changes layout, not colors.
- [modified] FR-002: User sees buttons colored by meaning: gold for primary/positive actions; red only for destructive actions (delete and its confirmation); Cancel as a neutral outlined parchment button with default focus in confirmation dialogs; green `#5E8C5A` only for success messages. Priority: must-have
  > Socrates: Counter-argument considered: "color alone fails color-blind users / gold and green
  > overlap." Resolution: kept as written. The user validated the palette against protanopia,
  > deuteranopia, tritanopia and achromatopsia in a simulator; all colors stay distinguishable. Gold
  > (primary/positive action) and green (success message) have related but different meanings.

### Dashboard

- [modified] FR-003: User can see notes on the dashboard grouped by note type. Groups are sorted A–Z and collapsed by default; a group expands on click (dropdown style) to show its notes, sorted A–Z. Priority: must-have
  > Socrates: Counter-argument considered: "how search results display relative to groups is undefined."
  > Resolution: while searching, groups are filtered in place. Groups without matches are hidden; groups
  > with matches auto-expand and show only the matching notes. Clearing the search restores the
  > collapsed view.
- [new] FR-004: User can search notes by name on the dashboard. The search triggers after a short pause in typing, on Enter, or when the search field loses focus. Priority: must-have
  > Socrates: Counter-arguments considered: "the blur trigger is surprising" and "matching rules are
  > undefined" (equal weight). Resolution: blur stays, but re-runs the search only if the text changed
  > since the last search, so clicking a note doesn't reshuffle the list. Matching is a case-insensitive
  > substring match on the note name.

### Memory map

- [new] FR-005: User can search memory-map nodes by note name, with the same search triggers as FR-004. With a single match the viewport centers on that node; with multiple matches every matching node is visibly marked as found. Priority: must-have
  > Socrates: Counter-argument considered: "no-match feedback is undefined." Resolution: with no
  > matches, a visible "no notes found" message in neutral parchment text (not red) appears near the
  > search bar, and the viewport stays where it is.

### Developer workflow

- [new] FR-006: Developer gets lint and the related tests run automatically for a modified file, through a hook. Priority: must-have
  > Socrates: Counter-argument considered: "integration tests in the hook need local Supabase, so it is
  > slow or fails offline." Resolution: the hook runs lint + unit tests only; integration tests run on
  > push/CI.
- [new] FR-007: Developer gets integration/e2e tests run in CI on push, in addition to the existing jobs (this introduces an e2e framework). Priority: must-have
  > Socrates: Counter-argument considered: "a new e2e framework is the biggest unknown in the
  > milestone." Resolution: kept, but e2e is limited to the risky flows (see FR-008), and the framework
  > is set up in an early spike so blockers surface early. The existing integration suite remains the
  > fallback.
- [modified] FR-008: Developer can rely on automated tests that cover the riskiest flows: authentication, notes CRUD and automatic relation management. Coverage is oriented to risk, not to a percentage. Priority: must-have
  > Socrates: Counter-arguments considered: "relation tests overlap existing unit tests", "multi-
  > campaign isolation (RLS) is missing from the list", "'risk-oriented' has no done-criterion."
  > Resolution: per-user/per-campaign data isolation is added to the risky flows. Done means an explicit
  > list of named risk scenarios per flow, each with at least one test. Existing tests are mapped first
  > and only the gaps are added (extend, don't duplicate).
- [modified] FR-009: Developer uses shared constants for HTTP status codes, Postgres error codes and user-facing messages across all of `src/` (finishing the partial refactor from the previous milestone; comments and `.md` files excluded). A lesson in `lessons.md` records the rule. Priority: must-have
  > Socrates: Counter-arguments considered: "it touches many files alongside the UI revamp" and
  > "'wherever possible' is open-ended." Resolution: the literal kinds are bounded to HTTP status codes,
  > Postgres error codes, user-facing messages and repeated domain strings. The refactor is its own
  > change, sequenced before the UI revamp so the diffs don't mix.

### Preserved

- [preserved] FR-010: User can sign up, sign in and sign out; session behavior is unchanged. Priority: must-have
  > Socrates: Counter-argument considered: "retheming the auth pages and the constants work in auth
  > routes both touch auth." Resolution: auth tests land before any auth page or route is edited.
- [preserved] FR-011: User can create, view, edit and delete notes, and create and switch campaigns. Priority: must-have
  > Socrates: Counter-argument considered: "dashboard regrouping replaces the current note list."
  > Resolution: every current entry point stays reachable from the grouped dashboard (open, create, edit
  > and delete a note; campaign switching).
- [preserved] FR-012: App detects relations by exact-name matching and shows the relation-change notice on note edit/delete. Priority: must-have
  > Socrates: Counter-arguments considered: "the constants refactor touches the relation-change
  > messages" and "search's case-insensitive matching may be confused with relation matching."
  > Resolution: search matching code stays separate from relation detection. The relation-notice wording
  > and behavior are pinned by tests before the constants refactor moves the text.
- [preserved] FR-013: User can navigate between connected notes on the memory map. Priority: must-have
  > Socrates: Counter-arguments considered: "map search marking/centering may interfere with click-to-
  > navigate" and "retheming may make edges/nodes hard to see." Resolution: search marking and centering
  > must not change click-to-navigate on nodes or connections. Map nodes and edges must meet palette
  > contrast against the dark background.
- [preserved] FR-014: Header/footer link placement and the edit/new note layouts stay unchanged. Priority: must-have
  > Socrates: Counter-argument considered: "retheming may shift spacing/sizes unintentionally."
  > Resolution: "unchanged" means the same structure and placement. Spacing shifts caused by theming are
  > checked manually against before/after screenshots of those pages.
- [preserved] FR-015: User can attach up to 2 images to a note and view them in the popup. Priority: must-have
  > Socrates: Counter-argument considered: "the popup restyle (close button) touches the image
  > component." Resolution: after the restyle, upload and view get a manual check in Chromium and
  > Firefox; Safari verification stays parked.

## Constraints & Compatibility

- **No schema or data migration.** Existing campaigns, notes, relations and note images stay as they are.
- **Backward compatibility:** page URLs and API routes are unchanged, and so are API response shapes. The constants refactor (FR-009) must keep HTTP status codes and user-facing messages identical in behavior; it changes where values are defined, not what they are.
- **Supabase free-tier limits:** integration and e2e tests (locally and in CI) run only against a local Supabase, never against the hosted project.
- **Existing integrations that must keep working:** Supabase Auth/Postgres/Storage, Cloudflare Workers deploy, and the GitHub Actions CI jobs (lint, `astro check`, build, smoke) with auto-deploy on merge.
- **Preserved behavior:** auth session behavior; notes & campaigns CRUD; exact-name relation forming and the relation-change notice; memory-map click-to-navigate; header/footer link placement; edit/new note layouts; image attach + popup view (FR-010 to FR-015).
- **Sequencing constraints (from the Socrates round):** the constants refactor is its own change, done before the UI revamp. Auth tests land before any auth page or route is edited. The relation-notice wording is pinned by tests before the constants refactor moves it.

**Quality targets (non-functional):**

- **Contrast:** text and button color pairs meet at least WCAG AA for normal text, including map node labels and edges and the search-match highlight. Background ornaments are exempt; they are intentionally low-contrast (~1.3:1) per the palette.
- **Search responsiveness:** dashboard and map search results update within ~300 ms after the search triggers, for a typical campaign size.
- **Developer feedback speed:** the per-file hook (lint + unit tests) finishes within ~10 s.
- **Destructive actions are not signaled by color alone:** red buttons carry an icon and an explicit label, and Cancel has the default focus in confirmation dialogs.

## Business Logic Changes

No domain logic change. This is a UI, search and engineering-hardening change.

The existing domain rule is preserved unchanged: relations between notes in the same campaign are detected automatically by exact-name matching, and are re-detected with a visible notice when a note is edited or deleted (FR-012). The new note search (FR-004, FR-005) is a lookup aid with its own case-insensitive substring matching on note names. It is deliberately kept separate from relation detection and does not create, change or influence relations.

## Access Control Changes

No access control changes — current model preserved (see Current System Overview). The per-user note-image storage quota, moved out to a later milestone, would be a usage limit within this model, not an access change.

## Non-Goals

- **Mobile / phone-width layouts.** Deferred to a later milestone. The theme goes through palette tokens so that later work changes layout only.
- **Per-user note-image storage quota and a full-resolution path for the image popup.** Moved to a later milestone during scoping. The quota stays an accepted risk while signups are effectively only the author.
- **Changing relation detection, or searching inside note content.** The exact-name relation rule is untouched, and search matches note names only.
- **Coverage-percentage targets and a full e2e suite.** Tests are driven by risk; e2e covers only the risky flows (auth, notes CRUD, relations, per-user/campaign isolation).
- **Shared error boundary / 503 helper.** Out of scope; the DB-error-handling Observation stays open.

## Open Questions

1. **Does the new e2e framework fit the 3-week estimate?** The estimate covers 8 threads including a new e2e framework; the early e2e spike (FR-007) is the validation checkpoint. — Owner: user. By: end of the e2e spike. Block: no.
