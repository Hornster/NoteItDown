---
date: 2026-10-10T20:08:48+02:00
researcher: Claude (Opus 5.5) for Hornster
git_commit: 0568bdf
branch: main
repository: NoteItDown
topic: "Auth fortification: protected-route registration/matching, API vs page guard handling, existing safety mechanisms and their test coverage"
tags: [research, auth, middleware, route-guard, api, smoke, e2e, test-plan-phase-3]
status: complete
last_updated: 2026-10-10
last_updated_by: Claude (Opus 5.5) for Hornster
---

# Research: Auth fortification — route guard, API vs page handling, safety mechanisms and coverage

**Date**: 2026-10-10T20:08:48+02:00
**Researcher**: Claude (Opus 5.5) for Hornster
**Git Commit**: 0568bdf (working tree: only `context/changes/auth-risk-tests/` untracked)
**Branch**: main
**Repository**: NoteItDown

## Research Question

We will be fortifying authentication. Verify how protected routes are registered and matched, API vs page handling in the guard. Check what the currently present safety mechanisms cover and their test coverage, seek places for improvement. Reference: `context/foundation/test-plan.md` (Risk #2, Risk #4, Phase 3 "Auth & route guard" → roadmap S-01).

## Summary

- **There are two independent guard mechanisms, split by URL family.**
  - **Pages:** the middleware guards a hard-coded list of 4 prefixes with `startsWith` and redirects anonymous users with a 302 to `/auth/signin` (`src/middleware.ts:4,18-22`).
  - **API routes:** `/api/*` is deliberately not in that list. Each of the 10 non-auth API handlers (in 7 files) checks `context.locals.user` itself and returns a JSON 401 before any DB or storage access.
  - Neither mechanism has any automated test except through a live server.
- **Pages rely on the middleware alone.**
  - In-page checks: none of the 7 `.astro` pages or 5 `.ts` redirect endpoints under `/campaigns`, `/notes`, `/map` and `/dashboard` checks `locals.user`. They rely on the middleware and on RLS: a null campaign or note gives a 404.
  - Unregistered pages: a new page outside the 4 prefixes is public by default, and nothing detects that.
- **Path normalization is safe in the installed Astro (7.3.2).**
  - `context.url.pathname` is decoded up to 10 levels deep and duplicate slashes are collapsed before middleware runs.
  - Route regexes are case-sensitive.
  - So encoded paths (`/%63ampaigns`), double slashes and case variants (`/Campaigns`) cannot reach a protected page without passing the prefix check.
  - The prefix match over-matches, e.g. `/mapping`. That is harmless today because no such routes exist.
- **Test coverage of Risk #2 (anonymous / signed-out access) is hand-picked rather than enumerated.** The test plan names that as the anti-pattern (`test-plan.md:56`).
  - Smoke probes 4 anonymous page requests (`/dashboard` twice, `/map`, `/campaigns/<zero-uuid>`) and 1 anonymous API handler, DELETE note, out of the 10 non-auth API handlers.
  - Integration and unit tests never make HTTP requests to the app.
  - E2E has 1 scenario, sign-in.
- **Smoke has two non-discriminating assertions.**
  - The sign-out step accepts any 302 (`location.startsWith("/")`).
  - "signin accepts correct password" probably rides on cookies set by the preceding signup, because email confirmations are off locally. This is inferred, not executed.
  - No test replays a pre-signout cookie to prove the session is invalidated server-side.
- **The improvement candidates below are ranked by Risk #2/#4 impact.**
  1. An enumerated, HTTP-level anonymous and post-signout matrix over every page and API handler, with the route list derived from `src/pages` so new routes cannot be missed.
  2. A drift guard that fails when a non-public page route is not covered by `PROTECTED_ROUTES`.
  3. Fix the smoke seams.
  4. E2E for the sign-out chain.
  5. Harden signin/signup input handling and error-message mapping. That is a code change, which must come after the S-01 tests pin current behaviour (PRD FR-010).

## Detailed Findings

### 1. Registration and matching (middleware)

- `PROTECTED_ROUTES = ["/dashboard", "/notes", "/map", "/campaigns"]` is a hard-coded list (`src/middleware.ts:4`).
  - Prefixes were added one change at a time: `/campaigns` in `context/archive/2026-09-28-multi-campaign-support/plan.md:193`, `/map` in `context/archive/2026-09-26-auto-relations-memory-map/plan.md:289`.
  - There is no registry or test that ties the list to `src/pages`.
- Resolving the user (`src/middleware.ts:7-16`):
  - The middleware calls `createClient(...)` and then `supabase.auth.getUser()`, which validates the session with the server instead of decoding the JWT locally. It sets `locals.user = user ?? null`.
  - When the client is `null` (env missing, `src/lib/supabase.ts:5-7`), `locals.user = null`, so pages redirect and APIs return 401. Missing env therefore does not grant access.
  - Not verified: whether `getUser()` can throw on a network failure. If it does, every request returns 500, which denies access rather than leaking it.
- Matching: `PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))` (`src/middleware.ts:18`). It is a raw prefix match with no segment boundary.
  - Over-match: `/notesX`, `/mapping` and `/campaigns-foo` would also be guarded. None exist today; it would only matter if a future public route shares a prefix.
  - Under-match: any page outside the 4 prefixes is public. Of the 17 non-API route files, 12 sit under the protected prefixes and the 5 public ones are `/`, `/licenses` and `/auth/{signin,signup,confirm-email}`. All are intended to be public.
- Normalization before the match, in installed `astro@7.3.2`:
  - `FetchState` builds `this.url` from the request and sets its pathname to `#normalizePathname(...)`: `validateAndDecodePathname` (repeated `decodeURI`, max 10 iterations) followed by `collapseDuplicateSlashes` (`node_modules/astro/dist/core/fetch/fetch-state.js:212-216,772-783`, `core/util/pathname.js:7-27`).
  - Route regexes have no `i` flag (`node_modules/astro/dist/core/routing/pattern.js:22`), so `/Campaigns/x` does not match a route and gives a 404.
  - Verdict: on the inspected code path, encoded, double-slash and case-variant requests do not bypass the guard.
  - Caveat: this is framework behaviour, not app behaviour. An Astro upgrade could change it, and no app test pins it.
- The redirect is always to the fixed `/auth/signin` with no `next` or `redirectTo` parameter (`src/middleware.ts:20`). There is no open-redirect surface; none of the redirect targets under `src/pages` contains such a parameter.
- Signed-in users visiting `/auth/signin` or `/auth/signup` are not redirected away. Those pages only read `?error=` (`src/pages/auth/signin.astro:5`). This is cosmetic, not a security issue.

### 2. Page-side handling (no in-page guard)

| Route file | Kind | Own auth check | Anonymous outcome (via middleware) | Signed-in, foreign/unknown ID |
|---|---|---|---|---|
| `src/pages/dashboard.ts`, `map.ts`, `notes/new.ts`, `campaigns/index.ts` | GET → 302 to landing campaign | none | 302 `/auth/signin` | 404 text if no campaign (`dashboard.ts:18-20`) |
| `src/pages/notes/[id].ts` | GET → 302 to canonical note URL | none | 302 `/auth/signin` | 404 (RLS null, `notes/[id].ts:15-19`) |
| `src/pages/campaigns/new.astro` | page, no data read | none | 302 `/auth/signin` | n/a |
| `src/pages/campaigns/[campaignId]/{index,edit,map}.astro`, `notes/new.astro`, `notes/[noteId].astro`, `notes/[noteId]/edit.astro` | page | none | 302 `/auth/signin` | `Astro.response.status = 404` when `getCampaign`/`getNote` returns null (e.g. `index.astro:17-21`, `notes/[noteId].astro:23-40`) |

- The pages therefore have defence in depth only through RLS. The `campaignId && supabase ? ... : null` pattern gives a 404 with no data.
- If the middleware entry were removed, `campaigns/new.astro` would render its form to anonymous users. Its API (`POST /api/campaigns`) would still return 401.

### 3. API-side handling (self-guard per handler)

- There is no shared auth helper.
  - The 3 image route files (`images.ts`, `images/uploads.ts`, `images/[imageId].ts`) use `HTTP_STATUS` and `MESSAGES`. In `images/[imageId].ts` the check is wrapped in a local `guard()` (`images/[imageId].ts:21-27`).
  - The 4 older files use literals (`jsonError({ error: "You must be signed in." }, 401)`, e.g. `src/pages/api/campaigns/index.ts:13-15`).
  - Both styles produce the same body: `MESSAGES.SIGNED_IN_REQUIRED = "You must be signed in."` (`src/lib/constants/messages.ts:5`).
- The 10 non-auth handlers and their check locations:
  - POST `/api/campaigns` (`campaigns/index.ts:13`)
  - PATCH `/api/campaigns/[id]` (`[campaignId]/index.ts:14`)
  - POST `.../notes` (`notes.ts:14`)
  - PATCH and DELETE `.../notes/[noteId]` (`[noteId].ts:21,78`)
  - POST `.../images` (`images.ts:14`)
  - POST `.../images/uploads` (`uploads.ts:14`)
  - GET, PATCH and DELETE `.../images/[imageId]` (`[imageId].ts:52,69,98`)
  - Each check runs before `createClient` and before any DB or storage call.
- Guard order in the contract: 401 → 500 (no Supabase) → 404 (`isUuid`) → 400 (`docs/reference/contract-surfaces.md:129,135,144`).
- Data access: every handler uses the cookie-scoped anon-key client, so RLS is the data gate. A grep for `service_role|SERVICE_ROLE|admin` over `src`, `astro.config.mjs` and `.env.example` found no matches.
- Auth endpoints (`src/pages/api/auth/{signin,signup,signout}.ts`) are public POST-only handlers.
  - **signin/signup** cast `form.get(...) as string` with no zod validation (`signin.ts:5-7`, `signup.ts:5-7`). This deviates from the "validate input with zod" convention in CLAUDE.md.
  - They call `formData()` before the null-client check, so a non-form body throws and gives a 500.
  - On error they redirect with the raw Supabase `error.message` in `?error=` (`signin.ts:16`, `signup.ts:16`). There is no message mapping, and depending on GoTrue settings this can reveal whether an email is registered.
  - **signout** calls `supabase.auth.signOut()` when a client exists and always returns 302 `/` (`signout.ts:4-9`). It does not require a session. The only caller is `<form method="POST">` in `src/components/Topbar.astro:49`.
- CSRF:
  - There is no `security` block in `astro.config.mjs`, so Astro's default `checkOrigin: true` applies (`node_modules/astro/dist/core/config/schemas/defaults.js:44`). It rejects cross-origin non-GET requests with form-like content types, which covers the 3 auth form POSTs.
  - JSON handlers rely on `sameSite: "lax"` cookies (`src/lib/supabase.ts:9-11`, decided in `context/archive/2026-09-23-create-notes/reviews/impl-review.md:52-60`) and on the absence of CORS headers.
  - `request.json()` is called without a Content-Type check. `HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE` exists but is unused.
  - Assessed residual risk: low. This rests on the API worker's reading of Astro's origin-check, not on a test.

### 4. Test coverage of the safety mechanisms

Legend: S = `scripts/smoke.mjs`, E = Playwright `tests/e2e/signin.spec.ts`, I = Vitest integration, U = Vitest unit.

| Scenario | S | E | I | U |
|---|---|---|---|---|
| Anon → `/dashboard`, `/map` | 302 prefix `/auth/signin` (`smoke.mjs:43-44`) | – | – | – |
| Anon → `/campaigns/<uuid>` (after signout) | `smoke.mjs:109-113` | – | – | – |
| Anon → `/campaigns`, `/campaigns/new`, `/notes/new`, `/notes/<id>`, `/campaigns/<id>/{map,edit,notes/new,notes/<id>,notes/<id>/edit}` | – | – | – | – |
| Anon API → 401 | 1 of 10 handlers: DELETE note (`smoke.mjs:114-118`) | – | – | – |
| Signin success | 302 prefix `/dashboard` (`:55-59`) | exact `/campaigns/<id>` + visible "Sign out" (`signin.spec.ts:17-18`) | – | – |
| Signin failure | 302 prefix `/auth/signin?error=`, text unchecked (`:50-54`) | – | – | – |
| Signup | 302 `/auth/confirm-email` (`:45-49`) | – (seeded via supabase-js) | – | – |
| Signout → access denied | yes, after jar drops cookie (`:107-118`) | button visible, never clicked | – | – |
| Replay of pre-signout cookie (server-side invalidation) | – | – | – | – |
| Expired / tampered cookie | – | – | – | – |
| Middleware, `createClient`, auth route handlers in isolation | – | – | – | – |

- Integration tests authenticate with `createTestUser()` (`tests/support/test-user.ts:14-58`). It calls supabase-js directly and covers RLS and services, never HTTP. A grep of `tests/` and `src/**/*.test.ts` for `401|signin|signout|getUser|middleware|locals|fetch(` matched only the Storage signed-URL fetches in `tests/integration/note-images.test.ts`.
- Weak points in smoke, verified in code:
  - The comparison is `actual.location.startsWith(expected.location)` (`smoke.mjs:126`). The signout step expects `"/"` (`:107`), which every location starts with, so any 302 passes.
  - `signUp` with `enable_confirmations = false` (`supabase/config.toml:209`) likely returns a session whose cookies smoke stores (`:35`). The next "signin accepts correct password" step (`:55-59`) then asserts only a 302 and cannot show that sign-in itself set a session. This is inferred and was not executed.
  - The post-signout redirects (`:108-118`) prove that the client jar dropped the cookie (`:17-18`), not that the server revoked the session. No step replays the old cookie.
  - Smoke always sends `Origin: BASE_URL` (`:29`), so it never exercises `checkOrigin` or CSRF rejection.
- CI (`.github/workflows/ci.yml`):
  - `local-stack` runs `test:integration`, then `build`, then `test:e2e`, then smoke on a preview at port 4321.
  - Every step is fatal. An e2e failure skips smoke.
  - Integration runs before any built server exists, so an HTTP-level matrix needs either a new step after `build`, or its own globalSetup that starts a preview. Port 4322 belongs to Playwright and 4321 to smoke.
  - The local GoTrue auth budget (30 sign-in/sign-up per 5 min per IP, `supabase/config.toml:190`) is shared by integration, e2e and smoke.

### 5. Improvement candidates (for /10x-plan; not decisions)

Ranked by Risk #2 and Risk #4 impact. Per FR-010 and roadmap S-01, tests come first and code changes come after the tests pin current behaviour.

1. **Enumerated anonymous matrix (Risk #2, highest value).**
   - Coverage: every page route gives 302 `/auth/signin`, and every API handler gives 401 `{"error":"You must be signed in."}`, both anonymous and after signout.
   - Derive the list from the `src/pages` file tree plus exported method names, not from a hand-written list, so a new route without a guard fails CI.
   - Layer: HTTP `fetch` against the preview, needing a server. Options: (a) a new Vitest project or step after `build` in `local-stack`; (b) extend smoke. Option (a) matches the cookbook direction (`test-plan.md:142-144` is TBD for Phase 3).
2. **Registry drift guard.**
   - A cheap unit test asserting that every non-public page route (all except `/`, `/licenses`, `/auth/*`) starts with an entry of `PROTECTED_ROUTES`.
   - Optionally tighten matching to a segment boundary (`pathname === p || pathname.startsWith(p + "/")`). That is a code change; schedule it after the tests.
3. **Server-side session invalidation.** Capture cookies before signout, sign out, replay the old cookies, and expect a 302 or 401. This closes the gap between "jar dropped the cookie" and "session revoked".
4. **Fix the smoke seams.** Use an exact location for signout (`location === "/"`), and clear the jar after signup so signin has to set the session itself. Alternatively, retire those steps once item 1 covers them; this is the roadmap S-01 open unknown, owned by the user.
5. **E2E session chain (Risk #4).** One scenario: sign in, then click "Sign out", then see the redirect, then visit a protected page and be redirected to `/auth/signin`. Use the existing `createTestUser` seed so it spends 1 user from the budget.
6. **Pin auth API status codes and messages (Risk #4).**
   - Cases: wrong password, duplicate signup, malformed body (currently 500), missing Supabase.
   - Take expected messages from the PRD or UI baseline, not from the code (the oracle problem, `test-plan.md:58`).
   - Hardening for later, after S-01 lands: zod on signin/signup, mapping Supabase errors to `MESSAGES` (lesson "central dictionaries"), and moving the 4 literal-401 files to the dictionaries (that belongs to S-04).
7. **Lower priority, or accept as risk:**
   - A Content-Type check on JSON handlers.
   - Redirecting signed-in users away from the auth pages.
   - A shared `requireUser()` helper to replace the per-handler copies.

## Code References

- `src/middleware.ts:4` — `PROTECTED_ROUTES` list
- `src/middleware.ts:7-16` — user resolution via `getUser()`; null on missing client
- `src/middleware.ts:18-22` — `startsWith` prefix match → `redirect("/auth/signin")`
- `src/lib/supabase.ts:5-23` — null client on missing env; `sameSite: "lax"`, `secure: PROD`
- `src/pages/api/campaigns/index.ts:13-15` — representative literal 401 self-guard
- `src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/[imageId].ts:21-27` — `guard()` with dictionaries
- `src/pages/api/auth/signin.ts:5-19`, `signup.ts:5-19` — no zod; raw `error.message` in redirect
- `src/pages/api/auth/signout.ts:4-9` — POST-only signOut → 302 `/`
- `src/components/Topbar.astro:49` — signout form
- `src/lib/constants/messages.ts:5` — `SIGNED_IN_REQUIRED`
- `node_modules/astro/dist/core/fetch/fetch-state.js:212-216,772-783` — pathname decode + slash collapse before middleware
- `node_modules/astro/dist/core/routing/pattern.js:22` — case-sensitive route regex
- `node_modules/astro/dist/core/config/schemas/defaults.js:44` — `checkOrigin: true` default
- `scripts/smoke.mjs:43-44,107-118,126` — anon/signout probes; `startsWith` assertion
- `tests/e2e/signin.spec.ts:17-18` — only e2e auth scenario
- `tests/support/test-user.ts:14-58` — seed helper (supabase-js signUp)
- `supabase/config.toml:190,209` — auth rate limit; confirmations off
- `.github/workflows/ci.yml` (`local-stack` job) — integration → build → e2e → smoke

## Architecture Insights

- The split between pages (redirect) and APIs (self-guarded 401) is a deliberate, recorded decision rather than an oversight (`context/archive/2026-09-23-create-notes/plan.md:285`: "`/api/notes` is not added: it returns its own 401 JSON"). Fortification should keep it, and test both halves.
- Authorization (ownership) is delegated entirely to RLS through the anon-key cookie client. The route layer only answers "is there a user?". This is why Risk #1 and Risk #3 (Phase 2) are separate from this guard research.
- The guard has a single point of truth for pages (the middleware) and 10 per-handler copies for APIs. Both are vulnerable to drift: a new page outside the prefixes, or a new handler that forgets the check. Only an enumerated test detects either.

## Historical Context (from prior changes)

- `context/archive/2026-09-23-create-notes/plan.md:285` — APIs return their own 401 instead of joining `PROTECTED_ROUTES`. Supported by the current code.
- `context/archive/2026-09-23-create-notes/reviews/impl-review.md:52-60` — CSRF relies on SameSite=Lax, made explicit in `cookieOptions`. Supported (`src/lib/supabase.ts:9-11`).
- `context/archive/2026-09-28-multi-campaign-support/plan.md:193` and `context/archive/2026-09-26-auto-relations-memory-map/plan.md:289` — added `/campaigns` and `/map` prefixes. Supported.
- `context/archive/2026-09-23-create-notes/plan.md:48` — smoke stays auth-only. Supported.
- The e2e-framework-spike research says smoke "already covers anon redirects, signup, signin, signout and anon API 401". The claim is partial: each scenario is touched, but anon redirects cover 3 of 12 protected page routes, anon API covers 1 of 10 handlers, and signout is checked with a non-discriminating location.
- `docs/reference/contract-surfaces.md:129-144` — API guard order 401 → 500 → 404 → 400. It matches the inspected handlers.
- `context/foundation/roadmap.md:94-104` (S-01) — tests must land before S-04 and S-05 edit auth routes. The smoke-overlap retirement question is open, owner: user.

## Related Research

- e2e-framework-spike research (sign-in seed, smoke overlap). That change is implemented and its folder is referenced from `test-plan.md:70`.
- Phase 2 (`notes-relations-risk-tests`, Risk #1 and #3): cross-user isolation and RLS matrix. Not started; out of scope here.

## Open Questions

1. **Smoke retirement (user decision, roadmap S-01 unknown):** once an enumerated HTTP matrix exists, should smoke's auth steps be trimmed, or only fixed (item 4)?
2. **Placement of the HTTP matrix:** a new Vitest project or CI step after `build`, or an extended smoke? This depends on the planner's choice of server lifecycle and port.
3. **Signup/signin error wording:** what is the PRD or UI baseline for messages? Pinning raw Supabase text would bake in the oracle problem.
4. **Not verified at runtime:**
   - Whether `getUser()` can throw.
   - Whether smoke's signin step is really non-discriminating.
   - Whether GoTrue's signin error text distinguishes an unknown email from a wrong password with the current local config.
