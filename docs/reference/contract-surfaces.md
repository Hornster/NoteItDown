# Contract Surfaces

Load-bearing names that downstream changes must not silently rename without updating every dependent. Introduced by `context/changes/campaign-notes-schema/plan.md` (migration `supabase/migrations/20260922120000_campaign_notes_schema.sql`).

## campaigns

- Table: `public.campaigns`
- Columns: `id`, `owner_id` (→ `auth.users.id`, cascade delete), `name`, `created_at`, `updated_at`
- Ownership anchor: `campaigns.owner_id` is the single source of truth for ownership across the whole schema — `notes` and `relations` never carry their own `owner_id`; their RLS joins back to this column.
- RLS policies: `campaigns_select_own`, `campaigns_insert_own`, `campaigns_update_own`, `campaigns_delete_own` (all scoped to `owner_id = auth.uid()`)
- Column UPDATE grant: `authenticated` may update only `name` — `id` and `owner_id` are immutable via the API (`20260923120000_restrict_update_columns.sql`).
- Trigger: `campaigns_set_updated_at` (before update, via `public.set_updated_at()`)
- Trigger: `campaigns_seed_note_types` (after insert, via `public.seed_default_note_types()`) — seeds the 4 predefined note types on every campaign, not just the signup default.
- Name check constraint: `campaigns_name_check (name = btrim(name) and name <> '' and char_length(name) <= 80)` (`20260928120000_campaign_name_rules.sql`) — trimmed, non-empty, at most 80 chars. Must stay in sync with `CAMPAIGN_NAME_MAX_LENGTH` in `src/lib/schemas/campaigns.ts`.
- Uniqueness: `campaigns_owner_name_key` unique index on `(owner_id, lower(name))` — case-insensitive per owner (`20260928120000_campaign_name_rules.sql`).

## note_types

- Table: `public.note_types`
- Columns: `id`, `campaign_id` (→ `campaigns.id`, cascade delete), `name`, `is_predefined`, `created_at`
- Composite unique target: `note_types_campaign_id_id_key (campaign_id, id)` — required by `notes`' composite FK to keep a note's type scoped to its own campaign.
- Uniqueness: `note_types_campaign_name_key` on `(campaign_id, lower(name))` — case-insensitive per campaign.
- Name check constraint: `name = btrim(name) and name <> ''` — trimmed and non-empty.
- RLS policies: `note_types_select_own_campaign`, `note_types_insert_own_campaign` (insert forbids `is_predefined = true` — predefined rows come only from the seed trigger). No `UPDATE`/`DELETE` policy exists yet.
- Predefined names (seeded verbatim by `seed_default_note_types()`): `NPC`, `Place`, `Quest`, `Observation`.

## notes

- Table: `public.notes`
- Columns: `id`, `campaign_id` (→ `campaigns.id`, cascade delete), `type_id`, `name`, `content`, `created_at`, `updated_at`
- Composite FK: `notes_type_same_campaign_fkey (campaign_id, type_id)` → `note_types (campaign_id, id)`, `on delete restrict` — enforces campaign-scoping since plain FKs bypass RLS.
- Composite unique target: `notes_campaign_id_id_key (campaign_id, id)` — required by `relations`' composite FKs.
- Uniqueness: `notes_campaign_name_key` on `(campaign_id, lower(name))`.
- Name check constraint: `name = btrim(name) and name <> ''` — trimmed and non-empty.
- Length check constraints (`20260924120000_create_note_function.sql`): `notes_name_length_check (char_length(name) <= 120)`, `notes_content_length_check (char_length(content) <= 20000)`. `notes` is not part of the signup/seeding trigger chain (see below), so unlike `note_types.name`'s 60-char limit these are enforced in the DB as well as in zod — the anon key is public, and RLS allows a direct `insert` or an `rpc('create_note')` call that skips zod. **Must stay in sync with `createNoteSchema`** (`src/lib/schemas/notes.ts`).
- Trigger: `notes_set_updated_at` (before update, via `public.set_updated_at()`)
- RLS policies: `notes_select_own_campaign`, `notes_insert_own_campaign`, `notes_update_own_campaign`, `notes_delete_own_campaign`.
- Column UPDATE grant: `authenticated` may update only `name`, `content`, `type_id` — `id` and `campaign_id` are immutable via the API, so a note cannot be moved between campaigns (`20260923120000_restrict_update_columns.sql`).

## relations

- Table: `public.relations`
- Columns: `id`, `campaign_id` (→ `campaigns.id`, cascade delete — a scope column, not an owner column), `note_a_id`, `note_b_id`, `created_at`
- Composite FKs: `relations_note_a_same_campaign_fkey` / `relations_note_b_same_campaign_fkey`, both `(campaign_id, note_x_id)` → `notes (campaign_id, id)`, `on delete cascade`.
- **Canonical ordering invariant**: `relations_canonical_order` check requires `note_a_id < note_b_id`. Undirected edges are stored exactly once; any future insert/query logic (e.g. S-02's relation detection) must sort the pair before insert/lookup.
- Uniqueness: `relations_unique_pair (note_a_id, note_b_id)` — relies on the canonical ordering above to prevent duplicate edges in either direction.
- RLS policies: `relations_select_own_campaign`, `relations_insert_own_campaign`, `relations_delete_own_campaign`. **No `UPDATE` policy** — rows are only ever created by detection or removed by re-detection (FR-011).
- **Rows are written only by `public.detect_note_relations()` and `public.recompute_campaign_relations()`** (`supabase/migrations/20260926120000_relation_detection.sql`) — see "Relation detection" below. No app code inserts into or deletes from `relations`. **Not enforced at the DB level:** `relations_insert_own_campaign` / `relations_delete_own_campaign` still let an authenticated user write their own campaign's rows directly via PostgREST (the `security invoker` detection functions depend on those policies). Such hand-written rows self-heal: the next write of either endpoint note, or `recompute_campaign_relations`, restores the matched set. FR-011 is therefore a UI/app-code guarantee, not a DB invariant.

## Trigger functions

- `public.set_updated_at()` — generic `before update` trigger, sets `updated_at = now()`. Fired by `campaigns_set_updated_at`, `notes_set_updated_at`.
- `public.seed_default_note_types()` — `security definer`, fires `after insert` on `public.campaigns` via `campaigns_seed_note_types`. Inserts the 4 predefined `note_types` rows.
- `public.handle_new_user()` — `security definer`, fires `after insert` on `auth.users` via `on_auth_user_created`. Creates the default `'My Campaign'` row for every new signup, which in turn fires `campaigns_seed_note_types`.
- **Signup coupling**: `handle_new_user()` → `seed_default_note_types()` run inside GoTrue's `auth.users` insert transaction. Any error there (e.g. a new constraint on `campaigns` or `note_types` that the default rows violate) aborts signup with "Database error saving new user". Check new constraints on those two tables against the seeded values.
- `public.notes_detect_relations()` — `security invoker`, `set search_path = ''`, fires `after insert or update of name, content` on `public.notes` via the trigger `notes_detect_relations`. Calls `detect_note_relations(new.id)`; skips on `UPDATE` when both `name` and `content` are unchanged. See "Relation detection" below.

## `create_note` function

- `public.create_note(p_campaign_id uuid, p_name text, p_content text, p_type_id uuid default null, p_new_type_name text default null) returns public.notes` — defined in `supabase/migrations/20260924120000_create_note_function.sql`.
- `language plpgsql`, `security invoker` (RLS applies as the calling user — this grants no more than direct table access already allows), `set search_path = ''`.
- Atomically resolves-or-creates the note's type, then inserts the note, so a failed note insert (e.g. a duplicate name) can never leave behind a custom `note_types` row the user can't delete (`note_types` has no `DELETE` policy).
- Type resolution delegates to `public.resolve_note_type` (redefined via `create or replace` in `20260930120000_note_edit_delete_functions.sql`; behaviour unchanged). The rules below describe that shared resolution.
- Exactly one of `p_type_id` / `p_new_type_name` must be non-null, else `raise exception` with SQLSTATE `22023`.
- With `p_new_type_name`: `insert ... on conflict (campaign_id, lower(name)) do nothing`; if no row returns, the existing type is looked up case-insensitively. A predefined type counts as a match (`'npc'` resolves to `NPC`) — no duplicate custom type is ever created for a name that collides with a predefined one.
- Propagated SQLSTATEs the caller maps: `23505` (duplicate note name), `23514` (name/content length check), `23503` (type not in this campaign — composite FK), `42501` (RLS denial, e.g. a foreign campaign id).
- Grants: `revoke execute ... from public, anon; grant execute ... to authenticated`.

## `resolve_note_type`, `update_note`, `delete_note` functions

Defined in `supabase/migrations/20260930120000_note_edit_delete_functions.sql`. All are `language plpgsql`, `security invoker`, `set search_path = ''`, with `revoke execute ... from public, anon; grant execute ... to authenticated`.

- `public.resolve_note_type(p_campaign_id uuid, p_type_id uuid, p_new_type_name text) returns uuid` — the type resolution moved out of `create_note` and shared by `create_note` and `update_note`. Exactly one of `p_type_id` / `p_new_type_name` must be non-null, else SQLSTATE `22023`. With a name: `insert ... on conflict (campaign_id, lower(name)) do nothing`, then case-insensitive lookup of the existing type.
- `public.update_note(p_campaign_id uuid, p_note_id uuid, p_name text, p_content text, p_type_id uuid default null, p_new_type_name text default null) returns jsonb` — locks the note (`where id = p_note_id and campaign_id = p_campaign_id ... for update`); no row (missing, foreign campaign or hidden by RLS) raises SQLSTATE `P0002`. Resolves the type, snapshots the other-note ids of the note's relations, runs the `UPDATE` (the existing `notes_detect_relations` trigger re-detects), snapshots again in a separate statement. Returns `{ "note": <notes row>, "rechecked": boolean, "added": [{ "note_id", "name" }], "removed": [{ "note_id", "name" }] }`; arrays ordered by `lower(name)`, `name` is the other note's current name. `rechecked` is `new.name <> old.name or new.content <> old.content` (case-sensitive, mirrors the trigger's skip rule; a case-only rename counts). Propagated SQLSTATEs: `P0002`, `23505`, `23514`, `23503`, `42501`, `22023`.
- `public.delete_note(p_campaign_id uuid, p_note_id uuid) returns jsonb` — same `P0002` rule. Snapshots the note's relations with the other notes' names, then `DELETE`s the note (the composite FK cascade removes the relations). Returns `{ "name": <deleted note name>, "removed": [{ "note_id", "name" }] }`, ordered by `lower(name)`.

## Relation detection

Relations are the automatic, atomic output of every note write (FR-007, FR-011). All matching logic lives in one function (`note_mentions`) so S-04 reuses the exact same engine and no TS copy can drift from it. Defined in `supabase/migrations/20260926120000_relation_detection.sql`.

- `public.note_mentions(p_content text, p_name text) returns boolean` — `language sql immutable strict`, `set search_path = ''`. True when `p_name` occurs in `p_content` case-insensitively, with a non-word character (anything but `[[:alnum:]_]`) or the start/end of the text on each side. Regex metacharacters in `p_name` are escaped so it matches literally.
- `public.detect_note_relations(p_note_id uuid) returns void` — `plpgsql`, `security invoker`, `set search_path = ''`. Loads the note (returns quietly if RLS hides it or it's missing), computes the full desired pair set against every other note in the same campaign (`note_mentions(o.content, note.name) or note_mentions(note.content, o.name)`, stored as `(least(ids), greatest(ids))`), deletes this note's stale relations, and inserts the missing ones (`on conflict (note_a_id, note_b_id) do nothing`).
- `public.recompute_campaign_relations(p_campaign_id uuid) returns void` — `plpgsql`, `security invoker`, `set search_path = ''`. Recomputes every note's relations in one campaign. Idempotent; serves as both the backfill for pre-existing notes and the repair path for the accepted concurrent-create race.
- `public.notes_detect_relations() returns trigger` — `plpgsql`, `security invoker`, `set search_path = ''`. Calls `detect_note_relations(new.id)`; skips on `UPDATE` when both `name` and `content` are unchanged. Returns `null`.
- Trigger: `notes_detect_relations`, `after insert or update of name, content on public.notes for each row`.
- Grants: `revoke execute … from public, anon` and `grant execute … to authenticated` on `note_mentions`, `detect_note_relations` and `recompute_campaign_relations`. **Function EXECUTE grants cascade** — the trigger's `security invoker` functions run as the calling `authenticated` user, and Postgres checks EXECUTE on every nested call, so all three must be granted to `authenticated`, not only revoked from `anon`. The trigger function `notes_detect_relations` itself is revoke-only (no grant) — trigger invocation doesn't require direct EXECUTE privilege.
- **Matching rule**: case-insensitive; a relation exists iff A's name occurs in B's content, or B's name occurs in A's content (checked both directions, stored as one undirected edge); a note never relates to itself; names are matched literally (metacharacters escaped) with non-word-character guards on both sides (or start/end of text).
- **ctype dependency**: how `[:alnum:]` and `~*` classify non-ASCII letters (Ł, é) depends on the database's default locale provider (ICU vs libc). Local Supabase uses ICU (`en_US.UTF-8`). Before pushing to a hosted project, probe its behaviour with `select 'Ł' ~ '[[:alnum:]]' as alnum_ok, 'ŁÓDŹ' ~* 'łódź' as icase_ok;`; if either is false, add an explicit `collate "und-x-icu"` to the content operand in `note_mentions`.
- **Edit/delete reporting reads, never writes**: `update_note` / `delete_note` only read `relations` (before/after snapshots) to report the diff; the rows are still written only by detection (trigger) or removed by the FK cascade.
- **Concurrent-create race accepted**: two notes committed at the same instant in one campaign can each miss the other's uncommitted row. This is accepted as a risk for a single-user tool; `recompute_campaign_relations` is the repair path.

## `POST /api/campaigns/[campaignId]/notes`

- File: `src/pages/api/campaigns/[campaignId]/notes.ts`. `export const prerender = false`.
- Request body (`CreateNoteCommand`, zod-validated by `createNoteSchema`, `.strict()`): `{ name: string; content: string; type: { kind: "existing"; id: string } | { kind: "new"; name: string } }`.
- **No campaign id is accepted from the body, ever.** The campaign comes from the URL path and is ownership-checked server-side via `getCampaign` before use — the schema's `.strict()` rejects an unknown `campaign_id` body key outright.
- Order: 401 `ApiError` if unauthenticated (JSON, not a redirect) → 500 `ApiError` if Supabase isn't configured → 404 `ApiError` if `getCampaign` returns null for the path's `campaignId` → 400 `ApiError` with `field` on a non-JSON body or a zod failure → `createNote` with the existing 409 (`field: "name"`, duplicate) / 400 (`field: "type"`, invalid type) / 500 (generic, logged server-side via `console.error`) mapping → 201 `{ id }` on success.
- `ApiError`: `{ error: string; field?: "name" | "content" | "type" }` (`src/types.ts`).

## `PATCH` / `DELETE /api/campaigns/[campaignId]/notes/[noteId]`

- File: `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts`. `export const prerender = false`. Services: `updateNote` / `deleteNote` (`src/lib/services/notes.ts`), thin wrappers over the `update_note` / `delete_note` RPCs.
- Guard order (both verbs): 401 `ApiError` if unauthenticated → 500 if Supabase isn't configured → 404 if `campaignId` or `noteId` fails `isUuid`. There is **no `getCampaign` pre-check**: the 404 for a missing, foreign-campaign or other-tenant note comes from the RPC's SQLSTATE `P0002` (`not_found`), which is RLS-indistinguishable from "doesn't exist".
- `PATCH`: body is `UpdateNoteCommand` (same shape as `CreateNoteCommand`), validated by `updateNoteSchema` (`= createNoteSchema`, `.strict()`). Then 400 `ApiError` with `field` on a non-JSON body or zod failure → `updateNote` mapping: `duplicate_name` (`23505`) → 409 `field: "name"`; `invalid_type` (`23503`/`42501`/`22023`) → 400 `field: "type"`; `not_found` (`P0002`) → 404; `unexpected` → 500 generic (logged via `console.error`) → 200 `UpdateNoteResponse`.
- `DELETE`: no body. `deleteNote` mapping: `not_found` (`P0002`) → 404; `unexpected` → 500 generic (logged) → 200 `DeleteNoteResponse`.
- Responses: `UpdateNoteResponse { id, name, rechecked, added: RelationChange[], removed: RelationChange[] }`; `DeleteNoteResponse { name, removed: RelationChange[] }`; `RelationChange { note_id, name }`.
- `countNoteRelations(supabase, noteId)` (`src/lib/services/relations.ts`) is a head-only exact count of relations where the note is `note_a_id` or `note_b_id` (for the delete dialog); throws on error.

## `POST /api/campaigns` and `PATCH /api/campaigns/[campaignId]`

- Files: `src/pages/api/campaigns/index.ts` (create), `src/pages/api/campaigns/[campaignId]/index.ts` (rename). Both `export const prerender = false`.
- Request body (`SaveCampaignCommand`, zod-validated by `campaignNameSchema`, `.strict()`): `{ name: string }`.
- `POST /api/campaigns`: owner id is `context.locals.user.id` (never accepted from the body — `.strict()` rejects an unknown `owner_id` key outright; RLS `with check` also enforces it independently). Order: 401 `ApiError` if unauthenticated → 500 if Supabase isn't configured → 400 with `field: "name"` on a non-JSON body or a zod failure → `createCampaign` with 409 (`field: "name"`, duplicate, case-insensitive per owner) / 500 (generic, logged via `console.error`) mapping → 201 `{ id }` on success.
- `PATCH /api/campaigns/[campaignId]`: same body and 401/500/400 order, then 404 `ApiError` when `campaignId` is absent from the path → `renameCampaign` with 404 (`not_found` — malformed, foreign, or missing id, RLS-indistinguishable) / 409 (`field: "name"`, duplicate) / 500 (generic, logged) mapping → 200 `{ id }` on success.
- `ApiError`: `{ error: string; field?: "name" | "content" | "type" }` (`src/types.ts`).

## Campaign resolution

- The URL is authoritative: every campaign-scoped page and API route resolves its campaign from the path (`[campaignId]`) via `getCampaign(supabase, id)` (`src/lib/services/campaigns.ts`), which re-checks ownership (RLS) and returns `null` for a malformed id, a nonexistent id, or another tenant's campaign — callers 404 on `null`.
- `resolveLandingCampaign(supabase, lastCampaignId)` (`src/lib/services/campaigns.ts`) is the **single** resolver of "which campaign does a request with no campaign id in the URL land on" — used only by the old top-level redirect routes (`/dashboard`, `/campaigns`, `/map`, `/notes/new`, `/notes/[id]`). It returns the caller's last-visited campaign (from the `last_campaign_id` cookie) when they still own it, otherwise their oldest campaign (`order by created_at asc, id asc limit 1`), otherwise `null`.
- `last_campaign_id` (`src/lib/campaign-cookie.ts`, `LAST_CAMPAIGN_COOKIE`) — `httpOnly`, `sameSite: "lax"`, 1-year max-age, set by every nested campaign page (`rememberCampaign`) after its `getCampaign` ownership check succeeds. **The cookie value is never trusted directly** — it only picks a redirect target for `resolveLandingCampaign`, which re-checks ownership via `getCampaign` before returning anything.

## Routes

- `/campaigns/[campaignId]` — the campaign's notes list (`getCampaign` + `listNotes`), a "New note" link, an empty-state call to action. 404s (via `Astro.response.status` + conditional rendering, never a frontmatter `return`) when `getCampaign` returns `null`. Protected (`PROTECTED_ROUTES` in `src/middleware.ts`).
- `/campaigns/[campaignId]/notes/new` — the create-note form (`CreateNoteForm` island + `useCreateNote` hook, both campaign-scoped). Loads `listNoteTypes` for the resolved campaign. 404s when `getCampaign` returns `null`. Protected.
- `/campaigns/[campaignId]/notes/[noteId]` — read-only note detail: name, type badge, content (`whitespace-pre-wrap`, escaped text only, no `set:html`). Checks `isUuid(noteId)` before any query; 404s (same conditional-rendering pattern) when the campaign is missing, the note is missing, or `note.campaign_id !== campaign.id` (RLS already makes another tenant's note come back as `null`, indistinguishable from "doesn't exist"). Back link reads "← Back to {campaign.name}", targets `/campaigns/[campaignId]`. Protected.
- `/campaigns/[campaignId]/map` — the campaign's memory map: every note as a node plus every relation as an undirected edge (`getCampaign` + `listNotes` + `listRelations`), read-only (FR-011 — no way to create, delete, reconnect or select an edge). Clicking a node navigates to `/campaigns/[campaignId]/notes/[noteId]`. Renders a `MemoryMap` React Flow island (`client:only="react"`, `campaignId` prop) with a one-shot `layoutMemoryMap` force layout; dragging a node only moves it locally, never persisted. Empty state (no notes) shows a "Create your first note" CTA and doesn't mount the island. 404s when `getCampaign` returns `null`. Protected.
- `/campaigns/new` — the create-campaign form (`CampaignForm mode="create"` island + `useSaveCampaign` hook). No `campaignId` in the URL; `Topbar` renders with `view="none"` and the switcher shows a disabled placeholder. Protected.
- `/campaigns/[campaignId]/edit` — the rename-campaign form (`CampaignForm mode="rename"` with the current name, `useSaveCampaign` hook), plus a Cancel link back to `/campaigns/[campaignId]`. 404s when `getCampaign` returns `null`. Protected.
- `/dashboard`, `/campaigns`, `/map`, `/notes/new`, `/notes/[id]` — thin redirect endpoints (`.ts`, `export const GET`, `prerender = false`) that keep bookmarks and the sign-in redirect working. `/dashboard` and `/campaigns` → 302 to `/campaigns/{landing.id}`; `/map` → `/campaigns/{landing.id}/map`; `/notes/new` → `/campaigns/{landing.id}/notes/new`, where `landing = resolveLandingCampaign(supabase, readRememberedCampaign(cookies))`; 404 (plain text) if there's no landing campaign; 500 (plain text) if Supabase isn't configured. `/notes/[id]` → 302 to `/campaigns/{note.campaign_id}/notes/{id}` when `isUuid(id)` and `getNote` finds it, else 404. Unauthenticated requests to any of these are already redirected to `/auth/signin` by middleware before the handler runs. Static routes (`/notes/new`, `/campaigns`) win over their sibling dynamic routes (`/notes/[id]`, `/campaigns/[campaignId]`).

## Migration file

- `supabase/migrations/20260922120000_campaign_notes_schema.sql` — first schema migration in the project. Includes an idempotent backfill (`insert ... where not exists`) that provisions a default campaign for any pre-existing `auth.users` row. Applied to production manually (`npx supabase db push`) — CI does not run migrations.
- `supabase/migrations/20260923120000_restrict_update_columns.sql` — column-level `UPDATE` grants for `authenticated` on `campaigns` and `notes` (see above). A new updatable column on those tables must be added to the grant explicitly.
- `supabase/migrations/20260924120000_create_note_function.sql` — adds the `create_note` function (see above) and the `notes_name_length_check` / `notes_content_length_check` constraints. Applied to production manually (`npx supabase db push`) — CI does not run migrations.
- `supabase/migrations/20260926120000_relation_detection.sql` — adds relation detection (see "Relation detection" above): `note_mentions`, `detect_note_relations`, `recompute_campaign_relations`, the `notes_detect_relations` trigger, and a backfill (`select public.recompute_campaign_relations(id) from public.campaigns;`). Applied to production manually (`npx supabase db push`) — CI does not run migrations.
- `supabase/migrations/20260928120000_campaign_name_rules.sql` — adds `campaigns_name_check` and the `campaigns_owner_name_key` unique index (see above). Applied to production manually (`npx supabase db push`) — CI does not run migrations.
- `supabase/migrations/20260930120000_note_edit_delete_functions.sql` — adds `resolve_note_type`, `update_note`, `delete_note` and redefines `create_note` to use `resolve_note_type` (see above). Applied to production manually (`npx supabase db push`) — CI does not run migrations.

## Shared TypeScript types

- `src/types.ts` — `Campaign`, `NoteType`, `Note`, `Relation` interfaces mirror the tables above field-for-field (snake_case, no camelCase mapping layer).
- `src/types.ts` also holds non-table DTOs shared by the API, services and the React form: `CreateNoteCommand`, `UpdateNoteCommand` (alias of `CreateNoteCommand`), `RelationChange` (`{ note_id, name }`), `UpdateNoteResponse` (`{ id, name, rechecked, added, removed }`), `DeleteNoteResponse` (`{ name, removed }`), `SaveCampaignCommand` (`{ name: string }`, shared by `POST /api/campaigns` and `PATCH /api/campaigns/[campaignId]`), `NoteListItem`, `NoteDetail`, `ApiError`. Unlike the entity interfaces above, these do **not** mirror a table field for field.
- `CampaignSummary` (`Pick<Campaign, "id" | "name">`) is the subset of a campaign shown in the `CampaignSwitcher` island (`src/components/campaigns/CampaignSwitcher.tsx`), loaded via `listCampaigns` (`src/lib/services/campaigns.ts`) inside `Topbar.astro`.
- `CampaignView` (`src/lib/campaign-paths.ts`) and `campaignSwitchPath(view, targetCampaignId)` are the pure mapping from a page's current view to the equivalent URL in another campaign, used by both `CampaignSwitcher` and every campaign page's `Topbar` call (`view` prop: `notes`, `map`, `new-note`, `note`, `edit`, or `none` on `/campaigns/new`).
- `MemoryMapRelation` (`Pick<Relation, "id" | "note_a_id" | "note_b_id">`) and `MemoryMapData` (`{ notes: NoteListItem[]; relations: MemoryMapRelation[] }`) are the `/map` page's domain DTOs, free of any `@xyflow/react` types — the mapping to React Flow `Node`/`Edge` happens inside `MemoryMap.tsx`.
