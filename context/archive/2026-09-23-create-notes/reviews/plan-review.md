<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Create Notes (S-01)

- **Plan**: context/changes/create-notes/plan.md
- **Mode**: Deep (codebase verification done inline, no sub-agent)
- **Date**: 2026-09-24
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
9/9 paths ✓, 6/6 symbols ✓ (PROTECTED_ROUTES, notes_campaign_name_key, note_types_campaign_name_key, notes_type_same_campaign_fkey, enable_confirmations=false, vitest 5.0.1 peer vite ^8 vs installed 8.3.0), brief↔plan ✓, Progress↔Phase ✓ (6/7/11).

Verified to hold: ON CONFLICT on the expression index is valid; DO NOTHING needs only the INSERT policy; RLS WITH CHECK runs before conflict detection (cross-tenant new-type insert raises 42501); the composite FK blocks a foreign type_id despite the FK check bypassing RLS.

## Findings

### F1 — Test user creation will hit the GoTrue sign-in/sign-up rate limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM (real tradeoff; pause to reason through it)
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2, §5
- **Detail**: `sign_in_sign_ups = 30` per 5 min per IP (supabase/config.toml:190). createTestUser did signUp + signIn per user, about 14 users in total, plus 3 requests from the smoke step in the same CI job, which is over the limit. Local reruns get 429.
- **Fix A ⭐ Recommended**: Use the session `signUp` returns; create tenants once per file in `beforeAll`.
- **Fix B**: Raise `sign_in_sign_ups` in config.toml.
- **Decision**: FIXED (Fix A). The user asked whether the limit is billing-related: it isn't. It's GoTrue abuse prevention, and config.toml affects only the local stack.

### F2 — Integration preflight: no clear error when Supabase is stopped, no guard against a remote DB

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1, Manual 1.6
- **Detail**: The env-present check passes when Supabase is stopped (the failure is ECONNREFUSED, not a clear message). If .env points at production, the suite creates throwaway users there.
- **Fix**: Integration-only globalSetup with a localhost host guard and an `/auth/v1/health` check.
- **Decision**: FIXED

### F3 — Length limits enforced only in zod are bypassable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details: "Signup and seeding coupling"
- **Detail**: Direct PostgREST insert or rpc skips zod. The signup-coupling reason for zod-only limits applies to note_types, not notes.
- **Fix**: `notes_name_length_check` (≤120) and `notes_content_length_check` (≤20,000) in the create_note migration, plus a 23514 integration test. Brief updated.
- **Decision**: FIXED

### F4 — Doc sync misses contract-surfaces sections that will go stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §5
- **Detail**: "Shared TypeScript types", "Migration file" and (after F3) `notes` sections would go stale.
- **Fix**: Added the three section updates to Phase 3 §5.
- **Decision**: FIXED

### F5 — Tenant-isolation test covers only one of the two function paths

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Testing Strategy: function level
- **Detail**: The p_new_type_name path (note_types insert with ON CONFLICT) wasn't covered separately.
- **Fix**: Test both variants; assert 42501 and unchanged counts read with A's client.
- **Decision**: FIXED
