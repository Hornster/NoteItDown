-- Enforces the agreed campaign-name rules in the DB (trimmed, non-empty, <= 80 chars,
-- unique per owner case-insensitively) so a direct RLS insert/update with the public
-- anon key can't bypass zod, mirroring how notes.name is protected
-- (see 20260922120000_campaign_notes_schema.sql's notes_name_check / notes_campaign_name_key).
--
-- Signup coupling: handle_new_user() inserts the default campaign name 'My Campaign' inside
-- GoTrue's signup transaction (see 20260922120000_campaign_notes_schema.sql). That default
-- satisfies both rules below, so this migration must not tighten them further without also
-- checking that default still passes.
--
-- The 80-char limit here must stay in sync with CAMPAIGN_NAME_MAX_LENGTH in
-- src/lib/schemas/campaigns.ts.

alter table public.campaigns
  add constraint campaigns_name_check check (name = btrim(name) and name <> '' and char_length(name) <= 80);

create unique index campaigns_owner_name_key on public.campaigns (owner_id, lower(name));
