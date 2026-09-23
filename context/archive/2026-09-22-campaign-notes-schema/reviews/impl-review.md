<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Campaign & Note Data Foundation Implementation Plan

- **Plan**: context/changes/campaign-notes-schema/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Plan drift: the migration is byte-for-byte identical to the plan's SQL contract. `src/types.ts`, `README.md`, `docs/reference/contract-surfaces.md` and `deploy-plan.md` all match their stated intent. Nothing in "What We're NOT Doing" was violated.

Success criteria: `npm run lint` and `npx astro sync && npx astro check` pass (0 errors, 0 warnings, 0 hints), and both required files exist. `npx supabase db reset` was not re-run, because the local container was still starting up and a reset would wipe local data. The production push is recorded in `deploy-plan.md`.

Incident during review: a review sub-agent's SQL probes accidentally committed changes to the **local** Supabase DB. They inserted 2 test users (`a@x.test`, `b@x.test`) and deleted all campaigns, which cascaded to all note types, notes and relations. Production was not affected. This does not count against the implementation. Repaired on 2026-09-23 by deleting the 2 test users and re-running the migration backfill: both real users again own 1 campaign with 4 note types. The custom note type `yue` and the notes and relations that existed before could not be recovered.

## Findings

### F1 — Notes (and row ids) can be re-parented via UPDATE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_campaign_notes_schema.sql:90-97
- **Detail**: `notes_update_own_campaign` WITH CHECK only requires the _new_ campaign to be owned by the caller. Supabase's default table grants give `authenticated` UPDATE on every column, so a user can move a note to another campaign they own, by updating `campaign_id` and `type_id` together. They can also rewrite `notes.id` and `campaigns.id`. Moving a note is blocked only when it has relations, because the composite FK raises 23503. Tenant isolation holds: a note cannot move into another user's campaign. The risk is that notes silently change campaign once S-03 adds multiple campaigns.
- **Fix A ⭐ Recommended**: New migration with column-level grants: `revoke update on public.notes from authenticated; grant update (name, content, type_id) on public.notes to authenticated;` and the same for `campaigns` with `(name)`.
  - Strength: Makes the identity and scope columns immutable at the privilege layer. The RLS policies stay unchanged.
  - Tradeoff: A future slice that really needs to move notes will need its own grant change.
  - Confidence: HIGH — a standard Postgres/Supabase pattern.
  - Blind spot: Supabase's default privileges might re-grant the columns on future `alter table`. Verify after later migrations.
- **Fix B**: Accept it and document in contract-surfaces that `notes.campaign_id` is mutable within an owner's campaigns.
  - Strength: No schema change.
  - Tradeoff: S-03/S-04 must handle notes moving between campaigns, including relation cleanup.
  - Confidence: MED — depends on the S-03 design.
  - Blind spot: No PRD requirement says whether notes may move between campaigns.
- **Decision**: FIXED (Fix A) — `supabase/migrations/20260923120000_restrict_update_columns.sql`, applied locally and verified: `has_column_privilege` shows id/owner_id/campaign_id not updatable, `name` updatable; a rename still bumps `updated_at`. **Production push still pending (`npx supabase db push`, needs your approval).**

### F2 — SECURITY DEFINER functions use `search_path = public`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_campaign_notes_schema.sql:170, 191
- **Detail**: `seed_default_note_types` and `handle_new_user` pin `search_path = public`, while `set_updated_at` uses `''`. This is not exploitable today: all references are schema-qualified, and anon/authenticated cannot create objects in `public`. Both functions return `trigger`, so they cannot be called over RPC (checked).
- **Fix**: In a follow-up migration, `alter function ... set search_path = ''` for both, and optionally revoke EXECUTE from public, anon and authenticated.
- **Decision**: ACCEPTED — not exploitable (names are qualified, users can't create objects in public); `''` would turn any future unqualified name into a runtime signup failure

### F3 — Redundant indexes

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_campaign_notes_schema.sql:75, 122
- **Detail**: `notes_campaign_id_idx` is covered by `notes_campaign_id_id_key (campaign_id, id)`, and `relations_note_a_id_idx` is covered by `relations_unique_pair (note_a_id, note_b_id)`. Both only add write cost.
- **Fix**: Drop both indexes in a follow-up migration.
- **Decision**: SKIPPED

### F4 — `campaigns.name` lacks the trimmed/non-empty check

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260922120000_campaign_notes_schema.sql:8
- **Detail**: `notes.name` and `note_types.name` enforce `name = btrim(name) and name <> ''`; `campaigns.name` does not. This matters once S-03 lets users name campaigns.
- **Fix**: Add the same check in S-03's migration, or in a small follow-up.
- **Decision**: SKIPPED — defer to S-03, which makes campaign names user-editable

### F5 — contract-surfaces omissions

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/reference/contract-surfaces.md:30
- **Detail**: The trimmed/non-empty check is listed for `notes` but not for `note_types`. The registry also doesn't warn that any new constraint on `campaigns`/`note_types` can make signup fail, because `handle_new_user` runs inside the GoTrue insert transaction.
- **Fix**: Add both lines to contract-surfaces.md.
- **Decision**: FIXED — added the note_types name check, a signup-coupling warning, and the new column UPDATE grants to contract-surfaces.md

### F6 — deploy-plan wording contradicts itself

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/deployment/deploy-plan.md:50
- **Detail**: The line includes the project ref `xxnftruwtalhjmhblmlq`, then says "ref/token not stored here". The ref isn't secret, but the statement is false.
- **Fix**: Change the wording to "token not stored here".
- **Decision**: FIXED — wording changed to "token not stored here"

### F7 — README cloud-project section doesn't mention `db push`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:117-130
- **Detail**: The "Using a cloud Supabase project instead" section doesn't say that a hosted project needs `npx supabase db push` to get the schema.
- **Fix**: Add one sentence pointing to `npx supabase link` + `npx supabase db push`.
- **Decision**: FIXED — added a link + db push sentence to the README cloud-project section
