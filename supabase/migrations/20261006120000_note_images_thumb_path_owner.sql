-- S-05 review fix (impl-review phase 1, F2): pin thumb_path's user folder like path's.
-- The path-shape check only pins segments 2/3, so a direct PostgREST insert could store a
-- thumb_path under another user's folder.

drop policy "note_images_insert_own_campaign" on public.note_images;

create policy "note_images_insert_own_campaign" on public.note_images
  for insert to authenticated with check (
    exists (select 1 from public.campaigns c
            where c.id = note_images.campaign_id and c.owner_id = (select auth.uid()))
    and split_part(path, '/', 1) = (select auth.uid())::text
    and (thumb_path is null or split_part(thumb_path, '/', 1) = (select auth.uid())::text)
  );
