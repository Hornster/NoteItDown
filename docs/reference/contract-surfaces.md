# Contract Surfaces

Load-bearing names that downstream changes must not silently rename without updating every dependent. Introduced by `context/changes/campaign-notes-schema/plan.md` (migration `supabase/migrations/20260922120000_campaign_notes_schema.sql`).

## campaigns

- Table: `public.campaigns`
- Columns: `id`, `owner_id` (→ `auth.users.id`, cascade delete), `name`, `created_at`, `updated_at`
- Ownership anchor: `campaigns.owner_id` is the single source of truth for ownership across the whole schema — `notes` and `relations` never carry their own `owner_id`; their RLS joins back to this column.
- RLS policies: `campaigns_select_own`, `campaigns_insert_own`, `campaigns_update_own`, `campaigns_delete_own` (all scoped to `owner_id = auth.uid()`)
- Trigger: `campaigns_set_updated_at` (before update, via `public.set_updated_at()`)
- Trigger: `campaigns_seed_note_types` (after insert, via `public.seed_default_note_types()`) — seeds the 4 predefined note types on every campaign, not just the signup default.

## note_types

- Table: `public.note_types`
- Columns: `id`, `campaign_id` (→ `campaigns.id`, cascade delete), `name`, `is_predefined`, `created_at`
- Composite unique target: `note_types_campaign_id_id_key (campaign_id, id)` — required by `notes`' composite FK to keep a note's type scoped to its own campaign.
- Uniqueness: `note_types_campaign_name_key` on `(campaign_id, lower(name))` — case-insensitive per campaign.
- RLS policies: `note_types_select_own_campaign`, `note_types_insert_own_campaign` (insert forbids `is_predefined = true` — predefined rows come only from the seed trigger). No `UPDATE`/`DELETE` policy exists yet.
- Predefined names (seeded verbatim by `seed_default_note_types()`): `NPC`, `Place`, `Quest`, `Observation`.

## notes

- Table: `public.notes`
- Columns: `id`, `campaign_id` (→ `campaigns.id`, cascade delete), `type_id`, `name`, `content`, `created_at`, `updated_at`
- Composite FK: `notes_type_same_campaign_fkey (campaign_id, type_id)` → `note_types (campaign_id, id)`, `on delete restrict` — enforces campaign-scoping since plain FKs bypass RLS.
- Composite unique target: `notes_campaign_id_id_key (campaign_id, id)` — required by `relations`' composite FKs.
- Uniqueness: `notes_campaign_name_key` on `(campaign_id, lower(name))`.
- Name check constraint: `name = btrim(name) and name <> ''` — trimmed and non-empty.
- Trigger: `notes_set_updated_at` (before update, via `public.set_updated_at()`)
- RLS policies: `notes_select_own_campaign`, `notes_insert_own_campaign`, `notes_update_own_campaign`, `notes_delete_own_campaign`.

## relations

- Table: `public.relations`
- Columns: `id`, `campaign_id` (→ `campaigns.id`, cascade delete — a scope column, not an owner column), `note_a_id`, `note_b_id`, `created_at`
- Composite FKs: `relations_note_a_same_campaign_fkey` / `relations_note_b_same_campaign_fkey`, both `(campaign_id, note_x_id)` → `notes (campaign_id, id)`, `on delete cascade`.
- **Canonical ordering invariant**: `relations_canonical_order` check requires `note_a_id < note_b_id`. Undirected edges are stored exactly once; any future insert/query logic (e.g. S-02's relation detection) must sort the pair before insert/lookup.
- Uniqueness: `relations_unique_pair (note_a_id, note_b_id)` — relies on the canonical ordering above to prevent duplicate edges in either direction.
- RLS policies: `relations_select_own_campaign`, `relations_insert_own_campaign`, `relations_delete_own_campaign`. **No `UPDATE` policy** — rows are only ever created by detection or removed by re-detection (FR-011).

## Trigger functions

- `public.set_updated_at()` — generic `before update` trigger, sets `updated_at = now()`. Fired by `campaigns_set_updated_at`, `notes_set_updated_at`.
- `public.seed_default_note_types()` — `security definer`, fires `after insert` on `public.campaigns` via `campaigns_seed_note_types`. Inserts the 4 predefined `note_types` rows.
- `public.handle_new_user()` — `security definer`, fires `after insert` on `auth.users` via `on_auth_user_created`. Creates the default `'My Campaign'` row for every new signup, which in turn fires `campaigns_seed_note_types`.

## Migration file

- `supabase/migrations/20260922120000_campaign_notes_schema.sql` — first schema migration in the project. Includes an idempotent backfill (`insert ... where not exists`) that provisions a default campaign for any pre-existing `auth.users` row. Applied to production manually (`npx supabase db push`) — CI does not run migrations.

## Shared TypeScript types

- `src/types.ts` — `Campaign`, `NoteType`, `Note`, `Relation` interfaces mirror the tables above field-for-field (snake_case, no camelCase mapping layer).
