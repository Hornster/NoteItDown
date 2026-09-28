# Multi-Campaign Support Implementation Plan

## Overview

Roadmap slice S-03 (FR-002, explicit additional-campaign part): the user can create additional campaigns beyond the signup default, rename them, and switch between them. The campaign becomes part of the URL — every campaign-scoped page lives under `/campaigns/[campaignId]/…` and is scoped to that campaign after a server-side RLS ownership check. The old flat routes (`/dashboard`, `/map`, `/notes/new`, `/notes/[id]`) become redirects so existing links, the sign-in redirect and bookmarks keep working.

## Current State Analysis

- The schema already supports N campaigns per user: `campaigns` has per-owner select/insert/update/delete RLS (`supabase/migrations/20260922120000_campaign_notes_schema.sql:17-24`), and `seed_default_note_types()` fires on **every** campaign insert (`:183-185`), so a user-created campaign gets the 4 predefined types automatically. Notes, note types and relations are campaign-scoped by composite FKs, and relation detection only matches within `v_note.campaign_id` (`20260926120000_relation_detection.sql:51`).
- `authenticated` may update only `campaigns.name` (`20260923120000_restrict_update_columns.sql:6-7`) — rename needs no new grant.
- `campaigns.name` has **no** constraints (no trim/length/uniqueness), unlike `notes.name`.
- `getActiveCampaign()` (`src/lib/services/campaigns.ts:14`) returns the oldest campaign and is the single resolver of "which campaign", called by `/dashboard`, `/map`, `/notes/new` and `POST /api/notes`. Its doc comment and `docs/reference/contract-surfaces.md` ("Active campaign resolution") name S-03 as the change that replaces it, with the rule that any client-supplied campaign id must be re-checked for ownership server-side.
- `/notes/[id]` (`src/pages/notes/[id].astro`) resolves a note by id via RLS regardless of campaign; its back link is hard-coded to `/dashboard`.
- The memory map island navigates to `/notes/${node.id}` (`src/components/memory-map/MemoryMap.tsx:68`); the create-note hook posts to `/api/notes` and navigates to `/notes/${id}` (`src/components/hooks/useCreateNote.ts:28,36`).
- The Topbar (`src/components/Topbar.astro`) has only Dashboard / Map / Sign out links; there is no campaign UI anywhere.
- Sign-in redirects to `/dashboard` (`src/pages/api/auth/signin.ts:19`); `scripts/smoke.mjs:57-58` expects `/dashboard` and `/map` to return 200 for a signed-in user.
- Middleware protects `["/dashboard", "/notes", "/map"]` by prefix (`src/middleware.ts:4`).

## Desired End State

- `/campaigns/[campaignId]` shows that campaign's notes list; `/campaigns/[campaignId]/map` its memory map; `/campaigns/[campaignId]/notes/new` the create-note form; `/campaigns/[campaignId]/notes/[noteId]` a note's detail; `/campaigns/[campaignId]/edit` the rename form; `/campaigns/new` the create-campaign form.
- A campaign id that is malformed, nonexistent or owned by another user → 404. A note whose `campaign_id` differs from the URL's campaign → 404.
- `/dashboard`, `/map`, `/notes/new` → 302 to the same view of the **landing campaign** (last visited, verified by RLS; else oldest). `/notes/[id]` → 302 to the note's canonical nested URL, or 404 if RLS can't see it.
- The Topbar on every signed-in page shows a campaign switcher (all the user's campaigns, oldest first) plus a "New campaign" link. Switching keeps the current view where possible: notes list → notes list, map → map, new note → new note, edit → edit, note detail → notes list.
- Creating a campaign navigates to the new campaign's notes list; renaming returns to the renamed campaign's notes list.
- Campaign names are trimmed, 1–80 characters, and unique per owner case-insensitively — enforced by zod and by DB constraints.
- Notes and relations remain strictly scoped to their campaign (a note in campaign B mentioning a note name from campaign A creates no relation).

Verify by: `npm test` (unit + integration), `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke` against a preview, and the manual steps in "Testing Strategy".

### Key Discoveries:

- `seed_default_note_types` already seeds every new campaign (`20260922120000_campaign_notes_schema.sql:166-185`) — creating a campaign is a plain RLS insert, no RPC needed.
- Signup coupling: `handle_new_user()` inserts `'My Campaign'` inside GoTrue's `auth.users` transaction (`contract-surfaces.md` "Signup coupling"); any new `campaigns` constraint must accept that row or signup breaks. `'My Campaign'` is trimmed, 11 chars, and the only campaign a fresh user has — safe.
- A top-level `return` in Astro frontmatter crashes this project's ESLint (`src/pages/map.astro:11-13`); redirect-only routes should therefore be `.ts` endpoints exporting `GET`, not `.astro` pages.
- PostgREST raises `22P02` (invalid uuid) for a malformed id in `.eq("id", …)`; existing code avoids it by validating with `UUID_RE` first (`src/pages/notes/[id].astro:10-13`).
- `createNoteSchema` is `.strict()` and must stay so (`src/lib/schemas/notes.ts:71-73`); the campaign id comes from the URL path, never the body.
- Integration helper `createTestUser()` (`tests/integration/helpers.ts:14`) is rate-limited (30 signups / 5 min shared with smoke) — reuse tenants per file via `beforeAll`.

## What We're NOT Doing

- Deleting campaigns (destructive cascade; not in the roadmap outcome).
- Per-account (cross-device) active-campaign persistence — the last-visited cookie is per browser and only picks a redirect target.
- Moving notes between campaigns (`campaign_id` stays non-updatable).
- Any change to relation detection, the map layout, or `MemoryMap`'s node/edge behavior beyond the click target URL.
- A campaigns index/picker page (`/campaigns` bare) — the switcher and redirects cover navigation. `/campaigns` itself 302s to the landing campaign like `/dashboard`.
- Per-user campaign count limits.
- Generated Supabase `Database` types.

## Implementation Approach

Bottom-up, each phase leaving the app working. Phase 1 adds the DB rules and the campaign service layer alongside the still-present `getActiveCampaign`, fully tested. Phase 2 moves every campaign-scoped page and the create-note API under `/campaigns/[campaignId]`, turns the old routes into redirect endpoints, introduces the landing resolver + cookie, and deletes `getActiveCampaign`. Phase 3 adds the user-visible create/rename/switch UI and its APIs on top of the new routes.

The trust rule throughout: **the URL's campaign id is untrusted input**. Every campaign-scoped page and API validates it as a UUID, then loads the campaign through the RLS-scoped client (`getCampaign`) and treats `null` as 404 before using the id for anything. The `last_campaign_id` cookie is equally untrusted and only ever selects a redirect target after the same check.

## Critical Implementation Details

- **Redirect-only routes as endpoints.** `/dashboard`, `/map`, `/notes/new`, `/notes/[id]` and `/campaigns` (bare) become `.ts` files exporting `GET` that return `context.redirect(…)`, because a top-level `return Astro.redirect()` in `.astro` frontmatter crashes this repo's ESLint. The corresponding `.astro` files are deleted (Astro rejects a `.astro` and `.ts` route at the same path). Static `/notes/new` still wins over dynamic `/notes/[id]`, and static `/campaigns/new` over `/campaigns/[campaignId]`.
- **UUID check before any query.** Both the route param and the cookie value must pass the UUID regex before reaching `.eq("id", …)`; otherwise PostgREST returns `22P02`, which the services turn into a thrown error (500) instead of a 404 / fallback.
- **Signup coupling.** The Phase 1 migration adds constraints to `campaigns`, a table written inside the signup transaction. The integration suite's `createTestUser()` exercising signup after the migration is the regression guard; do not add any constraint the `'My Campaign'` default could violate.

## Phase 1: Campaign data rules and service layer

### Overview

Enforce campaign-name rules in the DB and zod, and add the campaign service functions every later phase uses. No user-visible change.

### Changes Required:

#### 1. Campaign name constraints migration

**File**: `supabase/migrations/20260928120000_campaign_name_rules.sql`

**Intent**: Enforce the agreed name rules in the DB so a direct RLS insert/update with the public anon key can't bypass zod, mirroring how `notes.name` is protected.

**Contract**: `alter table public.campaigns add constraint campaigns_name_check check (name = btrim(name) and name <> '' and char_length(name) <= 80)`; `create unique index campaigns_owner_name_key on public.campaigns (owner_id, lower(name))`. Header comment notes the signup coupling (the `'My Campaign'` default satisfies both) and that the 80-char limit must stay in sync with `CAMPAIGN_NAME_MAX_LENGTH`.

#### 2. Campaign schema

**File**: `src/lib/schemas/campaigns.ts` (new), `src/lib/schemas/campaigns.test.ts` (new)

**Intent**: One zod schema validates both create and rename bodies; the length constant is shared with the React form.

**Contract**: `export const CAMPAIGN_NAME_MAX_LENGTH = 80`; `export const campaignNameSchema = z.object({ name: z.string().trim().min(1, …).max(80, …) }).strict()`, with the same compile-time assertion pattern as `notes.ts` against a new `SaveCampaignCommand` DTO. Unit tests: trims whitespace, rejects empty/whitespace-only, accepts exactly 80, rejects 81, rejects unknown keys (e.g. `owner_id`).

#### 3. Shared types

**File**: `src/types.ts`

**Intent**: DTOs for the campaign API and the switcher.

**Contract**: `SaveCampaignCommand { name: string }`; `CampaignSummary = Pick<Campaign, "id" | "name">`. Widen `ApiError["field"]` only if needed (the campaign form uses `"name"`, already present).

#### 4. Campaign services

**File**: `src/lib/services/campaigns.ts`

**Intent**: Replace the single-campaign resolver with explicit, RLS-scoped operations. `getActiveCampaign` stays in this phase (deleted in Phase 2) so the app keeps working.

**Contract**:
- `listCampaigns(supabase): Promise<CampaignSummary[]>` — oldest first (`created_at asc, id asc`).
- `getCampaign(supabase, id): Promise<Campaign | null>` — `null` for a malformed UUID (checked before querying), a nonexistent id, or another tenant's campaign.
- `createCampaign(supabase, ownerId, name): Promise<SaveCampaignResult>` and `renameCampaign(supabase, id, name): Promise<SaveCampaignResult>` where `SaveCampaignResult = { success: true; campaign: Campaign } | { success: false; reason: "duplicate_name" | "not_found" } | { success: false; reason: "unexpected"; error: unknown }`. `23505` → `duplicate_name`; a rename that updates zero rows (RLS-hidden or missing) → `not_found`; `renameCampaign` returns `not_found` for a malformed id (`!isUuid(id)`) before querying, so PostgREST's `22P02` never surfaces as `unexpected`/500. Raw DB errors never leave the service except in `unexpected` for logging (same pattern as `createNote`).
- `resolveLandingCampaign(supabase, lastCampaignId: string | undefined): Promise<Campaign | null>` — returns `getCampaign(lastCampaignId)` when that is non-null, else the oldest campaign, else `null`.
- A shared `UUID_RE` / `isUuid()` helper moves to `src/lib/utils.ts` (currently private to `src/pages/notes/[id].astro`).

#### 5. Integration tests

**File**: `tests/integration/campaigns-service.test.ts` (new)

**Intent**: Prove the DB rules, the ownership boundary and campaign-scoped relation isolation against a real local Supabase.

**Contract**: Two tenants via `createTestUser()` in `beforeAll`. Cases: `createCampaign` creates a campaign seeded with the 4 predefined note types; duplicate name differing only in case → `duplicate_name`; a direct `from("campaigns").insert` with `" padded"` and with an 81-char name fails with `23514`; `renameCampaign` succeeds and trims are enforced by the DB check; renaming to another own campaign's name → `duplicate_name`; renaming tenant B's campaign as tenant A → `not_found`; renaming `"not-a-uuid"` → `not_found`; `getCampaign` returns `null` for tenant B's id and for `"not-a-uuid"`; `listCampaigns` returns oldest first with the signup default first; `resolveLandingCampaign` returns the cookie campaign when owned, and falls back to the oldest for `undefined`, a foreign id and a malformed id; a note in campaign 2 whose content mentions a note name from campaign 1 produces no relation in either campaign.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- Unit tests pass: `npm run test:unit`
- Integration tests pass (including existing suites, proving signup still works): `npm run test:integration`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`

#### Manual Verification:

- Applying the migration against a copy of production data (or `supabase db push --dry-run` against the linked project) reports no constraint violation for existing campaigns
- Signing up a new user in the running dev app still succeeds and lands on the dashboard

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Campaign-scoped routing

### Overview

Move every campaign-scoped page and the create-note API under `/campaigns/[campaignId]`, add the landing resolver and last-visited cookie, turn the old routes into redirects, and remove `getActiveCampaign`.

### Changes Required:

#### 1. Last-visited cookie helper

**File**: `src/lib/campaign-cookie.ts` (new)

**Intent**: One place owns the cookie name and attributes so pages set it and redirect endpoints read it consistently.

**Contract**: `LAST_CAMPAIGN_COOKIE = "last_campaign_id"`; `rememberCampaign(cookies: AstroCookies, id: string)` sets it `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` in production, max-age 1 year; `readRememberedCampaign(cookies): string | undefined`. The value is never trusted — it only feeds `resolveLandingCampaign`.

#### 2. Nested campaign pages

**Files**: `src/pages/campaigns/[campaignId]/index.astro`, `src/pages/campaigns/[campaignId]/map.astro`, `src/pages/campaigns/[campaignId]/notes/new.astro`, `src/pages/campaigns/[campaignId]/notes/[noteId].astro` (all new; bodies moved from `dashboard.astro`, `map.astro`, `notes/new.astro`, `notes/[id].astro`)

**Intent**: Each page resolves its campaign from the URL via `getCampaign`, 404s (status + "not found or isn't yours" message, via conditional rendering) when it's `null`, otherwise calls `rememberCampaign` and renders the campaign's data. Internal links (Memory map, New note, note items, empty-state CTAs) point to the nested URLs.

**Contract**:
- Notes list: heading is the campaign name; links to `./map` and `./notes/new` equivalents under `/campaigns/${campaign.id}`.
- Note detail: checks `isUuid(noteId)` first (404 when malformed, no query), then loads the note with `getNote`; 404 when the note is `null` **or** `note.campaign_id !== campaign.id`; the back link reads "← Back to {campaign.name}" and targets `/campaigns/${campaign.id}`.
- Map: passes `campaignId` to `MemoryMap`.
- New note: passes `campaignId` to `CreateNoteForm`.
- All pass `campaignId` to `Topbar` (declared as `interface Props { campaignId?: string }`). The `view` prop and its `CampaignView` type are added in Phase 3 §5 — passing an undeclared `view` now would fail `astro check`.

#### 3. Old routes become redirect endpoints

**Files**: delete `src/pages/dashboard.astro`, `src/pages/map.astro`, `src/pages/notes/new.astro`, `src/pages/notes/[id].astro`; add `src/pages/dashboard.ts`, `src/pages/map.ts`, `src/pages/notes/new.ts`, `src/pages/notes/[id].ts`, `src/pages/campaigns/index.ts`

**Intent**: Keep bookmarks, the sign-in redirect and old in-app links working.

**Contract**: Each exports `prerender = false` and `GET`. `/dashboard` and `/campaigns` → 302 `/campaigns/{landing.id}`; `/map` → `/campaigns/{landing.id}/map`; `/notes/new` → `/campaigns/{landing.id}/notes/new`, where landing = `resolveLandingCampaign(supabase, readRememberedCampaign(cookies))`. If there is no landing campaign (or Supabase isn't configured) respond 404 with a plain message. `/notes/[id]` → 302 `/campaigns/{note.campaign_id}/notes/{id}` when `isUuid(id)` and `getNote` finds it, else 404. Unauthenticated requests are already redirected by middleware.

#### 4. Nested create-note API

**Files**: delete `src/pages/api/notes/index.ts`; add `src/pages/api/campaigns/[campaignId]/notes.ts`

**Intent**: Same behavior as today's `POST /api/notes`, but the campaign comes from the path and is ownership-checked first.

**Contract**: `POST /api/campaigns/[campaignId]/notes`, body unchanged (`createNoteSchema`, still `.strict()`, update its doc comment: the campaign id comes from the path). Order: 401 if no user → 500 if no Supabase → 404 `ApiError` if `getCampaign` is `null` → JSON parse / zod 400 → `createNote(supabase, campaign.id, …)` with the existing 409/400/500 mapping → 201 `{ id }`.

#### 5. Clients follow the new URLs

**Files**: `src/components/hooks/useCreateNote.ts`, `src/components/notes/CreateNoteForm.tsx`, `src/components/memory-map/MemoryMap.tsx`

**Intent**: The island and hook build nested URLs.

**Contract**: `useCreateNote(campaignId: string)` posts to `/api/campaigns/${campaignId}/notes` and navigates to `/campaigns/${campaignId}/notes/${id}`; `CreateNoteForm` gains a `campaignId: string` prop and passes it through; `MemoryMap` gains `campaignId: string` and navigates to `/campaigns/${campaignId}/notes/${node.id}`.

#### 6. Middleware, sign-in, Topbar links, removal of the old resolver

**Files**: `src/middleware.ts`, `src/pages/api/auth/signin.ts`, `src/components/Topbar.astro`, `src/lib/services/campaigns.ts`, `tests/integration/notes-service.test.ts`, `src/types.ts`, `src/lib/supabase.ts`

**Intent**: Protect the new prefix and remove the now-unused single-campaign resolver.

**Contract**: `PROTECTED_ROUTES` adds `"/campaigns"`. Sign-in keeps redirecting to `/dashboard` (which resolves the landing campaign). Topbar's Dashboard/Map links point to `/campaigns/{campaignId}` and `/campaigns/{campaignId}/map` when a `campaignId` prop is given, otherwise to `/dashboard` and `/map`. `getActiveCampaign` is deleted; its test in `notes-service.test.ts` is removed (covered by `resolveLandingCampaign` tests from Phase 1). Stale comments are updated so criterion 2.7's grep passes: the `CreateNoteCommand` doc comment in `src/types.ts:49-51` (campaign id comes from the path, ownership-checked via `getCampaign`) and the `cookieOptions` comment in `src/lib/supabase.ts:10` (cite `POST /api/campaigns/[campaignId]/notes`).

#### 7. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Keep the smoke check meaningful under the new routing.

**Contract**: Signed-in `/dashboard` and `/map` now expect `302` with location starting `/campaigns/`; add a step that requests the location returned by `/dashboard` and expects `200`, and one that requests `/campaigns/00000000-0000-0000-0000-000000000000` and expects `404`. Anonymous `/campaigns/…` expects `302 /auth/signin`. Zero dependencies preserved.

#### 8. Docs

**Files**: `docs/reference/contract-surfaces.md`, `README.md`, `CLAUDE.md`

**Intent**: Keep the load-bearing names registry truthful.

**Contract**: Replace "Active campaign resolution" with "Campaign resolution" (URL is authoritative; `getCampaign` ownership check; `last_campaign_id` cookie only picks redirect targets; `resolveLandingCampaign`); replace the `POST /api/notes` entry with `POST /api/campaigns/[campaignId]/notes`; add the `campaigns_name_check` / `campaigns_owner_name_key` constraints and new migration; update the pages list. README route table and CLAUDE.md's "Protected page example" point at `src/pages/campaigns/[campaignId]/index.astro`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Production build succeeds: `npm run build`
- Smoke test passes against the preview build: `npm run smoke`
- No references to `getActiveCampaign` or `/api/notes` remain in `src/`: `grep -rn "getActiveCampaign\|/api/notes" src` returns nothing

#### Manual Verification:

- Signing in lands on `/campaigns/<default id>` showing the notes list
- Creating a note from `/campaigns/<id>/notes/new` lands on its nested detail page; the back link shows the campaign name
- Clicking a node on `/campaigns/<id>/map` opens the nested note URL
- Old `/dashboard`, `/map`, `/notes/new` and `/notes/<id>` links redirect to the right nested URLs
- Another user's campaign id in the URL, a malformed id, and a note id under the wrong campaign all show 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Create, rename and switch UI

### Overview

Add the user-visible campaign management: create and rename forms with their APIs, and the Topbar switcher that keeps the current view.

### Changes Required:

#### 1. Campaign APIs

**Files**: `src/pages/api/campaigns/index.ts` (new), `src/pages/api/campaigns/[campaignId]/index.ts` (new)

**Intent**: JSON endpoints for create and rename, mirroring the create-note route's error conventions.

**Contract**: `POST /api/campaigns` body `campaignNameSchema` → 201 `{ id }`; 409 `{ error: 'A campaign named "…" already exists.', field: "name" }`; 400 zod/JSON errors with `field`; 401 unauthenticated; 500 generic with `console.error` for `unexpected`. `PATCH /api/campaigns/[campaignId]` same body → 200 `{ id }`; 404 for malformed/foreign/missing id (`not_found`); 409/400/401/500 as above. Owner id for create is `context.locals.user.id` (RLS `with check` also enforces it).

#### 2. Campaign form island + hook

**Files**: `src/components/campaigns/CampaignForm.tsx` (new), `src/components/hooks/useSaveCampaign.ts` (new)

**Intent**: One form component serves create and rename, reusing `FormField`, `ServerError` and `SubmitButton`/`Button` from the existing auth/note forms.

**Contract**: `CampaignForm({ mode: "create" } | { mode: "rename"; campaignId: string; initialName: string })`. Client-side validation mirrors `campaignNameSchema` via `CAMPAIGN_NAME_MAX_LENGTH`. `useSaveCampaign` POSTs or PATCHes accordingly and on success navigates to `/campaigns/${id}`; server errors render under the name field when `field === "name"`, otherwise as a general error (same pattern as `useCreateNote`).

#### 3. Create and rename pages

**Files**: `src/pages/campaigns/new.astro` (new), `src/pages/campaigns/[campaignId]/edit.astro` (new), `src/pages/campaigns/[campaignId]/index.astro`

**Intent**: Host the form; add the "Rename" entry point next to the campaign heading.

**Contract**: `/campaigns/new` renders `CampaignForm mode="create"`. `/campaigns/[campaignId]/edit` loads the campaign via `getCampaign` (404 when `null`), remembers it, renders `CampaignForm mode="rename"` with the current name and a Cancel link back to the notes list. The notes-list heading gains a small "Rename" link to `./edit`.

#### 4. Switch path helper

**File**: `src/lib/campaign-paths.ts` (new), `src/lib/campaign-paths.test.ts` (new)

**Intent**: Pure mapping from the current view to the equivalent URL in another campaign, so the switcher's "same view if possible" rule is unit-testable.

**Contract**: `type CampaignView = "notes" | "map" | "new-note" | "note" | "edit" | "none"`; `campaignSwitchPath(view, targetCampaignId): string` → `notes`/`note`/`none` → `/campaigns/{id}`, `map` → `/campaigns/{id}/map`, `new-note` → `/campaigns/{id}/notes/new`, `edit` → `/campaigns/{id}/edit`. Unit tests cover every view.

#### 5. Topbar switcher

**Files**: `src/components/Topbar.astro`, `src/components/campaigns/CampaignSwitcher.tsx` (new), each campaign page and `/campaigns/new`

**Intent**: Every signed-in page shows the user's campaigns and lets them switch in one action.

**Contract**: `Topbar` props become `{ campaignId?: string; view?: CampaignView }`; when a user is signed in it loads `listCampaigns` itself and renders a small `CampaignSwitcher` island (`client:load`) — a native `<select>` of campaigns (current one selected; a disabled placeholder when `campaignId` is absent, e.g. on `/campaigns/new`) whose `onChange` calls `window.location.assign(campaignSwitchPath(view ?? "none", selectedId))` — plus a "New campaign" link to `/campaigns/new`. Each campaign page (already passing `campaignId` since Phase 2) now also passes its `view`: notes list `"notes"`, map `"map"`, new note `"new-note"`, note detail `"note"`, edit `"edit"`, `/campaigns/new` none.

#### 6. Docs

**Files**: `docs/reference/contract-surfaces.md`, `README.md`

**Intent**: Register the surfaces this phase (and Phase 1's DTOs) introduce.

**Contract**: contract-surfaces.md gains `POST /api/campaigns` and `PATCH /api/campaigns/[campaignId]` entries (body `campaignNameSchema`, `.strict()`; 201/200 `{ id }`, 400/401/404/409/500 mapping); the Routes section adds `/campaigns/new` and `/campaigns/[campaignId]/edit`; "Shared TypeScript types" adds `SaveCampaignCommand` and `CampaignSummary`; "Campaign resolution" names the `last_campaign_id` cookie (`src/lib/campaign-cookie.ts`) if Phase 2 §8 didn't already. README route table adds the two pages.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (incl. `campaign-paths.test.ts`, `campaigns.test.ts`): `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Production build succeeds: `npm run build`
- Smoke test passes against the preview build: `npm run smoke`

#### Manual Verification:

- Creating "Curse of Strahd" from "New campaign" lands on its empty notes list; the switcher now lists both campaigns
- Creating a campaign named "my campaign" (case variant of an existing one) shows the duplicate error under the name field
- Renaming a campaign updates the heading and the switcher entry; renaming to an existing name shows the duplicate error
- Switching on the map opens the other campaign's map; switching on a note detail opens the other campaign's notes list
- Notes and map connections of one campaign never appear in the other
- After switching to the second campaign, signing out and back in lands on the second campaign
- Layout is usable at phone width (switcher does not overflow the Topbar)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `campaignNameSchema`: trimming, empty/whitespace, 80 vs 81 chars, unknown keys rejected.
- `campaignSwitchPath`: every `CampaignView` maps to the expected path.

### Integration Tests:

- `tests/integration/campaigns-service.test.ts` (Phase 1): create seeds predefined types; case-insensitive uniqueness per owner; DB check rejects untrimmed and 81-char names on direct insert; rename success / duplicate / foreign (`not_found`); `getCampaign` foreign + malformed → `null`; `listCampaigns` ordering; `resolveLandingCampaign` cookie hit / fallback cases; no cross-campaign relations.
- Existing suites keep passing (their `createTestUser()` signups are the signup-coupling regression check).

### Manual Testing Steps:

1. Sign in → land on the default campaign's notes list.
2. Create a second campaign; create a note "Bob" in campaign 1 and a note mentioning "Bob" in campaign 2 → no connection on either map.
3. Switch between campaigns from the map, notes list, new-note page and a note detail; confirm the landing view for each.
4. Rename a campaign; try a duplicate name.
5. Paste another user's campaign id and a note id under the wrong campaign → 404.
6. Open old `/dashboard`, `/map`, `/notes/<id>` bookmarks → redirected correctly.

## Performance Considerations

Each signed-in page adds one small `listCampaigns` query (for the Topbar) and one `getCampaign` lookup — both indexed (`campaigns_owner_id_idx`, primary key). Negligible for a single-user tool.

## Migration Notes

- The new migration only adds a check constraint and a unique index. Production currently holds one `'My Campaign'` per user, which satisfies both; the Phase 1 manual step confirms this before deploy.
- Rollback: drop `campaigns_name_check` and `campaigns_owner_name_key`; the routing changes are code-only.
- URL change: existing bookmarks keep working via the Phase 2 redirect endpoints.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` FR-002
- S-01 handoff: `src/lib/services/campaigns.ts:5-13`, `docs/reference/contract-surfaces.md` ("Active campaign resolution")
- Pattern — create-note API + result mapping: `src/pages/api/notes/index.ts`, `src/lib/services/notes.ts:101-129`
- Pattern — 404 via status + conditional render: `src/pages/notes/[id].astro`
- Prior plans: `context/archive/2026-09-23-create-notes/`, `context/archive/2026-09-26-auto-relations-memory-map/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Campaign data rules and service layer

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB: `npx supabase db reset` — 95df049
- [x] 1.2 Unit tests pass: `npm run test:unit` — 95df049
- [x] 1.3 Integration tests pass (including existing suites, proving signup still works): `npm run test:integration` — 95df049
- [x] 1.4 Linting passes: `npm run lint` — 95df049
- [x] 1.5 Type checking passes: `npx astro check` — 95df049

#### Manual

- [x] 1.6 Applying the migration against a copy of production data (or `supabase db push --dry-run` against the linked project) reports no constraint violation for existing campaigns — 95df049
- [x] 1.7 Signing up a new user in the running dev app still succeeds and lands on the dashboard — 95df049

### Phase 2: Campaign-scoped routing

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — 972f2b7
- [x] 2.2 Integration tests pass: `npm run test:integration` — 972f2b7
- [x] 2.3 Linting passes: `npm run lint` — 972f2b7
- [x] 2.4 Type checking passes: `npx astro check` — 972f2b7
- [x] 2.5 Production build succeeds: `npm run build` — 972f2b7
- [x] 2.6 Smoke test passes against the preview build: `npm run smoke` — 972f2b7
- [x] 2.7 No references to `getActiveCampaign` or `/api/notes` remain in `src/`: `grep -rn "getActiveCampaign\|/api/notes" src` returns nothing — 972f2b7

#### Manual

- [x] 2.8 Signing in lands on `/campaigns/<default id>` showing the notes list — 972f2b7
- [x] 2.9 Creating a note from `/campaigns/<id>/notes/new` lands on its nested detail page; the back link shows the campaign name — 972f2b7
- [x] 2.10 Clicking a node on `/campaigns/<id>/map` opens the nested note URL — 972f2b7
- [x] 2.11 Old `/dashboard`, `/map`, `/notes/new` and `/notes/<id>` links redirect to the right nested URLs — 972f2b7
- [x] 2.12 Another user's campaign id in the URL, a malformed id, and a note id under the wrong campaign all show 404 — 972f2b7

### Phase 3: Create, rename and switch UI

#### Automated

- [x] 3.1 Unit tests pass (incl. `campaign-paths.test.ts`, `campaigns.test.ts`): `npm run test:unit` — 12f7f0c
- [x] 3.2 Integration tests pass: `npm run test:integration` — 12f7f0c
- [x] 3.3 Linting passes: `npm run lint` — 12f7f0c
- [x] 3.4 Type checking passes: `npx astro check` — 12f7f0c
- [x] 3.5 Production build succeeds: `npm run build` — 12f7f0c
- [x] 3.6 Smoke test passes against the preview build: `npm run smoke` — 12f7f0c

#### Manual

- [x] 3.7 Creating "Curse of Strahd" from "New campaign" lands on its empty notes list; the switcher now lists both campaigns — 12f7f0c
- [x] 3.8 Creating a campaign named "my campaign" (case variant of an existing one) shows the duplicate error under the name field — 12f7f0c
- [x] 3.9 Renaming a campaign updates the heading and the switcher entry; renaming to an existing name shows the duplicate error — 12f7f0c
- [x] 3.10 Switching on the map opens the other campaign's map; switching on a note detail opens the other campaign's notes list — 12f7f0c
- [x] 3.11 Notes and map connections of one campaign never appear in the other — 12f7f0c
- [x] 3.12 After switching to the second campaign, signing out and back in lands on the second campaign — 12f7f0c
- [x] 3.13 Layout is usable at phone width (switcher does not overflow the Topbar) — 12f7f0c
