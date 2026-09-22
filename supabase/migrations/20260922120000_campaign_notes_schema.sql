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
