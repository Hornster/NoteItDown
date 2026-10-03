-- Note image attachments (S-05): private Storage bucket, note_images table, RLS and
-- storage.objects policies. Bucket config lives here (not config.toml) so local and
-- hosted environments match.
--
-- Object path format: {user_id}/{campaign_id}/{note_id}/{uuid}[-thumb].{webp|jpg}
-- Limits mirror src/lib/images/limits.ts (2.5 MiB = 2621440 bytes, WebP/JPEG only).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 2621440, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- note_images -------------------------------------------------------

create table public.note_images (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  note_id uuid not null,
  -- position in (0,1) + unique (note_id, position) is the 2-images-per-note cap
  position smallint not null check (position in (0, 1)),
  path text not null unique,
  -- null when the original already fits within the thumbnail size
  thumb_path text unique,
  mime text not null check (mime in ('image/webp', 'image/jpeg')),
  width int not null check (width > 0),
  height int not null check (height > 0),
  thumb_width int check (thumb_width is null or thumb_width > 0),
  thumb_height int check (thumb_height is null or thumb_height > 0),
  byte_size int not null check (byte_size between 1 and 2621440),
  alt_text text check (
    alt_text is null or (alt_text = btrim(alt_text) and alt_text <> '' and char_length(alt_text) <= 200)
  ),
  created_at timestamptz not null default now(),
  constraint note_images_note_position_key unique (note_id, position),
  -- composite FK: FK checks bypass RLS, so campaign scoping must be a table invariant
  constraint note_images_note_same_campaign_fkey foreign key (campaign_id, note_id)
    references public.notes (campaign_id, id) on delete cascade,
  constraint note_images_thumb_consistency_check check (
    (thumb_path is null and thumb_width is null and thumb_height is null)
    or (thumb_path is not null and thumb_width is not null and thumb_height is not null)
  ),
  constraint note_images_path_shape_check check (
    split_part(path, '/', 2) = campaign_id::text
    and split_part(path, '/', 3) = note_id::text
    and (
      thumb_path is null
      or (
        split_part(thumb_path, '/', 2) = campaign_id::text
        and split_part(thumb_path, '/', 3) = note_id::text
      )
    )
  )
);

create index note_images_campaign_id_idx on public.note_images (campaign_id);

alter table public.note_images enable row level security;

create policy "note_images_select_own_campaign" on public.note_images
  for select to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = note_images.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "note_images_insert_own_campaign" on public.note_images
  for insert to authenticated with check (
    exists (select 1 from public.campaigns c
            where c.id = note_images.campaign_id and c.owner_id = (select auth.uid()))
    and split_part(path, '/', 1) = (select auth.uid())::text
  );
-- Exists for the alt_text column grant only (see below).
create policy "note_images_update_own_campaign" on public.note_images
  for update to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = note_images.campaign_id and c.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.campaigns c
            where c.id = note_images.campaign_id and c.owner_id = (select auth.uid()))
  );
create policy "note_images_delete_own_campaign" on public.note_images
  for delete to authenticated using (
    exists (select 1 from public.campaigns c
            where c.id = note_images.campaign_id and c.owner_id = (select auth.uid()))
  );

-- Only alt_text is editable; paths, dimensions and ownership are immutable via the API.
revoke update on public.note_images from anon, authenticated;
grant update (alt_text) on public.note_images to authenticated;

-- storage.objects policies (bucket note-images) -----------------------
-- Asymmetry by design: INSERT also requires that folders 2/3 name a campaign and note the
-- caller owns; SELECT and DELETE check only the user folder, so cleanup still works after
-- the note row is gone. Segments are compared as text, never cast to uuid. No UPDATE policy.

create policy "note_images_objects_insert_own_note" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'note-images'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.notes n
      join public.campaigns c on c.id = n.campaign_id
      where n.id::text = (storage.foldername(objects.name))[3]
        and c.id::text = (storage.foldername(objects.name))[2]
        and n.campaign_id = c.id
        and c.owner_id = (select auth.uid())
    )
  );
create policy "note_images_objects_select_own_folder" on storage.objects
  for select to authenticated using (
    bucket_id = 'note-images'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  );
create policy "note_images_objects_delete_own_folder" on storage.objects
  for delete to authenticated using (
    bucket_id = 'note-images'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  );
