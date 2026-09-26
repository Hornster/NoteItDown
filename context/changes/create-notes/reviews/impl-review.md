<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create Notes (S-01) Implementation Plan

- **Plan**: context/changes/create-notes/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria evidence

Commits reviewed: 7a36060 (p1), d45517c (p2), 36b9f18 (p3). 30 files changed.

| Command | Result |
|---------|--------|
| `npx supabase db reset` | PASS |
| `npm run test:unit` | PASS (15 tests) |
| `npm run test:integration` | PASS (14 tests, 2 files) |
| `npm run lint` | PASS |
| `npx astro check` | PASS (0 errors / 0 warnings / 0 hints) |
| `npm run build` | PASS |
| `npm run smoke` (against preview) | PASS (6/6 steps) |

Manual items 1.5–1.6, 2.6–2.7, 3.6–3.11 are marked done. The integration tests independently cover the same behavior as 1.5 (grants), 3.8 (type reuse), 3.9 (duplicate name) and 3.11 (cross-tenant null). The remaining UI checks rely on the human sign-off.

Every contract bullet in Phases 1–3 matches the implementation, and every Testing Strategy case has a test. The safety scan found no issues: no injection or XSS vectors, `create_note` is SECURITY INVOKER with `search_path = ''` and correct grants, cross-tenant isolation holds via RLS and the composite FK, the ON CONFLICT + select path is race-safe under read-committed, and the middleware prefix covers `/notes/*`.

## Findings

### F1 — Unplanned sign-in redirect change

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/auth/signin.ts:19
- **Detail**: The post-signin redirect changed from `/` to `/dashboard`. The plan doesn't mention it. The change is benign (a hardcoded literal, so not an open redirect) and it supports the slice's "lands on dashboard" UX. `scripts/smoke.mjs` still passes (sign-in now 302s to `/dashboard`). It is still undocumented behavior change in the auth flow.
- **Fix**: Add a one-line addendum to plan.md (Phase 3, Route protection) recording the redirect change before archiving.
- **Decision**: FIXED — addendum added to plan.md (Phase 3, Route protection)

### F2 — CSRF protection on POST /api/notes relies on implicit cookie default

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:9-20
- **Detail**: The new cookie-authenticated JSON endpoint's CSRF safety comes from `@supabase/ssr`'s default `SameSite=Lax` session cookie. No option is set explicitly. It is safe today, but the invariant isn't visible in code, and a library default change would silently weaken it.
- **Fix**: Pass `cookieOptions: { sameSite: "lax", secure: true }` (or record as a lesson for future POST endpoints).
- **Decision**: FIXED (variant) — `cookieOptions: { sameSite: "lax", secure: import.meta.env.PROD }` in src/lib/supabase.ts; secure gated on PROD so dev over non-localhost http keeps working. Build + smoke re-verified.

### F3 — README CI section names the wrong branch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: README.md:206
- **Detail**: The README says CI runs on push/PR to `master`, but the repo and `ci.yml` use `main`. The line predates this change, but Phase 3 edited the bullets directly below it (208–209) and left it stale.
- **Fix**: Replace `master` with `main` on README.md:206.
- **Decision**: FIXED — README.md:206 now says `main`. Same stale `master` remains in CLAUDE.md:89 (not changed; flagged to user).
