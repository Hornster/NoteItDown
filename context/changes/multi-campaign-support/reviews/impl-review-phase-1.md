<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-Campaign Support Implementation Plan

- **Plan**: context/changes/multi-campaign-support/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Commit reviewed: `95df049`. Every planned file is in the diff. The only file outside the plan's list is `src/pages/notes/[id].astro`, which is the call-site move implied by §4 ("`UUID_RE` / `isUuid()` moves to `src/lib/utils.ts`").
- Migration `20260928120000_campaign_name_rules.sql` matches the contract exactly (check constraint + `(owner_id, lower(name))` unique index, signup-coupling and sync-with-`CAMPAIGN_NAME_MAX_LENGTH` header). It mirrors `notes_name_check` / `notes_campaign_name_key`.
- The service contract matches: `listCampaigns`, `getCampaign` (with the UUID check before the query), `createCampaign`/`renameCampaign` (`23505` → `duplicate_name`, zero rows or malformed id → `not_found`, raw error only in `unexpected`), and `resolveLandingCampaign`.
- Every integration case listed in §5 exists in `tests/integration/campaigns-service.test.ts`.
- Phase interaction: Phase 2 later replaced `getActiveCampaign` with a private `getOldestCampaign`. `resolveLandingCampaign` behaves the same afterwards and its tests still pass.
- Automated checks run on 2026-09-29:
  - `npm run test:unit`: pass (33 tests)
  - `npm run lint`: pass
  - `npx astro check`: 0 errors, 0 warnings, 0 hints
  - `npm run test:integration`: pass (47 tests)
  - Migration: I did not run `npx supabase db reset`, to avoid wiping local data. Instead I checked that the migration is applied locally (`supabase migration list --local`) and that `campaigns_name_check` and `campaigns_owner_name_key` exist in `pg_constraint`/`pg_indexes`. Fresh-DB application is also covered by the CI smoke job.

## Findings

### F1 — listCampaigns ordering test depends on earlier tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/campaigns-service.test.ts:138
- **Detail**: `expect(campaigns.length).toBeGreaterThan(1)` only passes because earlier tests in the file created campaigns for tenant A. Only `campaigns[0]` is checked, so "oldest first" is never verified beyond the first item. Running the test alone (`it.only`, or with shuffle) would fail it, and a wrong order among later campaigns would not be caught.
- **Fix**: Inside the test, create two campaigns, then check that the listed ids end with `[default, first, second]` in that order.
- **Decision**: FIXED — the test now creates its own two campaigns and checks the last two ids in order. It passes when run on its own (`-t listCampaigns`).

### F2 — Manual check 1.6 cannot detect constraint violations as written

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/multi-campaign-support/plan.md:127 (Progress 1.6)
- **Detail**: `supabase db push --dry-run` only lists the pending migrations. It does not run `ALTER TABLE … ADD CONSTRAINT` against the data, so it cannot report violations. Item 1.6 is ticked with only a commit sha as evidence. The real risk is low: before S-03 there was no UI for making campaigns, so production should hold only `'My Campaign'` per user. Still, the check as written proves nothing.
- **Fix**: Before (or after) deploying, run a read-only query on production: `select owner_id, lower(name), count(*) from campaigns group by 1,2 having count(*)>1` plus `select id from campaigns where name <> btrim(name) or name = '' or char_length(name) > 80`. Both should return zero rows. Also reword 1.6 in future plans.
- **Decision**: DISMISSED — already verified. During manual testing the user applied the migration's constraints against production data inside a transaction, then rolled it back. No errors were thrown. That runs the real `ADD CONSTRAINT` against the data, so check 1.6 has real evidence behind it.
