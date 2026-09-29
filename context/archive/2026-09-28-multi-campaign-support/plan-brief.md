# Multi-Campaign Support — Plan Brief

> Full plan: `context/changes/multi-campaign-support/plan.md`

## What & Why

Roadmap slice S-03 (FR-002): users who run or play in more than one campaign can create additional campaigns beyond the signup default, rename them, and switch between them — with each campaign's notes, types and auto-detected relations staying strictly inside that campaign.

## Starting Point

The schema already supports many campaigns per user (per-owner RLS, predefined types seeded on every campaign insert, campaign-scoped FKs and relation detection). The app, however, hard-wires "the oldest campaign" through `getActiveCampaign()`, has no campaign UI, and `campaigns.name` has no validation.

## Desired End State

Every campaign-scoped page lives under `/campaigns/[campaignId]/…` (notes list, map, new note, note detail, edit). A Topbar switcher on every signed-in page lists the user's campaigns and keeps the current view when switching; "New campaign" and "Rename" forms exist. Old `/dashboard`, `/map`, `/notes/new`, `/notes/[id]` URLs redirect. Foreign or malformed campaign ids — and notes opened under the wrong campaign — return 404.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where the current campaign lives | Campaign id in the URL | Bookmarkable, multi-tab friendly, explicit per request. |
| Route shape | Nest everything, incl. `/campaigns/[campaignId]/notes/[noteId]` | Uniform hierarchy; MemoryMap and create-note hook get a `campaignId`. |
| Note under the wrong campaign | 404 | Strict, one rule; old `/notes/[id]` still redirects to the canonical URL. |
| Old flat routes | 302 redirects to the landing campaign | Sign-in, bookmarks and smoke keep working. |
| Landing campaign | Last visited (HttpOnly cookie, RLS re-checked), else oldest | Users return where they left off; cookie never scopes data. |
| Scope | Create + switch + rename; no delete | Rename is cheap (grant exists); delete's cascade is out of scope. |
| Name rules | Trimmed, 1–80 chars, unique per owner case-insensitively — zod + DB | Switcher entries stay distinguishable; anon key can't bypass zod. |
| Switcher | Topbar `<select>` island + `/campaigns/new` page | One click from anywhere; mirrors `/notes/new` pattern. |
| Switch target | Same view where possible (note detail → notes list) | Feels like a context switch, not a navigation reset. |
| Rename UI | `/campaigns/[campaignId]/edit` reusing the create form | One form + validation for both. |
| Notes API | `POST /api/campaigns/[campaignId]/notes`, ownership checked first | Mirrors page URLs; body schema stays `.strict()`. |
| Tests | Integration + unit + updated smoke | Covers the ownership boundary and new DB constraints against a real DB. |

## Scope

**In scope:** name-rule migration; campaign services (`listCampaigns`, `getCampaign`, `createCampaign`, `renameCampaign`, `resolveLandingCampaign`); nested pages and create-note API; redirect endpoints; last-visited cookie; campaign create/rename APIs, form, pages; Topbar switcher; tests; contract-surfaces/README/CLAUDE.md updates.

**Out of scope:** deleting campaigns; cross-device active campaign; moving notes between campaigns; campaign count limits; relation-detection or map-layout changes; a `/campaigns` picker page.

## Architecture / Approach

The URL's campaign id is untrusted input: every page and API checks it's a UUID, loads it through the RLS-scoped `getCampaign`, and 404s on `null` before using it. Redirect-only routes are `.ts` endpoints (a top-level `return` in `.astro` frontmatter crashes this repo's ESLint). The `last_campaign_id` cookie is set on each campaign page and only ever chooses a redirect target via `resolveLandingCampaign`. The Topbar loads the campaign list itself and hosts a tiny switcher island driven by a pure `campaignSwitchPath(view, id)` helper.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Campaign data rules and service layer | Name constraints migration, zod schema, campaign services, integration tests | New `campaigns` constraint breaking the signup trigger's `'My Campaign'` insert |
| 2. Campaign-scoped routing | Nested pages + notes API, redirects, landing cookie, `getActiveCampaign` removed, smoke/docs updated | Largest diff; missed link or ownership check on one route |
| 3. Create, rename and switch UI | Campaign APIs, shared form, new/edit pages, Topbar switcher | Topbar crowding at phone width |

**Prerequisites:** F-01 schema (done); local Supabase via Docker for integration tests.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Assumes production holds only valid `'My Campaign'` rows — Phase 1 manual step verifies before deploy.
- The last-visited cookie is per browser; a new device lands on the oldest campaign (accepted).
- Removing `/api/notes` breaks any external caller — assumed none besides the app's own hook.

## Success Criteria (Summary)

- A user can create a second campaign, switch to it from any page, and see only its notes and connections.
- A user can rename a campaign; duplicate or invalid names are rejected with a clear message.
- Foreign/malformed campaign ids and mismatched note URLs never leak data (404), and old links still work.
