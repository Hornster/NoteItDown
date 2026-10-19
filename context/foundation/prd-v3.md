---
project: "NoteItDown"
version: 3
status: draft
created: 2026-10-19
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 5
  hard_deadline: 2026-11-04 # applies to the landing-page slice only; the rest of v3 has no hard deadline
  after_hours_only: true
---

# PRD: NoteItDown — v3

## Current System Overview

- **Purpose:** NoteItDown is a notepad for a solo TTRPG participant. It links campaign notes (NPCs, places, quests, observations, custom types) automatically by exact-name matching and shows them on a navigable memory map.
- **Architecture:** SSR web app (monolith) on Cloudflare Workers, with Supabase as the backing service.
- **Tech stack:** Astro 7 SSR + React 19 islands, Tailwind 4 + shadcn/ui, Supabase (Postgres + Auth + Storage), Cloudflare Workers, Vitest (unit/integration/http/hooks) + Playwright e2e, GitHub Actions CI with deploy on `main`.
- **User base:** solo users, small scale. So far only the author uses the deployed app. Opening it to other people is planned.
- **Core functionality (MVP + v2, shipped):** auth (signup/signin/signout), multi-campaign, notes CRUD with predefined/custom types, automatic exact-name relation detection, memory map with navigation, a relation-change notice, up to 2 images per note, a themed UI, a dashboard grouped by note type with name search, map search (case-insensitive substring on note name), risk-based tests + agent hooks, and shared constants.
- **Current access model:** login is required (Supabase email + password, cookie-based session). The user model is flat, with no roles. Signed-out users are redirected away from protected routes; the landing page is public. Per-user RLS isolates campaigns, notes, relations and note-image storage.
- **Test environment:** integration and e2e tests run only against a local Supabase, never the hosted project (carried over from v2).
- **Leftovers:** the landing page still shows the starter template copy ("10x Astro Starter", "Authentication Ready", "Modern stack", "Developer experience"). Two items are parked from v2: the per-user image storage quota with a full-resolution popup path, and a shared DB error / 503 helper.

## Problem Statement & Motivation

v3 polishes what a new user sees first, makes recall work when the name is gone, and hardens the app before other people use it.

- **Landing page (course-critical):** the page is starter-template leftover. It's the first thing a potential user sees and doesn't match the app. The new copy is fixed by the user in the seed idea (title, subtitle, three panels: "Make notes", "Keep noting", "Recall").
- **Description + fuzzy search:** a party went 8 real-life months without meeting an NPC. Everyone forgot the name and remembered only the description. Today's search matches note names only, so it couldn't help. Insight: players remember traits, not names, and fantasy names get half-remembered or misspelled. Description search and fuzzy matching each become a user toggle, because description search costs more than name search.
- **Image storage quota + full-resolution popup path (parked from v2):** the user plans to open the app to other people, which makes unbounded per-user image storage a real risk. Taking it on now, before the opening.
- **Consistent DB error handling (parked from v2):** no incident yet. The user wants to prevent the generic-503 experience they deal with at work. When a database operation fails, the status code stays accurate and the user sees a clear generic message, roughly: "An error has occurred during the operation execution. Please try again." (wording flexible). Dev builds disclose more detail so the developer can pinpoint the cause.

**Why now:** the landing page is required for the course submission (deadline 2026-11-04), so it's time-bound and ships first as its own slice. The other three threads are the natural next step and have no time pressure; they follow within the 5-week, after-hours budget.

**Current workaround:** none for trait recall (name-only search finds nothing when the name is forgotten). For oversized images, the user right-clicks and opens the image in the browser to see it whole.

**Timeline acknowledgment:** acknowledged on 2026-10-19: 5-week delivery requires sustained dedication; user accepted.

## User & Persona

**Primary persona (unchanged):** the solo TTRPG participant (GM or player). v3 changes their experience through description/fuzzy search, clearer error messages and a storage limit on note images.

### Secondary persona

- **New visitor:** a potential user who hasn't signed up yet. The landing page is their first impression of what the app does.
- **Developer (the author):** needs extra error detail in dev builds to pinpoint failures.

## Success Criteria

**Change delta flow (search):**

1. The user opens the dashboard or the memory map. The search bar now has two toggles: description and fuzzy.
2. The user turns on description search and types a remembered trait, e.g. "scar over left eye".
3. Hits look exactly like name-search hits. On the dashboard, groups with hits open and show only the matching notes; groups without hits are hidden. On the map, matching notes are marked and the viewport moves and zooms to show them (center on one, fit several).

**Change delta flow (quota):** the user uploads an image that would exceed their limit. They get an error explaining that, due to the current application limits, they can upload only N images (or only up to the size limit). The image isn't saved, the user stays on the same form, and nothing in the form is erased.

**Change delta flow (full-resolution popup):** when an image is bigger than the popup, a click toggles zoom and click-and-drag pans the image. The user no longer needs to right-click and open the image in the browser to see it whole.

**Change delta flow (errors):** when a DB operation fails, the status code stays accurate and the user sees a clear generic message (roughly "An error has occurred during the operation execution. Please try again."; the contact sentence was dropped until a contact channel exists). Dev builds show more detail.

**Blast radius:** name-only search is the most likely to break. Per-user data isolation is less likely to break but has the most serious consequences.

### Primary

- The deployed landing page shows the "NoteItDown" title, the new subtitle and the three panels ("Make notes", "Keep noting", "Recall") with the user's copy, live by 2026-11-04.
- Trait recall works: with description search on, typing a remembered trait finds the NPC on both the dashboard and the map, even when the name is forgotten or misspelled (fuzzy on).
- Over-limit image uploads (count or size) are rejected with the limit message; nothing is saved and the form keeps its data.
- A failed DB operation returns an accurate status and the clear generic message; dev builds show more detail, and production failure detail is recorded for the operator.

### Secondary

- Oversized images in the popup can be zoomed (click toggle) and panned (drag).
- The description/fuzzy toggle settings are remembered between visits.
- The new search modes, the quota and the error handling are covered by the existing risk-based test suites.

### Guardrails

- With both toggles off, dashboard and map search behave exactly as in v2 (case-insensitive substring on note name).
- Per-user data isolation: search, quota counting and error detail never expose another user's data, and production errors never leak internals.
- Exact-name relation detection is untouched; fuzzy matching applies to search only.
- Image uploads under the quota work as today (2 per note, 2.5 MB per-image cap).

## User Stories

### US-01: Player recalls a forgotten NPC by trait

- **Given** a signed-in user whose campaign has an NPC note whose description mentions "scar over left eye", but whose name nobody remembers
- **When** they turn on description search (and fuzzy, if unsure of spelling) on the dashboard or the map and type "scar over left eye"
- **Then** the NPC is found and shown the same way name hits are (before v3, name-only search found nothing)

#### Acceptance Criteria

- Dashboard: groups with hits open and show only the matching notes; groups without hits are hidden.
- Map: matching notes are marked; one hit → viewport centers on it, several → viewport fits them.
- With both toggles off, the same query behaves exactly as v2 name-only search.

### US-02: Visitor understands what the app is

- **Given** a visitor who hasn't signed up
- **When** they open the landing page
- **Then** they see "NoteItDown", the new subtitle and the "Make notes" / "Keep noting" / "Recall" panels (before v3: starter-template copy); the Recall panel starts with the trimmed map sentence and gains the money clause when description search ships

#### Acceptance Criteria

- No starter-template text remains on the page.
- No new actions or links are added.

### US-03: Upload over the quota is refused without losing work

- **Given** a signed-in user at their image count or size limit, partway through filling in a note form
- **When** they upload another image
- **Then** they see a message naming the limit, the image isn't saved, and they stay on the form with all entered data intact (before v3: no per-user limit)

#### Acceptance Criteria

- Current usage against both limits is always visible.
- If the quota can't be checked, the upload is refused with the generic error message and the form keeps its data.

## Scope of Change

### Landing page

- [modified] FR-001: Visitor sees the landing page titled "NoteItDown" with the subtitle "A TTRPG notepad that makes relations managing and data recall easy." Priority: must-have
  > Socrates: Counter-argument considered: "hardcoded landing copy drifts from the app as features change." Resolution: kept; copy updates are tied to features: any change that alters a capability the landing page mentions must update the copy in the same change (see FR-015).
- [modified] FR-002: Visitor sees three panels replacing the starter panels, copy only, no new actions or links: "Make notes" — "Note the NPC, note their quest and reference the NPC in the description"; "Keep noting" — "The references are updated automatically whenever you update, add or delete a note. Immediately."; "Recall" — "Find where Boblin the Goblin lived through the interactive memory map with search capability." Priority: must-have
  > Socrates: Counter-argument considered: "the original Recall copy ('how much money he owes you') promises description search, which may not ship by the landing-page deadline." Resolution: revised; Recall starts with the trimmed map sentence, and the money clause is added together with FR-003 (FR-015). Also fixed the seed typo "owns you" → "owes you".
- [modified] FR-015: Visitor sees the Recall panel extended to "Find where Boblin the Goblin lived and how much money he owes you through the interactive memory map with search capability." once description search (FR-003) ships. Priority: must-have
  > Socrates: Counter-argument considered: "the copy change is easy to forget, since it lives in a different area from the search work." Resolution: kept; FR-015 ships in the same slice as FR-003, and that slice isn't done until the Recall copy is updated.

### Search

- [new] FR-003: User can toggle description search on the dashboard and map search bars, so queries also match note descriptions (case-insensitive substring). Priority: must-have
  > Socrates: Counter-argument considered: "at solo scale description search may be cheap enough to be on by default; long descriptions may flood results." Resolution: no counter-argument; stands as written.
- [new] FR-004: User can toggle fuzzy matching, which relaxes matching on note names only, so near-miss name spellings still match. Fuzzy and description search are mutually exclusive: the description toggle is hidden while fuzzy is on. Priority: must-have
  > Socrates: Counter-argument considered: "misspellings are a fantasy-name problem; trait words in descriptions are ordinary words, and fuzzy over long descriptions matches almost everything." Resolution: revised; fuzzy applies to names only, and the two toggles are mutually exclusive.
- [modified] FR-005: User sees description/fuzzy hits presented the same way as name hits (dashboard groups filter and expand; map marks hits and centers on one / fits several). Priority: must-have
  > Socrates: Counter-argument considered: "a description hit looks like a name hit, so the user can't tell why a note matched; 'fit all' with many hits zooms out to the whole graph." Resolution: no counter-argument; stands as written.
- [new] FR-006: User's toggle settings are remembered for the current session (across navigation) and reset on the next visit. Priority: nice-to-have
  > Socrates: Counter-argument considered: "sticky toggles surprise later: a description toggle left on last week returns unexpected extra hits today." Resolution: revised; remembered per session only.
- [preserved] FR-007: User with both toggles off gets v2 name-only search unchanged. Priority: must-have
  > Socrates: Counter-argument considered: "locking v2 behavior freezes a weak default." Resolution: no counter-argument; stands as written.

### Images

- [new] FR-008: User is prevented from uploading images beyond a per-user total image count and total storage size limit, and sees a message naming the limit; nothing is saved and the form keeps its data. The user's current usage against both limits is always visible, not only when a limit is hit. Priority: must-have
  > Socrates: Counter-argument considered: "a user at the limit has no way out: they don't know their usage or that deleting images frees space." Resolution: revised; usage is always visible.
- [new] FR-009: User can zoom (click on the image toggles zoom) and pan (click-and-drag) an image in the popup when the image is bigger than the popup. The backdrop click and close button still close the popup; a drag that ends outside the image never closes it. Priority: nice-to-have
  > Socrates: Counter-argument considered: "click-to-zoom clashes with click-to-close." Resolution: revised; image clicks zoom, backdrop closes, drags never close.
- [preserved] FR-010: User can upload images under the quota exactly as today (2 per note, 2.5 MB per-image cap). If the quota can't be checked, the upload is refused with the generic error message (FR-011) and the form keeps its data. Priority: must-have
  > Socrates: Counter-argument considered: "the quota check is a new failure point for otherwise valid uploads." Resolution: revised; fail closed with the generic error message, form data kept.

### Errors

- [modified] FR-011: User sees an accurate status and a clear generic message ("An error has occurred during the operation execution. Please try again." — wording flexible) when a database operation fails. Priority: must-have
  > Socrates: Counter-argument considered: "'contact the application creator' gives no channel to reach anyone." Resolution: revised; the contact sentence is dropped for now and returns with a contact channel when the app opens to other users.
- [new] FR-012: Developer sees additional failure detail in dev builds; production never shows it to users, but production failure detail is recorded where only the operator can read it. Priority: must-have
  > Socrates: Counter-argument considered: "with detail only in dev builds, a production failure a user reports stays opaque to the developer too." Resolution: revised; production failures are recorded for the operator.

### Preserved

- [preserved] FR-013: Notes keep linking by exact-name relation detection; fuzzy matching never affects relations. Priority: must-have
  > Socrates: Counter-argument considered: "once fuzzy search finds 'Bobblin' for 'Boblin', users will expect a relation too." Resolution: kept; the inconsistency is accepted. The user fixes a misspelled name to get the relation.
- [preserved] FR-014: Users only ever see and search their own campaigns, notes and images (per-user data isolation), and the quota usage total only ever counts the requesting user's images. Priority: must-have
  > Socrates: Counter-argument considered: "the quota total is a new per-user aggregate across all campaigns that must stay user-scoped." Resolution: kept, with the aggregate named explicitly and covered by risk tests.

## Constraints & Compatibility

- **Existing search URLs keep working:** links with today's `?q=` on the dashboard and map behave as name-only search. Toggles add new parameters without changing old ones.
- **No changes to note data:** notes, relations and images keep their current shape. The quota only adds usage tracking.
- **Existing data under the quota:** users already over a limit when the quota ships keep all their images. New uploads are blocked until they're back under the limit, and their usage shows they're over.
- **API responses keep their shape:** existing success responses are unchanged. Error responses gain the generic message, and a new quota-exceeded error is added.
- **Local-only test stack:** integration and e2e tests run only against a local test environment, never the production one (carried over from v2).
- **Landing copy tied to features:** a change that alters a capability the landing page mentions must update the copy in the same change.
- **CI gate:** every change passes the existing CI (lint, unit, hooks, integration, http, e2e) before deploying from `main`. No other deploy windows or monitoring constraints.
- **Preserved behavior (must not break):** exact-name relation detection, v2 name-only search with toggles off, per-user data isolation (including the new quota usage total), image upload under the quota (2 per note, 2.5 MB per image), notes/campaigns CRUD, memory-map navigation, and CI/deploy.

### Quality properties

- Description and fuzzy search results appear within a time the user perceives as immediate on a realistic campaign. Target to be set (see Open Questions).
- Production error responses never reveal stack traces, SQL, table or column names, or any other user's data.
- The search toggles are keyboard-operable, show visible focus and announce their on/off state to assistive technology, matching v2's accessibility bar.
- Displayed image usage never undercounts what is actually stored for the user.

## Business Logic Changes

**Existing rule (unchanged):** notes link automatically when one note's text contains another note's exact name. v3 does not change this, and fuzzy matching never creates relations.

**New rule — search matching:** a note matches a search query when its name contains the query (always), when its description contains the query (description search on), or when its name is a near-miss spelling of the query (fuzzy on; fuzzy and description search are mutually exclusive).

The rule takes the query text and the user's toggle choices as input and returns the set of matching notes. The user meets it in the existing search bars on the dashboard and the memory map. Hits look exactly like today's name hits. With both toggles off, the rule reduces to v2's case-insensitive name substring match.

**New rule — usage-limit validation:** an image upload is accepted only if the user's total image count and total stored image size both stay within their per-user limits after the upload.

The rule takes the user's current usage and the incoming image as input. It either accepts the upload or refuses it with a message naming the limit. The user meets it in the note form's image upload, where their usage is always visible. If usage can't be determined, the upload is refused (fail closed). The concrete limits are an open question.

## Access Control Changes

No access control changes — current model preserved.

The per-user image storage quota is a usage limit within this model, not an access change. Extra error detail depends on the build type (dev vs production), not on user identity or role.

## Non-Goals

- **Fuzzy-matched relations.** Near-miss names never create or suggest relations; relations stay exact-name only.
- **Fuzzy over descriptions, or combined search modes.** Fuzzy applies to names only, and fuzzy and description search never run together.
- **Admin UI or per-user quota overrides.** There's no operator screen to view or raise individual limits; the limits are the same for every user.
- **Mobile layouts and a landing page redesign.** Mobile is still deferred from v2. The landing page gets copy changes only, with no new layout, call to action or links.
- **A contact channel in error messages.** The "contact the application creator" sentence is dropped until the app opens to other users.
- **Opening the app to other users.** v3 prepares for it; the opening itself is not part of v3.

## Open Questions

1. **What are the per-user quota limits (image count N, total size X MB)?** — Owner: user. By: planning of the quota slice. Block: no.
2. **What is the search response-time target for description/fuzzy search?** — Owner: user. By: planning of the search slice. Block: no.
3. **Toggle persistence: session-only or between visits?** FR-006 says toggles are remembered for the current session and reset on the next visit, but Success Criteria › Secondary says "remembered between visits". — Owner: user. By: planning of the search slice. Block: no.
