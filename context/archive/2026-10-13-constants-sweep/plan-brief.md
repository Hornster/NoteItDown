# Constants Sweep (S-04) — Plan Brief

> Full plan: `context/changes/constants-sweep/plan.md`
> Research: `context/changes/constants-sweep/research.md`

## What & Why

Apply the constants rule to all of `src/`, not only the image code converted in `5bf36f1`. HTTP statuses, Postgres SQLSTATEs, error and validation messages, and repeated UI strings all move into `src/lib/constants/`. The four auth defects S-01 logged for this slice get fixed. The rule is locked in with types, lint and a lesson, so renames and wording changes stop drifting. This lands before the S-05 theme revamp, so refactor and theming diffs don't mix.

## Starting Point

The dictionaries exist. The older M-1 code still holds:

- 61 numeric status literals in 17 files
- 12 SQLSTATE literals in 2 services
- about 25 inline copies of existing `MESSAGES` keys
- about 30 duplicated message and label groups

The auth routes pass raw Supabase text through `?error=`, crash on non-form bodies and miss `prerender = false`. The middleware prefix-matches `/map` against `/mapping`.

## Desired End State

No status or SQLSTATE literal remains in `src/` code, and ESLint plus a narrowed `jsonError(…, HttpStatus)` keep it that way. Every message, and every UI string used 2+ times, comes from `MESSAGES`. Output is byte-identical except two accepted one-character fixes. The auth routes validate input, map Supabase error codes to dictionary text, and make a duplicate signup indistinguishable from success. Protected routes match the exact path or path + `/`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where "duplicated" stops | All messages always; any other UI string used 2+ times in `src/`; single-use strings, `ui/` and starter copy stay inline | Resolves the roadmap unknown with a checkable rule that S-05 can rely on | Plan |
| Inherited auth defects | Fix all four (malformed body, raw message, prefix over-match, literal 401s) plus `prerender` | The roadmap assigned them to S-04, and the files are touched anyway | Plan |
| Duplicate-email signup | Redirect to `/auth/confirm-email`, like success | A true enumeration fix; signin's `Invalid login credentials` stays byte-identical | Plan |
| Visible wording exceptions | Only the auth "Supabase is not configured" period and the `...`→`…` fix | Two one-character consistency fixes that no test pins; campaign create, rename and save stay distinct | Plan |
| Test-side scope | `HTTP_STATUS.FOUND` for 302s, `PG_ERROR` in 3 integration files, `global-setup` 200; e2e oracles and smoke stay literal | One rule across the repo, while oracles stay independent of the code under test | Research + Plan |
| Deferred items | Image-path 500s go to a follow-up change; Polish and starter copy go to S-05 | Keeps S-04 a constants slice; S-05 reworks Layout | Plan |
| Regression guard | `HttpStatus` type on `jsonError` + ESLint `no-restricted-syntax` + a lesson for all code | The per-edit lint hook catches a reintroduced literal immediately | Plan |
| Dictionary shape | One `MESSAGES` object, literal keys plus small helpers, section comments | Matches the existing style; no import churn | Plan |

## Scope

**In scope:**
- **Server:** the 4 API routes, 5 redirect endpoints, 2 services and 2 zod schemas.
- **UI:** 11 `.astro` pages and Topbar, 3 hooks, 4 forms, `RelationChangeNotice`, `DeleteNoteButton`, and the licences page.
- **Auth:** new `schemas/auth.ts`, `lib/auth-errors.ts`, `lib/protected-routes.ts` (each with unit tests), new `tests/http/auth-routes.test.ts`, a `/mapping` probe, and the rewritten e2e duplicate-signup test.
- **Tests:** the literals in `tests/http` and `tests/integration`.
- **Guard and docs:** the ESLint rule, the lesson, `contract-surfaces.md`, the README `PROTECTED_ROUTES` note, and the deferred-defects follow-up note.

**Out of scope:**
- the image uppercase-UUID and replayed-commit 500s
- Polish and starter copy, and `Welcome.astro` casing
- single-use labels and placeholders
- `src/components/ui/`
- `scripts/smoke.mjs`
- `?error=` spoofing
- explicit redirect statuses
- splitting `messages.ts`
- sharing the service `reason` unions

## Architecture / Approach

Phases 1–2 are pure moves. The oracle is the existing suite, which runs unedited: integration, `tests/http` and both e2e specs. Phase 3 is the only phase that changes behavior on purpose. It adds pure, unit-tested helpers (auth schema, error-code mapping, path matcher), wires them into the auth routes and the middleware, and proves the routes over HTTP. The one e2e test that encoded the enumeration defect is rewritten. Phase 4 moves the test literals, then enables the lint rule once `src/` is already clean.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dictionaries + server sweep | `FOUND`, `HttpStatus`, narrowed `jsonError`, server and validation keys; routes, endpoints, services and schemas converted | A moved message differs by one character; nothing pins API texts |
| 2. UI sweep | Pages, hooks, forms, notice and dialog on keys; ellipsis fix | Breaking a byte-identical accessible name or the notice DOM shape (e2e catches it) |
| 3. Auth defects + matcher | zod-validated auth routes, code→message mapping, duplicate signup = success, exact-or-slash matcher, new tests | GoTrue codes are inferred from the SDK, not observed live; the fallback key covers unknowns |
| 4. Test literals, guard, docs | `FOUND`/`PG_ERROR` in tests, ESLint rule, lesson, contract-surfaces | A selector false positive on a future non-HTTP `status` number |

**Prerequisites:** S-01 and S-02 done (yes). Local Supabase (Docker) for the integration, http and e2e suites; a fresh `npm run build` before the http and e2e runs.
**Estimated effort:** about 3–4 sessions across 4 phases; phases 1–2 are wide but mechanical.

## Open Risks & Assumptions

- The local GoTrue codes (`user_already_exists`, `invalid_credentials`, …) come from SDK source, not a live call. If wrong-password returns a different code, the e2e baseline will show it.
- The duplicate-signup redirect gives an existing user no on-page hint. This was accepted as the enumeration tradeoff.
- The lint rule covers statuses only. Messages and SQLSTATEs rely on the lesson and on review.

## Success Criteria (Summary)

- A developer grepping `src/` finds no status, SQLSTATE or duplicated message literals, and lint rejects a new status literal.
- Users see the same app, apart from two ellipsis labels and one period, and the relation notice and signin error are unchanged.
- Auth routes never 500 on bad input, never leak raw Supabase text, and don't reveal whether an email is registered.
