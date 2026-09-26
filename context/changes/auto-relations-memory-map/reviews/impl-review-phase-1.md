<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auto-Detected Relations & Memory Map

- **Plan**: context/changes/auto-relations-memory-map/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-09-26
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

- Commit 9e7b21e: migration, integration tests, contract-surfaces, roadmap/plan/change bookkeeping. All planned files are present, and no unplanned code changed.
- Migration matches the contract: signatures, `immutable strict`, `security invoker`, `search_path = ''`, grants (the trigger function is revoke-only), the trigger on `after insert or update of name, content`, and the backfill.
- `npm run test:integration`: 3 files, 35 tests passed. `npm run lint`: clean.
- `npx supabase db reset` was not re-run during the review because it would wipe the local DB. `supabase migration list --local` shows 20260926120000 applied, and the suite passes against it.
- Manual 1.5: the hosted probe result is in the commit message (`alnum_ok=true, icase_ok=true`). Manual 1.6 was a Studio check with no diff artifact, as expected.

## Findings

### F1 — `relations` still directly writable; docs claim otherwise

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: docs/reference/contract-surfaces.md (relations section); supabase/migrations/20260922120000_campaign_notes_schema.sql:131-140
- **Detail**: The new docs line says rows are "written only by detect_note_relations() and recompute_campaign_relations() … No other code path inserts into or deletes from relations." But `relations_insert_own_campaign` and `relations_delete_own_campaign` still let any authenticated user insert or delete their own relations through PostgREST with the public anon key. The integration test at relation-detection.test.ts ("recompute … restores a deleted relation") does exactly this. So FR-011 (no manual relation creation) holds only in the app UI, not at the data layer. A hand-inserted edge between X and Y stays until X or Y is written again, or until a recompute runs. Only the owner's own data is affected, so there is no cross-tenant risk. The detection functions are `security invoker`, so they need those policies, which means the policies can't simply be dropped.
- **Fix A ⭐ Recommended**: Correct the contract-surfaces wording. Say the only *app* writers are the detection functions, direct REST writes to own relations remain possible (as with notes), and they self-heal on the next write of either endpoint or on `recompute_campaign_relations`.
  - Strength: Documentation matches reality, and this stays within the plan's invoker design and the single-user threat model the plan already accepts.
  - Tradeoff: FR-011 is not enforced at the DB level.
  - Confidence: HIGH — a one-paragraph doc edit.
  - Blind spot: If S-03 or later adds sharing, a collaborator could inject edges.
- **Fix B**: Make `detect_note_relations`/`recompute_campaign_relations` `security definer` with an explicit `auth.uid()` ownership check. Drop the relations INSERT/DELETE policies and revoke those privileges from `authenticated`.
  - Strength: FR-011 becomes a DB invariant.
  - Tradeoff: Definer functions bypass RLS, so every query in them needs manual scoping. The migration and tests need rework (the test's direct delete would have to use the service role). This goes against the plan's deliberate invoker choice.
  - Confidence: MED — a known pattern (`handle_new_user` is definer), but a larger security surface to get right.
  - Blind spot: The interaction with the `create_note` RPC and the backfill running as `postgres` hasn't been re-verified.
- **Decision**: FIXED (Fix A — contract-surfaces relations section reworded)

### F2 — Rename-away path not tested

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/integration/relation-detection.test.ts ("re-detects relations on rename")
- **Detail**: The rename test only checks that renaming *into* a mentioned name creates a relation. Renaming *away* from a mentioned name, which should delete the stale relation through the `deleted` CTE, has no test. The content-removal test exercises the same delete branch, so the risk is low.
- **Fix**: Add a final step: rename the note back to "Original Name Gamma" and assert that `getRelation` returns null.
- **Decision**: FIXED (rename-back assertion added; integration suite green)
