-- Identity/scope columns are immutable for API roles: notes cannot be re-parented
-- to another campaign, and row ids cannot be rewritten. RLS policies are unchanged.
-- updated_at is still maintained by the BEFORE UPDATE triggers (column privileges
-- apply to the statement's SET list, not to trigger-modified NEW values).

revoke update on public.campaigns from anon, authenticated;
grant update (name) on public.campaigns to authenticated;

revoke update on public.notes from anon, authenticated;
grant update (name, content, type_id) on public.notes to authenticated;
