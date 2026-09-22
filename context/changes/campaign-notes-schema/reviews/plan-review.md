<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Campaign & Note Data Foundation

- **Plan**: context/changes/campaign-notes-schema/plan.md
- **Mode**: Deep (plan DDL applied and exercised in a throwaway `supabase/postgres:17.6.1.167` container)
- **Date**: 2026-09-22
- **Verdict**: REVISE → SOUND after triage (revised DDL re-verified in container)
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | PASS |

## Grounding
6/6 paths ✓ (src/types.ts and supabase/migrations/ correctly absent), 4/4 symbols ✓, brief↔plan ✓. Minor: plan says production requires email confirmation; deploy-plan.md:22 says it's assumed OFF. The trigger design is valid either way.

## Findings

### F1 — Foreign keys can point into another user's campaign

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `notes.type_id`, the `relations` policies
- **Detail**: Postgres does not apply RLS when it checks a foreign key. The policies checked only the row's own campaign (notes) or only `note_a_id` (relations). Reproduced: user A inserted a note using B's note_type and a relation (A's note, B's note). B then could not delete B's own campaign (`notes_type_id_fkey`). The same user could also create relations that span campaigns.
- **Fix A ⭐ Recommended**: Composite FKs on `(campaign_id, id)`; `relations.campaign_id`; negative-case manual check 1.8
  - Strength: The rule is a table invariant, so RLS and SECURITY DEFINER paths cannot bypass it; simpler relations policies.
  - Tradeoff: New `relations.campaign_id` column.
  - Confidence: HIGH — reproduced and re-verified in container.
  - Blind spot: None significant.
- **Fix B**: Tighten only the RLS WITH CHECK clauses
  - Strength: No schema change.
  - Tradeoff: Duplicated policy SQL; a SECURITY DEFINER path can bypass it.
  - Confidence: MED.
  - Blind spot: Future definer functions skip the checks.
- **Decision**: FIXED (Fix A)

### F2 — Existing production users get no campaign, and nothing applies the migration to production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Migration Notes, Desired End State
- **Detail**: The production smoke run created real `auth.users` rows, and the signup trigger only fires on new inserts. CI deploys only the Worker; nothing runs migrations against the hosted project.
- **Fix**: Idempotent backfill at the end of the migration. Add Phase 1 §2 (human-approved `supabase db push` recorded in deploy-plan.md) and manual check 1.9. Scope the end state to cover production.
- **Decision**: FIXED

### F3 — Policies have no role, and set_updated_at has no search_path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — all `create policy` statements, `set_updated_at()`
- **Detail**: CLAUDE.md requires per-role policies, but none had a TO clause. `auth.uid()` was not wrapped in `(select …)`, and `set_updated_at()` had no search_path.
- **Fix**: `to authenticated` on all 13 policies, `(select auth.uid())`, `set search_path = ''`.
- **Decision**: FIXED

### F4 — An empty or whitespace note name would match every note

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `notes.name`, `note_types.name`, the note_types insert policy
- **Detail**: `''` is a substring of every text, so S-02 matching would link it to every note, and `'Bob'` / `'Bob '` bypassed uniqueness. Users could also insert `is_predefined = true` types.
- **Fix**: `check (name = btrim(name) and name <> '')` on both tables; `not is_predefined` in the note_types insert WITH CHECK.
- **Decision**: FIXED

### F5 — The pgcrypto line is unnecessary

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1, first line of DDL; brief Open Risks
- **Detail**: `gen_random_uuid()` is core Postgres since v13 (the project uses 17). Supabase already installs pgcrypto in `extensions`, and the line could install it into `public`.
- **Fix**: Remove the line and the brief risk bullet.
- **Decision**: FIXED

## Not raised (for S-01 planning)

Consider generating Supabase types (`npx supabase gen types typescript --local`) re-exported from `src/types.ts` instead of hand-written interfaces. This gives typed queries and removes the drift check 2.4.
