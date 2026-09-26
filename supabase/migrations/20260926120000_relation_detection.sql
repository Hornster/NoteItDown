-- Relation detection: relations are the automatic, atomic output of every note write
-- (FR-007, FR-011). The matching rule lives in one function (note_mentions) so S-04
-- reuses the exact same engine and no TS copy can drift from it.
--
-- security invoker: these functions run as the calling `authenticated` user. Postgres
-- checks EXECUTE on every nested function call, so note_mentions and
-- detect_note_relations must be granted to `authenticated` (not only revoked from
-- anon), or every note insert through the trigger would fail with a permission error.

create function public.note_mentions(p_content text, p_name text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_content ~* (
    '(^|[^[:alnum:]_])'
    || regexp_replace(p_name, '([\\.^$*+?()\[\]{}|])', '\\\1', 'g')
    || '($|[^[:alnum:]_])'
  );
$$;

revoke execute on function public.note_mentions(text, text) from public, anon;
grant execute on function public.note_mentions(text, text) to authenticated;

-- Recomputes exactly one note's relations: the full desired pair set (this note against
-- every other note in the same campaign, matched in either direction) replaces whatever
-- is currently stored for it. Quietly does nothing if RLS hides the note or it's gone
-- (e.g. called after a delete, or for a foreign note under security invoker).
create function public.detect_note_relations(p_note_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_note public.notes;
begin
  select * into v_note from public.notes where id = p_note_id;

  if not found then
    return;
  end if;

  with matched_pairs as (
    select
      least(v_note.id, o.id) as note_a_id,
      greatest(v_note.id, o.id) as note_b_id
    from public.notes o
    where o.campaign_id = v_note.campaign_id
      and o.id <> v_note.id
      and (public.note_mentions(o.content, v_note.name) or public.note_mentions(v_note.content, o.name))
  ),
  deleted as (
    delete from public.relations r
    where v_note.id in (r.note_a_id, r.note_b_id)
      and not exists (
        select 1 from matched_pairs mp
        where mp.note_a_id = r.note_a_id and mp.note_b_id = r.note_b_id
      )
  )
  insert into public.relations (campaign_id, note_a_id, note_b_id)
  select v_note.campaign_id, mp.note_a_id, mp.note_b_id
  from matched_pairs mp
  on conflict (note_a_id, note_b_id) do nothing;
end;
$$;

revoke execute on function public.detect_note_relations(uuid) from public, anon;
grant execute on function public.detect_note_relations(uuid) to authenticated;

-- Recomputes every note's relations in one campaign. Idempotent: serves as both the
-- backfill for pre-existing notes and the repair path for the accepted concurrent-create
-- race (two notes committed at the same instant can each miss the other's uncommitted row).
create function public.recompute_campaign_relations(p_campaign_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_note_id uuid;
begin
  for v_note_id in select id from public.notes where campaign_id = p_campaign_id loop
    perform public.detect_note_relations(v_note_id);
  end loop;
end;
$$;

revoke execute on function public.recompute_campaign_relations(uuid) from public, anon;
grant execute on function public.recompute_campaign_relations(uuid) to authenticated;

create function public.notes_detect_relations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.name = old.name and new.content = old.content then
    return null;
  end if;

  perform public.detect_note_relations(new.id);
  return null;
end;
$$;

revoke execute on function public.notes_detect_relations() from public, anon;

create trigger notes_detect_relations
  after insert or update of name, content on public.notes
  for each row execute function public.notes_detect_relations();

-- Backfill: notes created before this migration (S-01) have no relations yet.
select public.recompute_campaign_relations(id) from public.campaigns;
