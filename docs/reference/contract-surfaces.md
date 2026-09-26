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
- **Rows are written only by `public.detect_note_relations()` and `public.recompute_campaign_relations()`** (`supabase/migrations/20260926120000_relation_detection.sql`) — see "Relation detection" below. No other code path inserts into or deletes from `relations`.

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
- Exactly one of `p_type_id` / `p_new_type_name` must be non-null, else `raise exception` with SQLSTATE `22023`.
- With `p_new_type_name`: `insert ... on conflict (campaign_id, lower(name)) do nothing`; if no row returns, the existing type is looked up case-insensitively. A predefined type counts as a match (`'npc'` resolves to `NPC`) — no duplicate custom type is ever created for a name that collides with a predefined one.
- Propagated SQLSTATEs the caller maps: `23505` (duplicate note name), `23514` (name/content length check), `23503` (type not in this campaign — composite FK), `42501` (RLS denial, e.g. a foreign campaign id).
- Grants: `revoke execute ... from public, anon; grant execute ... to authenticated`.

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
- **Concurrent-create race accepted**: two notes committed at the same instant in one campaign can each miss the other's uncommitted row. This is accepted as a risk for a single-user tool; `recompute_campaign_relations` is the repair path.

## `POST /api/notes`

- File: `src/pages/api/notes/index.ts`. `export const prerender = false`.
- Request body (`CreateNoteCommand`, zod-validated by `createNoteSchema`, `.strict()`): `{ name: string; content: string; type: { kind: "existing"; id: string } | { kind: "new"; name: string } }`.
- **No campaign id is accepted from the client, ever.** The active campaign is resolved server-side via `getActiveCampaign` (see below) — the schema's `.strict()` rejects an unknown `campaign_id` key outright.
- Responses: 201 `{ id }` on success. 401 `ApiError` if unauthenticated (JSON, not a redirect). 400 `ApiError` with `field` on a non-JSON body or a zod failure, and on `invalid_type` (foreign/missing type). 404 `ApiError` if `getActiveCampaign` returns null. 409 `ApiError` with `field: "name"` on a duplicate note name. 500 generic `ApiError` on any other DB failure (logged server-side via `console.error`, never passed through to the client).
- `ApiError`: `{ error: string; field?: "name" | "content" | "type" }` (`src/types.ts`).

## Active campaign resolution

- `getActiveCampaign(supabase)` (`src/lib/services/campaigns.ts`) is the **single** resolver of "which campaign does this request act on." In this slice it returns the caller's oldest campaign (`order by created_at asc, id asc limit 1`).
- Callers: `POST /api/notes`, `/dashboard`, `/notes/new`.
- **S-03 must revisit this function** when multiple campaigns per user arrive (e.g. a cookie or a campaign id in the URL). If a campaign id ever starts coming from the client, the server **must re-check ownership** before using it — there is currently no client-supplied campaign id anywhere in this slice, so no such check exists yet.

## Routes

- `/dashboard` — the active campaign's notes list (`getActiveCampaign` + `listNotes`), a "New note" link, an empty-state call to action. Protected (`PROTECTED_ROUTES` in `src/middleware.ts`).
- `/notes/new` — the create-note form (`CreateNoteForm` island + `useCreateNote` hook). Loads `listNoteTypes` for the active campaign. Protected.
- `/notes/[id]` — read-only note detail: name, type badge, content (`whitespace-pre-wrap`, escaped text only, no `set:html`). Returns a real 404 (`Astro.response.status = 404` + conditional rendering — a top-level `return` in Astro frontmatter crashes this project's `@typescript-eslint/no-misused-promises` lint rule) for a non-uuid id or another tenant's note (RLS makes it come back as `null` from `getNote`, indistinguishable from "doesn't exist"). This is S-02's FR-010 map-navigation target. Protected.

## Migration file

- `supabase/migrations/20260922120000_campaign_notes_schema.sql` — first schema migration in the project. Includes an idempotent backfill (`insert ... where not exists`) that provisions a default campaign for any pre-existing `auth.users` row. Applied to production manually (`npx supabase db push`) — CI does not run migrations.
- `supabase/migrations/20260923120000_restrict_update_columns.sql` — column-level `UPDATE` grants for `authenticated` on `campaigns` and `notes` (see above). A new updatable column on those tables must be added to the grant explicitly.
- `supabase/migrations/20260924120000_create_note_function.sql` — adds the `create_note` function (see above) and the `notes_name_length_check` / `notes_content_length_check` constraints. Applied to production manually (`npx supabase db push`) — CI does not run migrations.
- `supabase/migrations/20260926120000_relation_detection.sql` — adds relation detection (see "Relation detection" above): `note_mentions`, `detect_note_relations`, `recompute_campaign_relations`, the `notes_detect_relations` trigger, and a backfill (`select public.recompute_campaign_relations(id) from public.campaigns;`). Applied to production manually (`npx supabase db push`) — CI does not run migrations.

## Shared TypeScript types

- `src/types.ts` — `Campaign`, `NoteType`, `Note`, `Relation` interfaces mirror the tables above field-for-field (snake_case, no camelCase mapping layer).
- `src/types.ts` also holds non-table DTOs shared by the API, services and the React form: `CreateNoteCommand`, `NoteListItem`, `NoteDetail`, `ApiError`. Unlike the entity interfaces above, these do **not** mirror a table field for field.
