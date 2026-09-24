-- Atomic "resolve or create the type, then insert the note" so a failed note insert
-- (for example a duplicate name) can never leave behind a custom type the user can't
-- delete (note_types has no DELETE policy).
--
-- security invoker: RLS still applies as the calling user, so this grants no more than
-- direct table access already allows; it only makes the two-step operation atomic.

create function public.create_note(
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

  insert into public.notes (campaign_id, type_id, name, content)
  values (p_campaign_id, v_type_id, p_name, p_content)
  returning * into v_note;

  return v_note;
end;
$$;

revoke execute on function public.create_note(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.create_note(uuid, text, text, uuid, text) to authenticated;

-- notes is not part of the signup/seeding trigger chain, so unlike note_types its limits
-- are enforced in the DB as well: the anon key is public, and RLS allows a direct insert
-- into notes or an rpc('create_note') call that skips zod (Phase 2). These must stay in
-- sync with the createNoteSchema limits.
alter table public.notes add constraint notes_name_length_check check (char_length(name) <= 120);
alter table public.notes add constraint notes_content_length_check check (char_length(content) <= 20000);
