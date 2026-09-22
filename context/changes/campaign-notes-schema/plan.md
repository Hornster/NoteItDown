# Campaign & Note Data Foundation Implementation Plan

## Overview

Add the Supabase schema foundation NoteItDown's domain needs: `campaigns`, `note_types`, `notes`, and `relations` tables with per-owner row-level security, plus a database trigger that auto-provisions a default campaign (and its 4 predefined note types) the moment a user signs up. This is roadmap item F-01 — a bounded, horizontal enabler that unlocks every downstream vertical slice (S-01 through S-05); it ships no UI and no relation-detection logic, only the data contract those slices will build on.

## Current State Analysis

- No `supabase/migrations/` exist yet (`README.md:115` currently — incorrectly, after this change — states "No database tables or migrations are required").
- `src/lib/supabase.ts` creates an `@supabase/ssr` client using only the **anon key** (`SUPABASE_KEY`); there is no service-role client anywhere in the codebase. Any RLS policy this migration adds must work for that anon-key, user-session context — there is no bypass available at the app layer.
- `src/pages/api/auth/signup.ts` calls `supabase.auth.signUp()` and immediately redirects to `/auth/confirm-email` (`src/pages/api/auth/signup.ts:13-19`). In production, email confirmation is required (`src/pages/auth/confirm-email.astro:5` — `isAutoConfirmed` is `import.meta.env.DEV`-only), so there is no reliable authenticated app-level hook at the moment of signup. This is why default-campaign creation belongs in a database trigger on `auth.users`, not in `signup.ts`.
- No `src/types.ts` exists yet — no shared entity types anywhere in the codebase.
- No `docs/reference/contract-surfaces.md` exists yet (`docs/reference/` is absent).

## Desired End State

Running `npx supabase start` (or `npx supabase db reset`) against a clean local stack provisions the full schema automatically, and the same migration has been pushed to the production Supabase project, where every pre-existing user has been backfilled with a default campaign. A new user signing up (via `supabase.auth.signUp()`) ends up, after confirmation, with exactly one `campaigns` row they own and exactly 4 `note_types` rows (NPC, Place, Quest, Observation) scoped to that campaign — with no application code involved. All four tables have RLS enabled and enforce strict per-owner isolation reachable only through the anon-key session client already used everywhere else in the app. `src/types.ts` exports TypeScript interfaces mirroring the four tables, ready for S-01 to import.

### Key Discoveries:

- `src/lib/supabase.ts:5-9` — the SSR client factory is the only Supabase client the app has; RLS policies must be satisfiable by a normal authenticated user session (no service-role escape hatch exists or is being added).
- `supabase/config.toml` confirms `[auth] enabled = true`; local dev auto-confirms users (`confirm-email.astro:5`), production does not — the DB trigger approach is unaffected by this difference since it fires on `auth.users` insert regardless of confirmation state.
- CLAUDE.md mandates migration naming `YYYYMMDDHHmmss_short_description.sql` and "enable RLS on new tables with granular per-operation, per-role policies" — every table below gets `ENABLE ROW LEVEL SECURITY` plus only the operation-specific policies each table's actual usage needs (not a blanket CRUD×4 for tables nothing yet edits or deletes).

## What We're NOT Doing

- No relation-detection algorithm or matching logic (S-02's job) — this migration only creates the `relations` table shape.
- No normalized/lowercased name column for case-insensitive matching support — deferred entirely to S-02, which owns the actual query pattern.
- No UI for notes, campaigns, or the memory map (S-01/S-02/S-03).
- No image/attachment columns or storage bucket (S-05).
- No campaign `description` field — not mentioned anywhere in the PRD.
- No soft delete / trash / restore — hard delete with `ON DELETE CASCADE` throughout.
- No manual relation creation/editing surface, at the DB or RLS level — no `UPDATE` policy on `relations` (rows are only ever created by detection or removed by re-detection), consistent with FR-011.
- No `UPDATE`/`DELETE` RLS policies on `note_types` — nothing in the roadmap renames or removes a note type yet; adding unused write policies now would only widen attack surface without a caller.

## Implementation Approach

A single migration creates all four tables, their indexes/constraints, RLS policies, and two trigger functions, in dependency order (`campaigns` → `note_types` → `notes` → `relations`). Ownership is anchored solely on `campaigns.owner_id`; `notes` and `relations` are never given their own `owner_id` column — their RLS policies join up to `campaigns` instead, keeping ownership a single source of truth. Campaign *scoping* is enforced separately by composite foreign keys (`notes (campaign_id, type_id)` → `note_types`, `relations (campaign_id, note_x_id)` → `notes`), because Postgres FK checks bypass RLS — without them a user could reference another tenant's note type or note by UUID. `relations` therefore carries a `campaign_id` (a scope column, not an owner column). `note_types` seeding is attached to `campaigns` (`AFTER INSERT`) rather than to `auth.users`, so both the signup-default campaign and any campaign S-03 creates later get their 4 predefined types the same way, with no duplicated seeding logic. A second, independent trigger on `auth.users` creates the default campaign itself. Alongside the migration, `src/types.ts` is scaffolded with entity types mirroring the new tables (per CLAUDE.md's "shared types go in `src/types.ts`" convention), and `README.md` / `docs/reference/contract-surfaces.md` are brought in line with the new schema.

## Phase 1: Database schema, RLS, and provisioning triggers

### Overview

Create the migration that defines `campaigns`, `note_types`, `notes`, `relations`, their constraints, RLS policies, and the two triggers that auto-provision a default campaign and its note types.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/20260922120000_campaign_notes_schema.sql`

**Intent**: Define the full domain schema in one migration: four tables, their indexes/constraints, RLS policies scoped to campaign ownership, and two `SECURITY DEFINER` trigger functions that provision a default campaign at signup and seed predefined note types on every campaign creation.

**Contract**: Table shapes, constraints, and trigger wiring — this is the load-bearing contract every downstream slice (S-01 through S-05) builds on, so the full DDL is specified here rather than left to the implementer's judgment:

```sql
-- gen_random_uuid() is core Postgres (13+); no extension needed.

-- Campaigns ------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_owner_id_idx on public.campaigns (owner_id);

alter table public.campaigns enable row level security;

create policy "campaigns_select_own" on public.campaigns
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "campaigns_insert_own" on public.campaigns
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "campaigns_update_own" on public.campaigns
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "campaigns_delete_own" on public.campaigns
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Note types (4 predefined + campaign-unique custom) --------------------

create table public.note_types (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (name = btrim(name) and name <> ''),
  is_predefined boolean not null default false,
  created_at timestamptz not null default now(),
  -- target for notes' composite FK: a note can only use a type from its own campaign
  constraint note_types_campaign_id_id_key unique (campaign_id, id)
);

create unique index note_types_campaign_name_key
  on public.note_types (campaign_id, lower(name));

alter table public.note_types enable row level security;

create policy "note_types_select_own_campaign" on public.note_types
  for select to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = note_types.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "note_types_insert_own_campaign" on public.note_types
  for insert to authenticated with check (
    -- users create custom types only; predefined ones come from seed_default_note_types()
    not is_predefined
    and exists (select 1 from public.campaigns c
                where c.id = note_types.campaign_id and c.owner_id = (select auth.uid()))
  );

-- Notes -------------------------------------------------------------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  type_id uuid not null,
  -- trimmed + non-empty: '' is a substring of every text, so it would "match" every note in S-02
  name text not null check (name = btrim(name) and name <> ''),
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- composite FK: FK checks bypass RLS, so campaign scoping must be a table invariant
  constraint notes_type_same_campaign_fkey foreign key (campaign_id, type_id)
    references public.note_types (campaign_id, id) on delete restrict,
  -- target for relations' composite FKs
  constraint notes_campaign_id_id_key unique (campaign_id, id)
);

create unique index notes_campaign_name_key on public.notes (campaign_id, lower(name));
create index notes_campaign_id_idx on public.notes (campaign_id);
create index notes_type_id_idx on public.notes (type_id);

alter table public.notes enable row level security;

create policy "notes_select_own_campaign" on public.notes
  for select to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = notes.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "notes_insert_own_campaign" on public.notes
  for insert to authenticated with check (
    exists (select 1 from public.campaigns c
            where c.id = notes.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "notes_update_own_campaign" on public.notes
  for update to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = notes.campaign_id and c.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.campaigns c
            where c.id = notes.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "notes_delete_own_campaign" on public.notes
  for delete to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = notes.campaign_id and c.owner_id = (select auth.uid()))
  );

-- Relations (undirected — one edge per connected pair) -----------------

create table public.relations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  note_a_id uuid not null,
  note_b_id uuid not null,
  created_at timestamptz not null default now(),
  -- both endpoints must live in relations.campaign_id (no cross-campaign / cross-tenant edges)
  constraint relations_note_a_same_campaign_fkey foreign key (campaign_id, note_a_id)
    references public.notes (campaign_id, id) on delete cascade,
  constraint relations_note_b_same_campaign_fkey foreign key (campaign_id, note_b_id)
    references public.notes (campaign_id, id) on delete cascade,
  constraint relations_canonical_order check (note_a_id < note_b_id),
  constraint relations_unique_pair unique (note_a_id, note_b_id)
);

create index relations_campaign_id_idx on public.relations (campaign_id);
create index relations_note_a_id_idx on public.relations (note_a_id);
create index relations_note_b_id_idx on public.relations (note_b_id);

alter table public.relations enable row level security;

create policy "relations_select_own_campaign" on public.relations
  for select to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = relations.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "relations_insert_own_campaign" on public.relations
  for insert to authenticated with check (
    exists (select 1 from public.campaigns c
            where c.id = relations.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "relations_delete_own_campaign" on public.relations
  for delete to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = relations.campaign_id and c.owner_id = (select auth.uid()))
  );

-- updated_at maintenance -------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- Provisioning triggers -----------------------------------------------

create function public.seed_default_note_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.note_types (campaign_id, name, is_predefined)
  values
    (new.id, 'NPC', true),
    (new.id, 'Place', true),
    (new.id, 'Quest', true),
    (new.id, 'Observation', true);
  return new;
end;
$$;

create trigger campaigns_seed_note_types
  after insert on public.campaigns
  for each row execute function public.seed_default_note_types();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaigns (owner_id, name)
  values (new.id, 'My Campaign');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: users who signed up before this migration (e.g. production smoke-test
-- accounts) get their default campaign too; note types follow via campaigns_seed_note_types.
insert into public.campaigns (owner_id, name)
select u.id, 'My Campaign'
from auth.users u
where not exists (select 1 from public.campaigns c where c.owner_id = u.id);
```

#### 2. Production rollout

**File**: none (operational step) — record the outcome in `context/deployment/deploy-plan.md`

**Intent**: CI only deploys the Worker; nothing applies migrations to the hosted Supabase project. Apply this migration to production so downstream slices (S-01+) don't ship code against missing tables.

**Contract**: After local verification passes, with explicit human approval: `npx supabase link --project-ref <ref>` then `npx supabase db push`. Append a dated entry to `deploy-plan.md` (migration filename applied, backfilled-user count confirmed via Studio). Worker rollback does not revert this — per `infrastructure.md` rollback caveat, reverting would need a separate down-migration.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- `npx astro sync && npx astro check` passes (no schema-adjacent TS breakage)
- `npm run lint` passes

#### Manual Verification:

- Sign up a new test user locally; confirm exactly one `campaigns` row appears with `owner_id` = the new user's id, and exactly 4 `note_types` rows (NPC, Place, Quest, Observation, `is_predefined = true`) scoped to that campaign
- Using Supabase Studio's "Run as user" (or a second test account's session), confirm a second user cannot `select`/`insert`/`update`/`delete` the first user's `campaigns`, `note_types`, `notes`, or `relations` rows
- Manually insert two notes in the same campaign with the same name (case-insensitive) and confirm the unique index rejects the second insert; also confirm names `''` and `' Bob'` are rejected by the check constraint
- Manually insert a `relations` row with `note_a_id > note_b_id` and confirm the `relations_canonical_order` check rejects it
- As user A, attempt (a) a note in A's campaign whose `type_id` belongs to user B's campaign, and (b) a `relations` row pairing A's note with B's note; confirm both are rejected by the composite FKs
- Migration pushed to production (`npx supabase db push`, human-approved); in production Studio every `auth.users` row owns exactly one campaign with 4 predefined note types; outcome recorded in `deploy-plan.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Shared types and documentation sync

### Overview

Give downstream slices a TypeScript contract for the new schema and correct the two docs that currently describe a database-less app.

### Changes Required:

#### 1. Shared entity types

**File**: `src/types.ts`

**Intent**: Export TypeScript interfaces mirroring the four new tables so S-01 (and every later slice) has a single, consistent source for these shapes instead of each slice re-deriving them from the migration.

**Contract**: One exported interface per table (`Campaign`, `NoteType`, `Note`, `Relation`), fields and names matching the migration's columns exactly (snake_case, matching Supabase's default row shape — no camelCase mapping layer introduced).

#### 2. README correction

**File**: `README.md`

**Intent**: Replace the now-false claim that no database tables/migrations exist with an accurate description of the local-dev flow.

**Contract**: Replace the sentence at `README.md:115` ("No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only.") with a short note that `supabase/migrations/` holds the schema and that `npx supabase start` / `db reset` applies it automatically.

#### 3. Contract surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the load-bearing names this change introduces — table names, columns, RLS policy names, trigger/function names, migration filename — per CLAUDE.md's "load-bearing names registry" convention. This file doesn't exist yet; this change creates it.

**Contract**: A reference listing, grouped by table, of every name a future change must not silently rename without updating dependents (table/column names, the two trigger functions and their firing tables, the `relations` canonical-ordering invariant `note_a_id < note_b_id`).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes
- Files exist: `src/types.ts`, `docs/reference/contract-surfaces.md`

#### Manual Verification:

- `src/types.ts` field names/types match the Phase 1 migration's columns exactly (spot check against the DDL)
- `README.md`'s local-dev section reads correctly end-to-end (no orphaned references to the removed sentence)

---

## Testing Strategy

### Manual Testing Steps:

1. `npx supabase start`, then `npx supabase db reset` to apply the migration from a clean slate.
2. Sign up as a new user via `/auth/signup`; verify the default campaign + 4 note types via Supabase Studio.
3. Sign up a second user; verify their default campaign is separate and neither user can see the other's rows via Studio's "Run as user".
4. Attempt the duplicate-name and out-of-order-relation inserts described in Phase 1's manual verification.

## Migration Notes

This is the first schema migration in the project, but production `auth.users` already has rows (smoke-test signups, `deploy-plan.md`). The `on_auth_user_created` trigger only fires on new inserts, so the migration ends with an idempotent backfill that creates a default campaign for every existing user without one. The migration is applied to production manually (`supabase db push`, Phase 1 §2) — CI does not run migrations.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01, "Foundations" section)
- PRD: `context/foundation/prd.md` (FR-002 default-campaign-at-signup, Access Control)
- `src/lib/supabase.ts:5-9` — the only Supabase client in the app (anon key, session-based)
- `src/pages/api/auth/signup.ts:13-19` — signup flow that the `auth.users` trigger runs independently of

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database schema, RLS, and provisioning triggers

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — d703d9b
- [x] 1.2 `npx astro sync && npx astro check` passes — d703d9b
- [x] 1.3 `npm run lint` passes — d703d9b

#### Manual

- [x] 1.4 New signup produces exactly 1 campaign + 4 predefined note types — d703d9b
- [x] 1.5 Cross-user RLS isolation verified for campaigns, note_types, notes, relations — d703d9b
- [x] 1.6 Duplicate case-insensitive note name within a campaign is rejected — d703d9b
- [x] 1.7 Out-of-order relation insert (note_a_id > note_b_id) is rejected — d703d9b
- [x] 1.8 Cross-campaign type_id and cross-tenant relation inserts are rejected — d703d9b
- [x] 1.9 Migration pushed to production; every existing user has a backfilled default campaign

### Phase 2: Shared types and documentation sync

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npx astro check` passes
- [ ] 2.3 `src/types.ts` and `docs/reference/contract-surfaces.md` exist

#### Manual

- [ ] 2.4 `src/types.ts` fields match migration columns exactly
- [ ] 2.5 README local-dev section reads correctly end-to-end
