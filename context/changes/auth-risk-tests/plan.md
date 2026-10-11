# Auth Risk Tests Implementation Plan

## Overview

Roadmap slice S-01 / test-plan §3 Phase 3 ("Auth & route guard", Risks #2 and #4). We add a named, CI-run test for every auth risk scenario — protected-route redirect, API 401, signed-out access, signup, signin, signout and session revocation — **before** S-04/S-05 edit any auth page or route (prd-v2 FR-010, Constraints). This change is tests-only: no `src/` edits.

## Current State Analysis

- Pages are guarded by one middleware prefix list; API handlers each self-guard with a JSON 401 (deliberate split, `context/archive/2026-09-23-create-notes/plan.md:285`). Neither half has an automated test outside `scripts/smoke.mjs`.
- Smoke hand-picks 3 of 12 protected page routes and 1 of 10 non-auth API handlers (research §4) — exactly the anti-pattern named in `context/foundation/test-plan.md:56`.
- Smoke's signout step accepts any 302 (`scripts/smoke.mjs:107,126`); its "signin accepts correct password" step likely rides on signup cookies (`supabase/config.toml:209`, confirmations off); no test replays a pre-signout cookie, so server-side revocation is unproven.
- E2E has one scenario (`tests/e2e/signin.spec.ts`); it never clicks "Sign out".
- Integration tests never make HTTP calls to the app; they run before any build exists in CI (`.github/workflows/ci.yml`, `local-stack`).
- Signin/signup redirect with the raw Supabase `error.message` (`src/pages/api/auth/signin.ts:16`, `signup.ts:16`); the PRD defines no wording, so message tests need a human-approved oracle (`test-plan.md:58`).

## Desired End State

- `npm run test:http` builds nothing itself, starts its own production preview on port 4323, and proves against it:
  - every non-public page route (enumerated from `src/pages`) answers anonymous requests with 302 to `/auth/signin`;
  - every non-auth API method (enumerated from exported handlers) answers anonymous requests with 401 JSON `{ error }`;
  - cookies obtained through the app's own signin work (positive control), and the same cookies replayed after `POST /api/auth/signout` are denied on every route;
  - encoded / double-slash / case-variant paths never reach a protected page.
- A new route added under `src/pages` is covered automatically; a new non-public route that the guard misses fails CI.
- E2E proves the full UI chain signup → confirm-email → signin → campaign → Sign out → redirect, and pins the user-approved visible wording for wrong-password and duplicate-signup errors.
- Smoke no longer has false-green signout/signin steps.
- `context/foundation/test-plan.md` §3 Phase 3 is `implemented` and §6.4 tells the next contributor how to cover a new route.

Verify: `npm run build && npm run test:http && npm run test:e2e && npm run smoke` (preview on 4321) locally against `npx supabase start`, and a green `local-stack` CI run.

### Key Discoveries:

- `src/middleware.ts:4,18-21` — `PROTECTED_ROUTES` prefix list, raw `startsWith`, fixed redirect `/auth/signin`.
- `docs/reference/contract-surfaces.md:129,135,144,155-156` — every API guard order starts with "401 `ApiError` if unauthenticated" — the oracle for the API half of the matrix (status + `{ error }` shape, not wording).
- `playwright.config.ts` — preview is started with `npm run preview -- --port 4322 --ignore-lock` and `ASTRO_PREVIEW_BACKGROUND=1`; the same invocation pattern works for a second preview on 4323.
- `scripts/smoke.mjs:9-21,29` — working cookie-jar logic for chunked `sb-*` cookies, and the `Origin: BASE_URL` header POSTs need to pass Astro's default `checkOrigin`.
- `tests/support/supabase-preflight.ts` / `tests/support/test-user.ts` — reusable fail-loud preflight and user seed (returns `email`, `password`, `campaignId`).
- `vitest.config.ts` — projects `unit`, `integration`, `hooks`; `npm test` = `vitest run` (all projects).
- `supabase/config.toml:190` — 30 sign-in/sign-up per 5 min per IP, shared by integration, http, e2e and smoke in one CI job.

## What We're NOT Doing

- **No `src/` changes.** Known defects are logged as S-04 follow-ups, not pinned and not fixed:
  - malformed (non-form) body to `/api/auth/signin|signup` → 500 (`formData()` before validation, no zod);
  - prefix match over-matches (`/mapping`, `/notesX`) — harmless today, no such routes;
  - raw Supabase `error.message` in `?error=` (no `MESSAGES` mapping; possible account enumeration);
  - 4 API files use literal 401s instead of `HTTP_STATUS`/`MESSAGES` (S-04 constants sweep).
- No test pins a 500 or any other known-bad behaviour as "expected". One labelled exception: Phase 3's `UI_BASELINE.signupDuplicateEmail` pins the current (enumerable) duplicate-signup wording as a user-approved characterization, so S-04 must change it on purpose.
- No separate unit-level `PROTECTED_ROUTES` drift test — the file-tree-derived matrix already fails when a non-public route escapes the guard.
- No retirement of smoke steps (user decision: fix seams, keep all steps).
- No asserting API 401 wording (`"You must be signed in."` is code, not an approved baseline); only status and `{ error: string }` shape.
- No CSRF / `checkOrigin` rejection tests, no Content-Type checks, no expired/tampered-JWT crafting, no redirect-signed-in-users-away-from-auth-pages (research §5.7 — accepted as low risk).
- No cross-user isolation (Risk #1/#3 belong to S-02).

## Implementation Approach

Cheapest real signal per risk (test-plan §1): raw HTTP for the guard matrix (no browser), one browser chain for the session flow, and browser assertions only where the oracle is visible UI text. The HTTP suite runs as its own Vitest project with its own preview server so it never depends on Playwright's server or smoke's port; it runs in CI right after `build`. Route lists are derived from the filesystem at test time, with a small explicit public allowlist, so coverage grows with the app instead of with someone's memory.

## Critical Implementation Details

- **Origin header on POSTs.** Astro's default `checkOrigin` rejects form-content-type POSTs without a matching `Origin`; every HTTP-suite request that POSTs (signin, signout) must send `Origin: <base URL>`, as smoke does (`scripts/smoke.mjs:29`). Send it on all requests for uniformity.
- **Revocation result is a finding, not a tunable.** If replayed pre-signout cookies are *not* denied, that is a real Risk #2 failure: stop and report to the user; do not weaken the assertion or mark it expected-fail.
- **Auth rate budget.** Before wiring the CI step, count sign-in/sign-up calls across integration + http (2) + e2e (existing 2 + new 5) + smoke (3) and confirm the total stays under 30; if it doesn't, report rather than adding retries.
- **Stale preview servers.** Per `lessons.md` ("Check for a running dev server before testing"), check ports 4321–4323 before local runs and ask the user before stopping anything.

## Phase 1: HTTP test project and anonymous route matrix

### Overview

A new `http` Vitest project with its own server lifecycle, a route inventory derived from `src/pages`, and the anonymous matrix over every enumerated page and API method.

### Changes Required:

#### 1. Vitest project and scripts

**File**: `vitest.config.ts`, `package.json`

**Intent**: Register the `http` project and give it its own script; keep `npm test` meaning "unit + hooks + integration" because `http` needs a built app.

**Contract**:
- New project `{ name: "http", include: ["tests/http/**/*.test.ts"], globalSetup: ["tests/http/global-setup.ts"], fileParallelism: false }`.
- Script `"test:http": "vitest run --project http"`.
- Script `"test"` becomes `vitest run --project unit --project hooks --project integration` (same suites as today).

#### 2. Server lifecycle

**File**: `tests/http/global-setup.ts`, `tests/http/server.ts`

**Intent**: Fail loudly on missing prerequisites, then own a production preview on port 4323 for the run and tear it down afterwards.

**Contract**:
- `server.ts` exports `HTTP_BASE_URL = "http://localhost:4323"` (single source for tests).
- Setup order: `assertLocalSupabase("http")` → `dist/` exists else throw "run `npm run build` first" → `dist/` must not be older than the newest file under `src/` (mtime), else throw "dist/ is older than src/ — run `npm run build`" (the inventory reads `src/`, the server serves `dist/`) → port 4323 must be free (a successful fetch means a stale server: throw naming the port) → spawn `npm run preview -- --port 4323 --ignore-lock` with `ASTRO_PREVIEW_BACKGROUND=1`, detached in its own process group → poll `GET /` until 200 (60 s max, else throw with the captured server output); if the child exits before that, fail immediately with its captured output → return a teardown that kills the process group.
- Any failure after the spawn kills the process group before throwing (Vitest never receives a teardown from a failed setup, so an orphan would hold 4323 and trip the stale-server check on the next run).
- No skip paths.

#### 3. Request + cookie helpers

**File**: `tests/http/support/client.ts`

**Intent**: One `fetch` wrapper for the suite: `redirect: "manual"`, `Origin` header, optional form/JSON body, and a cookie jar handling `Set-Cookie` / `max-age=0` like smoke does.

**Contract**: `createJar()` returns `{ header(): string; store(res: Response): void; clone(): Jar }`; `send(path, { method?, jar?, form?, json? })` returns `{ status, location, contentType, body }` where `location` is normalized to path+search (relative or absolute `Location` both compare equal). The request URL is the string `HTTP_BASE_URL + path`, with no `new URL(path, base)` and no normalization or encoding of `path`, so Phase 2 path variants (`//dashboard`, `/%63ampaigns/...`) reach the server as written.

#### 4. Route inventory

**File**: `tests/http/support/route-inventory.ts`

**Intent**: Derive the guard's test surface from the filesystem so new routes are covered without editing a list.

**Contract**:
- Walks `src/pages` recursively, skipping files and folders whose name starts with `_` (Astro does not route them). `.astro` → `{ kind: "page", method: "GET" }`; `.ts` outside `src/pages/api` → page route with methods from its exports; `.ts` under `src/pages/api` → one `{ kind: "api", method }` per exported `GET|POST|PUT|PATCH|DELETE|ALL` (`ALL` is probed as `GET`).
- Path mapping: strip extension, `index` → parent, `[param]` and `[...param]` → `00000000-0000-0000-0000-000000000000`.
- Exports detected with `/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|ALL)\b/g`.
- A route `.ts` file with zero detected methods (e.g. `export { GET }` re-export form) is reported by `unrecognizedRouteFiles()` so the suite fails naming it instead of silently dropping the route.
- `PUBLIC_ROUTES` allowlist: `/`, `/licenses`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/api/auth/signin`, `/api/auth/signup`, `/api/auth/signout`.
- Exports `protectedPages()`, `protectedApi()`, `publicRoutes()`, `unrecognizedRouteFiles()`.

#### 5. Anonymous matrix

**File**: `tests/http/route-guard.test.ts`

**Intent**: Prove Risk #2 for the anonymous case over the enumerated surface, with sanity checks that the enumeration itself is real.

**Contract**:
- Inventory sanity: ≥ 12 protected page routes, ≥ 10 protected API methods; every `PUBLIC_ROUTES` entry exists on disk (no stale allowlist); `unrecognizedRouteFiles()` is empty.
- Positive control: anonymous `GET /` and `GET /auth/signin` → 200 (server up, not denying everything).
- `it.each(protectedPages())` named by method + path: anonymous request → status 302 and location exactly `/auth/signin`.
- `it.each(protectedApi())`: anonymous request (JSON body `{}` for non-GET) → status 401, `content-type` contains `application/json`, body `error` is a non-empty string.

#### 6. CI step

**File**: `.github/workflows/ci.yml`

**Intent**: Run the suite on push in `local-stack`, directly after the build it needs.

**Contract**: New step `- run: npm run test:http` between `npm run build` and `npx playwright install ...`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- `npm test` still runs unit, hooks and integration only (http not included)
- `npm run test:http` passes locally after `npm run build` with local Supabase running
- `npm run test:http` without local Supabase fails with a Supabase-named error; without `dist/` it fails naming `npm run build`

#### Manual Verification:

- Temporarily add a throwaway page `src/pages/zz-probe.astro` (outside the prefixes): `npm run build && npm run test:http` fails naming `/zz-probe`; remove it and confirm green again
- Temporarily remove the `if (!context.locals.user)` check from one API handler, `npm run build && npm run test:http`: its matrix row fails; revert and rebuild
- CI `local-stack` run on the branch shows the `npm run test:http` step green

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Session revocation and path variants

### Overview

Prove that a signed-out session loses access server-side (not just client-side cookie removal), and pin the framework's path normalization in front of the guard.

### Changes Required:

#### 1. Revocation matrix

**File**: `tests/http/session-revocation.test.ts`

**Intent**: Close the gap "the jar dropped the cookie" vs "the server revoked the session" (research §4) using the app's own signin and signout endpoints.

**Contract**:
- `beforeAll`: `createTestUser()` (1 auth call), then `POST /api/auth/signin` form `{ email, password }` with an empty jar (1 auth call) → assert 302 location `/dashboard` and that the jar now holds at least one `sb-` cookie. Snapshot the jar (`preSignout = jar.clone()`).
- Positive control (signin really set a session): with `preSignout`, `GET /campaigns/<campaignId>` → 200; `PATCH /api/campaigns/not-a-uuid` JSON `{ name: "x" }` → not 401 (contract: 404).
- Signout: `POST /api/auth/signout` with the live jar → 302, location exactly `/`.
- `it.each(protectedPages())` and `it.each(protectedApi())` replayed with `preSignout`: same expectations as the anonymous matrix (302 `/auth/signin` / 401 JSON). Include `/campaigns/<campaignId>` (the seeded user's real campaign) explicitly.
- Each replay row sends with its own `preSignout.clone()` and first asserts that clone's `header()` contains `sb-`. A denied replay answers with `Set-Cookie` clearing `sb-*` (auth-js `_getUser` → `_removeSession()` on a missing session), so a shared jar would turn every row after the first into an anonymous request.

#### 2. Path-variant probes

**File**: `tests/http/route-guard.test.ts`

**Intent**: Prove, at the app level, that the normalization research verified in `astro@7.3.2` internals never lets a path variant through. An Astro upgrade that lets a variant reach a protected page (200) fails CI; a switch between 302 and 404 is allowed.

**Contract**: Anonymous `GET` on `/%63ampaigns/<zero-uuid>`, `//dashboard`, `/Campaigns/<zero-uuid>`, `/dashboard/` → each is "denied": 302 to `/auth/signin` or 404; never 200.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- `npm run test:http` passes (anonymous, revocation and path-variant cases)

#### Manual Verification:

- Temporarily make `src/pages/api/auth/signout.ts` skip `supabase.auth.signOut()` (still redirect to `/`): the revocation rows fail while the anonymous matrix stays green; revert
- Test output lists each replayed route by name (readable failure report)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: E2E auth session chain and approved messages

### Overview

One browser scenario for the full Risk #4 chain, plus two error-wording scenarios whose expected text is a user-approved UI baseline.

### Changes Required:

#### 1. Session chain scenario

**File**: `tests/e2e/auth-session.spec.ts`

**Intent**: Prove signup → confirm-email → signin → protected page → signout → redirect end to end through the real UI.

**Contract**:
- Unique email `e2e-${crypto.randomUUID()}@example.com`. Wait for island hydration (`astro-island:not([ssr])`, test-plan §6.3) before filling either form.
- Signup form (Email, Password, confirm-password field) → URL `/auth/confirm-email`.
- `context.clearCookies()` so the next signin must create the session itself (confirmations are off locally, signup already set cookies).
- Signin form → URL matches `/campaigns/<uuid>` and the "Sign out" button is visible (session-only outcome, §6.3). Record the campaign URL.
- Click "Sign out" → URL `/`. Then `goto("/dashboard")` → URL `/auth/signin`; `goto(<recorded campaign URL>)` → URL `/auth/signin`.
- Auth calls: 2.

#### 2. Approved error wording

**File**: `tests/e2e/auth-session.spec.ts`

**Intent**: Pin "messages unchanged" (Risk #4) with an oracle the user signed off on, not copied from code.

**Contract**:
- `test.describe` with `beforeAll` → `createTestUser()` (1 auth call).
- Wrong password on the signin form → URL starts with `/auth/signin?error=` and the visible server error equals `UI_BASELINE.signinInvalidCredentials` (1 auth call).
- Signup with the seeded user's email → URL starts with `/auth/signup?error=` and the visible server error equals `UI_BASELINE.signupDuplicateEmail` (1 auth call).
- `UI_BASELINE` is a constant in the spec with a comment: "UI baseline approved by the user on <date> (auth-risk-tests Progress 3.x); changing it is a deliberate wording decision (S-04). Deliberately literal — never import from `MESSAGES`; the oracle must not come from the code under test". The implementer obtains the values by running each flow once against the current build and presenting the observed on-screen text to the user for approval (expected today: GoTrue's "Invalid login credentials" and "User already registered", to be confirmed by observation). `signupDuplicateEmail` additionally carries the comment "characterizes known S-04 defect (account enumeration via raw Supabase message); expected to change in S-04", and the user is told this before approving it (3.4).
- "Visible server error" is located by text, not by class (S-05 restyles `ServerError`, a bare `<p>` with no role): `expect(page.getByText(UI_BASELINE.x, { exact: true })).toBeVisible()`.
- Observation → approval procedure (runs **before** 3.2): write the spec with `""` baselines, run `npm run test:e2e` once, read each "Received" value from the failure output, and reject text that is not the flow's own error (GoTrue rate-limit message, "Supabase is not configured"). Each run spends 5 auth calls of the 30 / 5 min budget, so wait out the window rather than rerunning quickly. Present the two texts to the user (3.3, 3.4), then fill in `UI_BASELINE` and run 3.2.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- `npm run build && npm run test:e2e` passes (existing sign-in scenario + new ones)

#### Manual Verification:

- User approves the observed wrong-password text as the UI baseline
- User approves the observed duplicate-signup text as the UI baseline, knowing it characterizes the S-04 enumeration defect
- Temporarily change the signin redirect target in the spec's expectation (or break signout in `src/pages/api/auth/signout.ts`) and confirm the chain fails with a trace in the report; revert

**Implementation Note**: 3.3 and 3.4 (baseline approval) come before 3.2, which cannot pass without the approved values. After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Smoke seams and documentation

### Overview

Remove smoke's two false-green assertions (user decision: fix, keep all steps) and leave the next contributor a cookbook.

### Changes Required:

#### 1. Smoke seams

**File**: `scripts/smoke.mjs`

**Intent**: Make the signout step discriminate, and make "signin accepts correct password" prove that signin itself set the session.

**Contract**:
- Steps accept an optional `exact: true`; with it, `location` must equal the expected value instead of `startsWith`. The signout step uses `{ status: 302, location: "/", exact: true }`.
- The "signin accepts correct password" step clears the jar before its request, so the following "dashboard redirects signed-in user" step depends on cookies set by signin.
- Step list, names and order otherwise unchanged; still zero dependencies.

#### 2. Docs

**File**: `TESTING.md`, `CLAUDE.md`, `context/foundation/test-plan.md`

**Intent**: Document the new suite and the defects deliberately left for S-04.

**Contract**:
- `TESTING.md`: new "HTTP route guard (Vitest `http`)" section — prerequisites (local Supabase, fresh `npm run build`, port 4323 free), `npm run test:http`; the `npm test` line no longer says "every Vitest project" — it reads "runs the unit, hooks and integration projects; not `http` (needs a build) and not e2e".
- `CLAUDE.md` Commands: add `npm run test:http`; reword the `npm test` line (:42) the same way as TESTING.md; CI `local-stack` bullet lists the http step after build; remove "There is no e2e coverage beyond the sign-in seed scenario yet."
- `test-plan.md`: §3 Phase 3 status `implemented` + change folder; §4 stack row for the `http` project; §5 integration gate notes the http suite; §6.4 filled (new page → automatically covered; public page → add to `PUBLIC_ROUTES` in `tests/http/support/route-inventory.ts`; new API handler → automatically covered by its exported method); §6.6 Phase 3 notes listing the logged S-04 follow-ups (see "What We're NOT Doing") and the `UI_BASELINE` approval; §4 "Test-base profile" line updated (it currently says "no tests for middleware, API/page routes or UI"); §6.3 gains a bullet "pin UI wording via a user-approved `UI_BASELINE` literal in the spec, never imported from `MESSAGES`"; §8 "Strategy (§1–§5) last reviewed" bumped.
- `README.md` is out of scope (already stale on e2e/hooks); `CLAUDE.md` and `TESTING.md` are the canonical command references.

### Success Criteria:

#### Automated Verification:

- `npm run build`, then a preview on 4321 and `BASE_URL=http://localhost:4321 npm run smoke` → all steps PASS
- Lint/format pass: `npm run lint`
- Full CI `local-stack` and `ci` jobs green on a branch push or `gh workflow run ci.yml --ref <branch>` (a push to `main` also deploys)

#### Manual Verification:

- Temporarily change `src/pages/api/auth/signout.ts` to redirect to `/licenses`: smoke's signout step now FAILS (previously passed); revert
- `test-plan.md` §6.4 is enough for someone to add a new protected page without reading this plan

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added: the guard's behaviour only exists through the running server; a unit test of the prefix list would duplicate the file-tree matrix.

### Integration Tests:

- HTTP suite (`tests/http/`): anonymous matrix (pages + API), revocation replay matrix with a positive control, path variants, inventory sanity counts.

### Manual Testing Steps:

1. Add a page outside the guarded prefixes → HTTP suite fails naming it.
2. Remove one API handler's user check → its row fails.
3. Neutralize `signOut()` → revocation rows fail, anonymous rows stay green.
4. Approve the two UI baseline error texts.
5. Break the signout redirect → smoke fails.

## Performance Considerations

The HTTP suite is ~25 routes × 2 jar states of local requests plus one preview start (~10–20 s). The binding constraint is the shared GoTrue auth budget (see Critical Implementation Details), not runtime.

## References

- Research: `context/changes/auth-risk-tests/research.md`
- Test plan: `context/foundation/test-plan.md` §2 Risks #2, #4; §3 Phase 3; §6.3, §6.4
- Roadmap: `context/foundation/roadmap.md` S-01
- Guard: `src/middleware.ts:4-22`; API guard contract `docs/reference/contract-surfaces.md:129-156`
- Patterns: `scripts/smoke.mjs:9-37`, `playwright.config.ts` (`webServer`), `tests/e2e/signin.spec.ts`, `tests/support/test-user.ts`, `tests/support/supabase-preflight.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: HTTP test project and anonymous route matrix

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — e9a7e01
- [x] 1.2 Type check passes: `npx astro check` — e9a7e01
- [x] 1.3 `npm test` still runs unit, hooks and integration only (http not included) — e9a7e01
- [x] 1.4 `npm run test:http` passes locally after `npm run build` with local Supabase running — e9a7e01
- [x] 1.5 `npm run test:http` without local Supabase fails with a Supabase-named error; without `dist/` it fails naming `npm run build` — e9a7e01

#### Manual

- [x] 1.6 Temporarily add a throwaway page `src/pages/zz-probe.astro` (outside the prefixes): `npm run build && npm run test:http` fails naming `/zz-probe`; remove it and confirm green again — e9a7e01
- [x] 1.7 Temporarily remove the `if (!context.locals.user)` check from one API handler, `npm run build && npm run test:http`: its matrix row fails; revert and rebuild — e9a7e01
- [x] 1.8 CI `local-stack` run on the branch shows the `npm run test:http` step green — e9a7e01

### Phase 2: Session revocation and path variants

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 330e4d0
- [x] 2.2 `npm run test:http` passes (anonymous, revocation and path-variant cases) — 330e4d0

#### Manual

- [x] 2.3 Temporarily make `src/pages/api/auth/signout.ts` skip `supabase.auth.signOut()` (still redirect to `/`): the revocation rows fail while the anonymous matrix stays green; revert — 330e4d0
- [x] 2.4 Test output lists each replayed route by name (readable failure report) — 330e4d0

### Phase 3: E2E auth session chain and approved messages

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 0c318cc
- [x] 3.2 `npm run build && npm run test:e2e` passes (existing sign-in scenario + new ones) — 0c318cc

#### Manual

- [x] 3.3 User approves the observed wrong-password text as the UI baseline — 0c318cc
- [x] 3.4 User approves the observed duplicate-signup text as the UI baseline, knowing it characterizes the S-04 enumeration defect — 0c318cc
- [x] 3.5 Temporarily change the signin redirect target in the spec's expectation (or break signout in `src/pages/api/auth/signout.ts`) and confirm the chain fails with a trace in the report; revert — 0c318cc

### Phase 4: Smoke seams and documentation

#### Automated

- [x] 4.1 `npm run build`, then a preview on 4321 and `BASE_URL=http://localhost:4321 npm run smoke` → all steps PASS — 4137dfe
- [x] 4.2 Lint/format pass: `npm run lint` — 4137dfe
- [x] 4.3 Full CI `local-stack` and `ci` jobs green on a branch push or `gh workflow run ci.yml --ref <branch>` (a push to `main` also deploys) — 4137dfe

#### Manual

- [x] 4.4 Temporarily change `src/pages/api/auth/signout.ts` to redirect to `/licenses`: smoke's signout step now FAILS (previously passed); revert — 4137dfe
- [x] 4.5 `test-plan.md` §6.4 is enough for someone to add a new protected page without reading this plan — 4137dfe
