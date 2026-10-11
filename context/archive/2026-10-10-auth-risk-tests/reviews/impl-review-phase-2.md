<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Risk Tests Implementation Plan

- **Plan**: context/changes/auth-risk-tests/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-10-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

- Phase 2 commit: `330e4d0`. It touches `tests/http/session-revocation.test.ts` (new), `tests/http/route-guard.test.ts` (path-variant block appended) and the plan's Progress section. There are no `src/` edits and nothing outside the plan.
- Revocation matrix (`session-revocation.test.ts`) matches the contract. `beforeAll` creates the user, signs in through `POST /api/auth/signin`, and asserts 302 `/dashboard` and an `sb-` cookie in the jar. It then snapshots `preSignout`. Both positive controls are present: `GET /campaigns/<campaignId>` returns 200, and `PATCH /api/campaigns/not-a-uuid` returns 404, not 401. Signout returns 302 with location exactly `/`. The real `/campaigns/<campaignId>` is replayed explicitly. Every replay row clones `preSignout` and asserts `sb-` first (`replayJar()`, :35-39), which addresses the shared-jar warning from plan review 2.
- Revocation is server-side: the middleware uses `supabase.auth.getUser()` (`src/middleware.ts:12`), which validates against GoTrue, so a replayed access token can't pass on its local JWT validity alone.
- `npm run lint`: exit 0.
- `npm run test:http`: 2 files, 64 tests passed. Ports 4321–4323 were checked free first, and local Supabase was healthy.
- 2.4: the verbose reporter lists every replayed page and API method by method and path (for example, `replaying the pre-signout session against protected API methods > DELETE /api/campaigns/<uuid>/notes/<uuid> is rejected with 401 JSON`).
- 2.3 is a manual mutation of `signout.ts` that leaves no trace in the diff. It is accepted as reported.
- The literal `302` also appears in the Phase 2 code. Phase 1 review F2 already covers this, and it is queued for S-04 in `follow-ups/review-fixes.md` ("replace the literals in `tests/http/`"). It is not raised again here.
- Interaction with Phase 1: Phase 2 only appends to `route-guard.test.ts` and reuses `client.ts` and `route-inventory.ts` without changing them. No Phase 1 assumption is broken.

## Findings

### F1 — `//dashboard` probe replaced by `//campaigns/<uuid>`; plan contract not amended

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/http/route-guard.test.ts:47-53 (plan.md:185)
- **Detail**: The plan's path-variant contract lists `//dashboard`. The implementation probes `//campaigns/<zero-uuid>` instead, because `//dashboard` is read as a protocol-relative URL (host `dashboard`, path `/`). That request serves the public index page with a 200, so it never reaches the guard and isn't a bypass. The deviation is justified and well documented: there's an in-code comment, a note in the commit message, and a `lessons.md` rule ("Probe double-slash path variants with a deeper path"). However, plan.md:185 still names `//dashboard`, so the plan no longer matches the code it is the contract for.
- **Fix**: Amend plan.md:185 to read `//campaigns/<zero-uuid>` with a short addendum: "(`//dashboard` replaced: parses as protocol-relative, serves `/`; see lessons.md)".
- **Decision**: FIXED — plan.md:185 contract now names `//campaigns/<zero-uuid>`, with an addendum explaining the `//dashboard` replacement

### F2 — Denied-response assertions duplicated across the two HTTP test files

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/session-revocation.test.ts:73-96, tests/http/route-guard.test.ts:38-44,66-80
- **Detail**: The "page denied" check (302 plus location `/auth/signin`) and the "API denied" check (401, JSON content-type, non-empty `error` string, which takes 5 lines with a cast) are copied verbatim between the anonymous matrix and the replay matrix. The page check also appears in the path-variant block. If the oracle changes (for example, S-04 adds `HTTP_STATUS.FOUND`, or the redirect gains a `?next=` param), every copy must be edited in sync. A missed copy weakens one matrix without anyone noticing.
- **Fix**: Extract `expectSigninRedirect(res)` and `expectApiUnauthorized(res)` into `tests/http/support/assertions.ts` and call them from both files.
- **Decision**: FIXED — `expectSigninRedirect` / `expectApiUnauthorized` extracted to `tests/http/support/assertions.ts` and used in both files; lint clean, astro check 0 errors, test:http 64/64 green
