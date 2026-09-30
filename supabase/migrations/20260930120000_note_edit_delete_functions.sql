-- Atomic edit/delete of a note that also reports which relations changed (S-04).
-- Relation detection itself is untouched: the existing after-trigger re-detects on UPDATE
-- and the composite FK cascade removes relations on DELETE. These functions only READ
-- relations before and after, so the API can tell the user what changed.
--
-- All functions are security invoker (RLS applies as the calling user).

-- Shared type resolution, moved verbatim out of create_note.
create function public.resolve_note_type(
  p_campaign_id uuid,
  p_type_id uuid,
  p_new_type_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type_id uuid;
begin
  if (p_type_id is null) = (p_new_type_name is null) then
    raise exception 'exactly one of p_type_id or p_new_type_name must be provided'
      using errcode = '22023';
  end if;

  if p_new_type_name is not null then
    insert into public.note_types (campaign_id, name)
    values (p_campaign_id, p_new_type_name)
    on conflict (campaign_id, lower(name)) do nothing
    returning id into v_type_id;

    if v_type_id is null then
      -- Type already existed (predefined or custom) case-insensitively; reuse it.
      select id into v_type_id
      from public.note_types
      where campaign_id = p_campaign_id and lower(name) = lower(p_new_type_name);
    end if;
  else
    v_type_id := p_type_id;
  end if;

  return v_type_id;
end;
$$;

revoke execute on function public.resolve_note_type(uuid, uuid, text) from public, anon;
grant execute on function public.resolve_note_type(uuid, uuid, text) to authenticated;

create or replace function public.create_note(
  p_campaign_id uuid,
  p_name text,
  p_content text,
  p_type_id uuid default null,
  p_new_type_name text default null
)
returns public.notes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type_id uuid;
  v_note public.notes;
begin
  v_type_id := public.resolve_note_type(p_campaign_id, p_type_id, p_new_type_name);

  insert into public.notes (campaign_id, type_id, name, content)
  values (p_campaign_id, v_type_id, p_name, p_content)
  returning * into v_note;

  return v_note;
end;
$$;

revoke execute on function public.create_note(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.create_note(uuid, text, text, uuid, text) to authenticated;

create function public.update_note(
  p_campaign_id uuid,
  p_note_id uuid,
  p_name text,
  p_content text,
  p_type_id uuid default null,
  p_new_type_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.notes;
  v_new public.notes;
  v_type_id uuid;
  v_before uuid[];
  v_after uuid[];
  v_added jsonb;
  v_removed jsonb;
begin
  select * into v_old
  from public.notes
  where id = p_note_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  v_type_id := public.resolve_note_type(p_campaign_id, p_type_id, p_new_type_name);

  -- "Before" snapshot: must be a separate statement from the UPDATE and from the "after"
  -- snapshot, because the relations are rewritten by the after-trigger during the UPDATE.
  select coalesce(array_agg(case when r.note_a_id = v_old.id then r.note_b_id else r.note_a_id end), '{}')
  into v_before
  from public.relations r
  where v_old.id in (r.note_a_id, r.note_b_id);

  update public.notes
  set name = p_name, content = p_content, type_id = v_type_id
  where id = v_old.id
  returning * into v_new;

  select coalesce(array_agg(case when r.note_a_id = v_new.id then r.note_b_id else r.note_a_id end), '{}')
  into v_after
  from public.relations r
  where v_new.id in (r.note_a_id, r.note_b_id);

  select coalesce(jsonb_agg(jsonb_build_object('note_id', n.id, 'name', n.name) order by lower(n.name), n.id), '[]'::jsonb)
  into v_added
  from public.notes n
  where n.id = any (v_after) and not (n.id = any (v_before));

  select coalesce(jsonb_agg(jsonb_build_object('note_id', n.id, 'name', n.name) order by lower(n.name), n.id), '[]'::jsonb)
  into v_removed
  from public.notes n
  where n.id = any (v_before) and not (n.id = any (v_after));

  return jsonb_build_object(
    'note', to_jsonb(v_new),
    -- Mirrors notes_detect_relations' skip rule (case-sensitive comparison).
    'rechecked', (v_new.name <> v_old.name or v_new.content <> v_old.content),
    'added', v_added,
    'removed', v_removed
  );
end;
$$;

revoke execute on function public.update_note(uuid, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.update_note(uuid, uuid, text, text, uuid, text) to authenticated;

create function public.delete_note(p_campaign_id uuid, p_note_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_note public.notes;
  v_removed jsonb;
begin
  select * into v_note
  from public.notes
  where id = p_note_id and campaign_id = p_campaign_id
  for update;

  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('note_id', n.id, 'name', n.name) order by lower(n.name), n.id), '[]'::jsonb)
  into v_removed
  from public.relations r
  join public.notes n on n.id = case when r.note_a_id = v_note.id then r.note_b_id else r.note_a_id end
  where v_note.id in (r.note_a_id, r.note_b_id);

  -- The relations rows go away via the composite FK's on delete cascade.
  delete from public.notes where id = v_note.id;

  return jsonb_build_object('name', v_note.name, 'removed', v_removed);
end;
$$;

revoke execute on function public.delete_note(uuid, uuid) from public, anon;
grant execute on function public.delete_note(uuid, uuid) to authenticated;
