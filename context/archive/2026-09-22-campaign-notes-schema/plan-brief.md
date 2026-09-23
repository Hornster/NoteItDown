# Campaign & Note Data Foundation — Plan Brief

> Full plan: `context/changes/campaign-notes-schema/plan.md`

## What & Why

Roadmap item F-01: create the Supabase schema (`campaigns`, `note_types`, `notes`, `relations`) with per-owner RLS, plus a DB trigger that auto-provisions a default campaign and its 4 predefined note types at signup. This is a bounded foundation slice — no UI, no matching logic — that exists solely to unlock S-01 through S-05.

## Starting Point

No `supabase/migrations/` exist today; the app only uses `auth.users` via `@supabase/ssr` with the anon key (no service-role client anywhere). Signup redirects to an email-confirmation page before any session exists, so there's no reliable app-level hook for "just signed up" — which is why default-campaign creation has to live in a database trigger, not in `signup.ts`.

## Desired End State

After this change, `npx supabase db reset` provisions the full domain schema automatically, and any new signup ends up owning exactly one campaign with 4 predefined note types, with RLS guaranteeing no other user can see or touch it — all reachable through the same anon-key session client the app already uses everywhere else.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Note type representation | Separate `note_types` table (FK from `notes.type_id`) | Real relational integrity + a clean per-campaign unique constraint on custom type names, vs. a table-less text column. | Plan |
| Default campaign creation | Postgres trigger on `auth.users` insert | Signup never gets a confirmed session in production, so there's no reliable app-level hook — a trigger fires regardless of confirmation timing. | Plan |
| Ownership / RLS shape | Join-based via `campaigns.owner_id` only | Single source of truth for ownership; no denormalized `owner_id` duplicated onto `notes`/`relations`. | Plan |
| Note name uniqueness | Enforced, case-insensitive, per campaign | Exact-name matching (FR-007) assumes a name unambiguously identifies one note. | Plan |
| Matching-support columns | Deferred entirely to S-02 | Keeps F-01 to schema/RLS/provisioning only; S-02 owns its own query pattern. | Plan |
| Campaign scoping | Composite FKs (`notes`→`note_types`, `relations`→`notes`) on `(campaign_id, id)`; `relations` carries `campaign_id` | FK checks bypass RLS, so without these a user could reference another tenant's type/note by UUID (verified in plan review). | Plan review F1 |
| Relations shape | Undirected pair, canonical order + unique constraint | PRD describes relations as symmetric connections, not "who mentioned whom"; avoids duplicate edges for mutual mentions. | Plan |
| Delete strategy | Hard delete + `ON DELETE CASCADE` | PRD never asks for undo/trash; cascade removes orphaned relations with zero app cleanup code. | Plan |
| Campaign fields | `name` only | PRD never mentions a campaign description. | Plan |
| `src/types.ts` scope | Scaffolded in this change | CLAUDE.md names it as where shared entities belong; F-01 is defining these entities' shape, so keep the contract in one place and unblock S-01 immediately. | Plan |

## Scope

**In scope:**
- `campaigns`, `note_types`, `notes`, `relations` tables, constraints, indexes
- RLS policies scoped to campaign ownership (per-operation, only where a caller exists)
- Two provisioning triggers: default campaign at signup, predefined note types on every campaign creation
- `src/types.ts` entity types
- README + `docs/reference/contract-surfaces.md` corrections

**Out of scope:**
- Relation-detection algorithm, memory map UI, campaign-switcher UI, image attachments (S-02/S-03/S-05)
- Case-insensitive matching schema support (deferred to S-02)
- Soft delete, campaign description field, manual relation editing

## Architecture / Approach

One migration, applied in dependency order (`campaigns` → `note_types` → `notes` → `relations`). Ownership is anchored solely on `campaigns.owner_id`; every other table's RLS policy joins up to `campaigns` rather than duplicating an owner column. Note-type seeding is attached to `campaigns AFTER INSERT` (not to `auth.users`) so it fires identically whether the campaign was auto-created at signup or explicitly created later by S-03 — no duplicated seeding logic between the two paths.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database schema, RLS, and provisioning triggers | The full migration: 4 tables, constraints, RLS, 2 triggers | Getting the per-owner RLS boundary wrong compromises Access Control for every downstream slice — this is the roadmap's own flagged highest-risk item |
| 2. Shared types and documentation sync | `src/types.ts`, README fix, `docs/reference/contract-surfaces.md` | Types drifting from the actual migration columns if not spot-checked |

**Prerequisites:** None — first schema migration in the project; local Supabase (`npx supabase start`) required to verify. Production rollout is a manual, human-approved `npx supabase db push` (CI does not run migrations); the migration backfills a default campaign for pre-existing users.
**Estimated effort:** ~1 session, 2 phases (schema is the bulk of the work; Phase 2 is small).

## Open Risks & Assumptions

- Assumes future `UPDATE` statements on `campaigns`/`notes` don't need to set `updated_at` manually — a `BEFORE UPDATE` trigger handles it, so this is covered, not a residual risk.
- `note_types` intentionally has no `UPDATE`/`DELETE` RLS policy; if a future slice needs to rename or remove a custom type, that policy will need to be added then.

## Success Criteria (Summary)

- A new signup produces exactly one campaign and 4 predefined note types, with zero application code involved.
- A second user's session cannot read, insert, update, or delete any row belonging to the first user's campaign, note types, notes, or relations.
- `src/types.ts` gives S-01 a ready-made, accurate TypeScript contract for these four entities.
