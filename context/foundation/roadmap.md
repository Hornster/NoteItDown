---
project: NoteItDown
version: 3
status: draft
created: 2026-10-19
updated: 2026-10-20
prd_version: 3
main_goal: quality
top_blocker: time
milestone_id: recall-and-readiness
milestone_seq: 3
milestone_status: open
---

# Roadmap: NoteItDown

> Derived from `context/foundation/prd-v3.md` (v3) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-3: Recall & Readiness — real landing page, trait search, clear errors, image quota** — Status: open

- **Intent:** Make the first impression match the app, let users find notes by what they remember (traits, half-remembered names) rather than exact names, and harden the app — accurate error responses and a per-user image quota — before it opens to other people, without changing any preserved behavior.
- **Source materials:** `context/foundation/prd-v3.md` (v3)
- **Done when:** every S-NN below is `done`; the landing-page slice (S-01) is live by 2026-11-04 (PRD hard deadline, that slice only).
- **Scope anchors:** FR-001 through FR-015, US-01 through US-03 (full PRD v3 scope).

## Vision recap

NoteItDown is a notepad for a solo TTRPG participant that links campaign notes by exact name and shows them on a memory map. v3 polishes what a new visitor sees first (the landing page still shows starter-template copy), makes recall work when the name is gone — players remember traits, not names, and fantasy names get misspelled — and hardens the app before other people use it: database failures return an accurate status with a clear generic message, and per-user image storage gets a limit.

## North star

**S-02: User can find a forgotten NPC by a remembered trait, with description search on the dashboard and the map.** — this is the primary success criterion ("trait recall works") and the story that motivated v3; under the `quality` goal it lands as soon as the landing copy it extends is in place.

> "North star" here means the smallest end-to-end user-visible flow whose delivery proves the milestone achieved its purpose — it is placed as early as its prerequisites allow, because the rest of the milestone only matters if this works.

## At a glance

| ID   | Change ID             | Outcome (user can …)                                                                                     | Prerequisites | PRD refs                                       | Status   |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- | -------- |
| S-01 | landing-page-copy     | visitor sees the NoteItDown title, subtitle and the three new panels instead of starter copy            | —             | US-02, FR-001, FR-002                          | done |
| S-02 | description-search    | user can find a note by a trait in its description on the dashboard and the map                         | S-01          | US-01, FR-003, FR-005, FR-007, FR-014, FR-015  | proposed |
| S-03 | db-error-handling     | user sees an accurate status and a clear generic message when a DB operation fails                       | —             | FR-011, FR-012, FR-014                         | ready    |
| S-04 | fuzzy-name-search     | user can find a note by a misspelled name, with toggle choices remembered across navigation              | S-02          | US-01, FR-004, FR-005, FR-006, FR-007, FR-013  | proposed |
| S-05 | image-storage-quota   | user sees their image usage and is refused over-limit uploads without losing form data                   | S-03          | US-03, FR-008, FR-010, FR-014                  | proposed |
| S-06 | image-popup-zoom-pan  | user can zoom and pan an oversized image in the popup                                                    | —             | FR-009                                         | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                        | Note                                                                                     |
| ------ | ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| A      | Landing & recall    | `S-01` → `S-02` → `S-04`     | Deadline slice first, then the north star; carries the landing-copy-tied-to-feature rule. |
| B      | Hardening           | `S-03` → `S-05`              | Quality goal: can start immediately alongside Stream A; quota reuses the error message.  |
| C      | Image viewing       | `S-06`                       | Standalone nice-to-have; fills calendar gaps.                                            |

## Baseline

What's already in place in the codebase as of `2026-10-19` (auto-researched + user-confirmed).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 islands, shadcn/ui, D&D theme via semantic tokens; landing page still renders starter copy (`src/components/Welcome.astro`, `src/layouts/Layout.astro`); dashboard grouping + name search and map search shipped in M-2.
- **Backend / API:** present — auth and domain routes under `src/pages/api/`; `jsonError` helper (`src/lib/api.ts`) and central `HTTP_STATUS` / `PG_ERROR` / `MESSAGES` dictionaries (`src/lib/constants/`).
- **Data:** present — Supabase migrations with per-user RLS for campaigns, notes, relations and note-image storage; no fuzzy-matching extension enabled.
- **Auth:** present — signup/signin/signout, cookie session, `src/middleware.ts` route guard, risk tests in e2e/http suites.
- **Deploy / infra:** present — `wrangler.jsonc`, GitHub Actions CI (lint, unit, hooks, integration, http, e2e, smoke) with deploy on `main`.
- **Search:** present (name only) — client-side case-insensitive substring match (`src/lib/note-search.ts`, `src/lib/map-search.ts`) with `?q=` parameter.
- **Images:** present (per-note limits only) — 2 per note, 2.5 MB per image (`src/lib/images/limits.ts`); no per-user total quota; popup shows the image without zoom/pan.
- **Observability:** partial — Cloudflare Workers Logs enabled (`wrangler.jsonc` `observability.enabled`), but DB failures are handled by ~18 ad-hoc `console.error` calls with no shared helper and no dev-only detail in responses.

## Foundations

None for this milestone. Every layer v3 touches is reported `present` or `partial` in the Baseline; the only partial layer (DB-error handling) has a user-visible outcome and lives in S-03 rather than as a foundation.

## Slices

### S-01: Landing page copy

- **Outcome:** visitor sees the landing page titled "NoteItDown" with the new subtitle and the three panels "Make notes", "Keep noting" and "Recall" (Recall starts with the trimmed map sentence), with no starter-template text left and no new actions or links.
- **Change ID:** landing-page-copy
- **PRD refs:** US-02, FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Hard deadline 2026-11-04 (course submission), so it ships first and small; copy only, no layout redesign (PRD §Non-Goals).
- **Status:** done

### S-02: Description search

- **Outcome:** user can turn on description search in the dashboard and map search bars and find a note by a trait in its description (case-insensitive substring); hits look exactly like name hits (dashboard groups filter and open, map marks hits and centers on one / fits several), with both toggles off behaving exactly as v2 and the landing Recall panel gaining the "how much money he owes you" clause.
- **Change ID:** description-search
- **PRD refs:** US-01, FR-003, FR-005, FR-007, FR-014, FR-015
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - What is the response-time target for description search on a realistic campaign? (PRD Open Question 2) — Owner: user. Block: no.
- **Risk:** Name-only search is the most likely thing to break (PRD blast radius), so v2 behavior with the toggle off and old `?q=` links are pinned by tests first; the slice isn't done until the Recall copy (FR-015) is updated; toggle must be keyboard-operable with announced state.
- **Status:** proposed

### S-03: DB error handling

- **Outcome:** user sees an accurate status code and a clear generic message ("An error has occurred during the operation execution. Please try again.") when a database operation fails; dev builds show extra detail, and production failure detail is recorded where only the operator can read it.
- **Change ID:** db-error-handling
- **PRD refs:** FR-011, FR-012, FR-014
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced early under the `quality` goal and because S-05's fail-closed path reuses its message; touches many routes, so existing success responses must keep their shape and production responses must never leak stack traces, SQL, table/column names or another user's data.
- **Status:** ready

### S-04: Fuzzy name search

- **Outcome:** user can turn on fuzzy matching so near-miss spellings of a note name still match on the dashboard and the map; fuzzy and description search are mutually exclusive (the description toggle hides while fuzzy is on), relations stay exact-name only, and toggle choices are remembered across navigation within the session.
- **Change ID:** fuzzy-name-search
- **PRD refs:** US-01, FR-004, FR-005, FR-006, FR-007, FR-013
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Toggle persistence: session-only (FR-006) or between visits (Success Criteria › Secondary)? (PRD Open Question 3) — Owner: user. Block: no.
  - What is the response-time target for fuzzy search? (PRD Open Question 2) — Owner: user. Block: no.
- **Risk:** Builds on S-02's toggle so mutual exclusivity has both toggles to act on; fuzzy must never reach relation detection (FR-013), and v2 search with toggles off stays pinned.
- **Status:** proposed

### S-05: Image storage quota

- **Outcome:** user always sees their current image usage against a per-user total count and total size limit; an upload that would exceed either is refused with a message naming the limit, nothing is saved and the note form keeps its data; if usage can't be checked, the upload is refused with the generic error message; users already over the limit keep their images.
- **Change ID:** image-storage-quota
- **PRD refs:** US-03, FR-008, FR-010, FR-014
- **Prerequisites:** S-03
- **Parallel with:** S-01, S-02, S-04, S-06
- **Blockers:** —
- **Unknowns:**
  - What are the per-user limits (image count N, total size X MB)? (PRD Open Question 1) — Owner: user. Block: no.
- **Risk:** Per-user isolation is the most serious thing to break (PRD blast radius): the usage total is a new aggregate across all campaigns that must count only the requesting user's images (forged-ID test case) and must never undercount; uploads under the quota must work exactly as today.
- **Status:** proposed

### S-06: Image popup zoom & pan

- **Outcome:** user can click an oversized image in the popup to toggle zoom and click-and-drag to pan it; backdrop click and the close button still close the popup, and a drag ending outside the image never closes it.
- **Change ID:** image-popup-zoom-pan
- **PRD refs:** FR-009
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nice-to-have and independent of everything else, so it is the first thing to give way under the `time` blocker; the click-to-zoom vs click-to-close conflict is the failure mode.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID            | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                      |
| ---------- | -------------------- | ------------------------------------------------------------------ | --------------------- | ------------------------------------------ |
| S-01       | landing-page-copy    | Landing page: NoteItDown title, subtitle and three panels          | yes                   | Deadline 2026-11-04; run `/10x-plan landing-page-copy` |
| S-02       | description-search   | Search: description toggle on dashboard and map + Recall copy      | no                    | North star; waits for S-01                 |
| S-03       | db-error-handling    | Shared DB error handling: accurate status, generic message, dev detail | yes               | Run `/10x-plan db-error-handling`          |
| S-04       | fuzzy-name-search    | Search: fuzzy name toggle, mutually exclusive with description     | no                    | Waits for S-02                             |
| S-05       | image-storage-quota  | Per-user image quota with visible usage                            | no                    | Waits for S-03                             |
| S-06       | image-popup-zoom-pan | Image popup: click to zoom, drag to pan                            | yes                   | Nice-to-have; run `/10x-plan image-popup-zoom-pan` |

## Open Roadmap Questions

1. **What are the per-user quota limits (image count N, total size X MB)?** — Owner: user. Block: no (needed by planning of S-05).
2. **What is the search response-time target for description/fuzzy search?** — Owner: user. Block: no (needed by planning of S-02, S-04).
3. **Toggle persistence: session-only or between visits?** FR-006 says toggles are remembered for the current session and reset on the next visit, but Success Criteria › Secondary says "remembered between visits". — Owner: user. Block: no (needed by planning of S-04).

## Observations

- **`astro dev` returns 500 `fetch failed` on the request after one whose body was never read** — dev-only bug in the Cloudflare dev tooling, not in app code; carried over from M-2. Full explanation: `TESTING.md` → "Known issue: `astro dev` fails the request after an unread request body"; rule in `lessons.md`. Not scheduled.
- **README's CI section is stale** — `README.md` "## CI" still describes two jobs (`ci`, `smoke`) and says `ci` runs lint, `astro check`, unit tests and build. The workflow (`.github/workflows/ci.yml`, documented in `CLAUDE.md` › CI) runs `ci` (also hook proof), `local-stack` (integration, http, e2e, smoke) and `deploy` (push to `main` only). Found while planning `landing-page-copy`, which only renames starter naming in the README. Not scheduled.

## Parked

- **Fuzzy-matched relations** — Why parked: PRD §Non-Goals; relations stay exact-name only.
- **Fuzzy over descriptions, or combined search modes** — Why parked: PRD §Non-Goals; fuzzy applies to names only and never runs with description search.
- **Admin UI or per-user quota overrides** — Why parked: PRD §Non-Goals; limits are the same for every user.
- **Mobile layouts and a landing page redesign** — Why parked: PRD §Non-Goals; landing gets copy changes only.
- **A contact channel in error messages** — Why parked: PRD §Non-Goals; returns when the app opens to other users.
- **Opening the app to other users** — Why parked: PRD §Non-Goals; v3 prepares for it only.

## Milestone History

- **M-1: MVP — Notes with Auto-Detected Relations & Memory Map** (`mvp-memory-map`) — closed 2026-10-08. All six items done (F-01, S-01–S-05): full PRD v1 scope (FR-001–FR-011, US-01) shipped — notes with exact-name auto-relations on a memory map, multi-campaign support, edit/delete with relation-change notice, and up to 2 images per note.
- **M-2: Polish & Hardening — D&D theme, findable notes, risk-first tests** (`polish-and-hardening`) — closed 2026-10-19. All eight items done (F-01, S-01–S-07): full PRD v2 scope (FR-001–FR-015, US-01) shipped — Playwright e2e in CI, risk-first auth/notes/relations/isolation tests, per-file agent check hook, constants sweep across `src/`, D&D theme with meaning-colored buttons, dashboard grouped by type with name search, and memory-map search with centering/marking.

## Done

- **S-01: visitor sees the landing page titled "NoteItDown" with the new subtitle and the three panels "Make notes", "Keep noting" and "Recall" (Recall starts with the trimmed map sentence), with no starter-template text left and no new actions or links.** — Archived 2026-10-20 → `context/archive/2026-10-20-landing-page-copy/`. Lesson: —.
