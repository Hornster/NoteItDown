<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Risk Tests — Phase 2 (Session revocation and path variants)

- **Plan**: context/changes/auth-risk-tests/plan.md
- **Scope**: Phase 2 only
- **Mode**: Deep (verified inline, no sub-agent)
- **Date**: 2026-10-11
- **Verdict**: SOUND (before fixes: SOUND with minor warnings)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING (1 observation) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (1 finding) |
| Plan Completeness | WARNING (1 observation) |

## Grounding

5/5 paths ✓ (`src/pages/api/auth/signin.ts`, `src/pages/api/auth/signout.ts`, `src/middleware.ts`, `src/pages/api/campaigns/[campaignId]/index.ts`, `tests/support/test-user.ts`). Symbols ✓: signin redirects to `/dashboard`; signout redirects to `/`; `PATCH /api/campaigns/not-a-uuid` returns 404 after the 401 check (`isUuid`); `createTestUser()` uses 1 auth call (signUp only); auth-js `signOut()` defaults to `scope: 'global'`. Brief↔plan ✓. Progress 2.1–2.4 ↔ success criteria ✓. The Astro normalization claim (research §1: decode + `collapseDuplicateSlashes` before middleware, case-sensitive route regexes) is consistent with the plan.

## Findings

### F1 — Replay rows clear their own snapshot jar

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 — Revocation matrix (`it.each` replayed with `preSignout`)
- **Detail**: When a revoked session gets a session-missing error, auth-js `_getUser` calls `_removeSession()` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2721-2724`). Through `src/lib/supabase.ts` `setAll`, that sends `Set-Cookie` headers that clear the `sb-*` cookies, and the jar treats `max-age=0` as a delete. If `send({ jar: preSignout })` stores response cookies, the first replay row empties the snapshot and every later row runs anonymously. "Denied on every route" would then be proven for only one route. A later handler that trusts a locally decoded JWT (`getSession`) would pass as a false green.
- **Fix**: Each replay row sends with its own `preSignout.clone()` and first asserts that the clone's `header()` contains `sb-`.
- **Decision**: FIXED — Phase 2 §1 contract now requires a per-row clone plus the `sb-` precondition assert, with the reason inline.

### F2 — Path-variant probes need raw URL concatenation

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 (relies on Phase 1 §3 `send`)
- **Detail**: If `send` builds URLs with `new URL(path, HTTP_BASE_URL)`, then `//dashboard` is treated as protocol-relative and becomes host `dashboard`, so the request fails with ENOTFOUND. The test fails loudly, which is safe, but it costs time to debug. The Phase 1 client contract didn't say how URLs are built.
- **Fix**: State in the client contract that `send` uses `HTTP_BASE_URL + path` (as smoke does) and must not normalize or encode the path.
- **Decision**: FIXED — Phase 1 §3 client contract now specifies plain string concatenation with no `new URL(path, base)`, normalization or encoding.

### F3 — "Pins normalization" intent vs a 302-or-404 oracle

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §2 — Intent
- **Detail**: The intent said "an Astro upgrade that changes [normalization] fails CI". But the test accepts 302 or 404. If decoding stopped, `/%63ampaigns/...` would give a 404 and still pass. The test proves "no bypass", not "same normalization". That's the right oracle, and the brief already allows 302 to turn into 404. Only the intent line overclaimed.
- **Fix**: Reword the intent to "an Astro upgrade that lets a variant reach a protected page (200) fails CI".
- **Decision**: FIXED — Phase 2 §2 intent reworded; a 302↔404 switch is explicitly allowed.

## Triage Summary

- Fixed: F1, F2, F3 (3)
- Skipped / Accepted / Dismissed: none
- Verdict after fixes: SOUND
