---
date: 2026-10-09T20:47:25+02:00
researcher: Claude (Opus 5.5) for Hornster
git_commit: c2b44f1
branch: main
repository: NoteItDown
topic: "Ground test-plan Phase 1 (E2E foundation): Risk #6 and Risk #4 (seed scenario)"
tags: [research, e2e, playwright, ci, auth, middleware, supabase, smoke]
status: complete
last_updated: 2026-10-09
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 1 — Risk #6 and Risk #4 (seed)

**Date**: 2026-10-09T20:47:25+02:00
**Researcher**: Claude (Opus 5.5) for Hornster
**Git Commit**: c2b44f1 (working tree has uncommitted `context/` edits only)
**Branch**: main
**Repository**: NoteItDown

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (§3 row 1, change `e2e-framework-spike`):

- **Risk #6** — the e2e layer flakes or silently skips in CI, so risk tests read green without having run.
- **Risk #4 (seed only)** — signin → protected page works end to end against local Supabase.

For each: ground the real failure path in code, verify/correct the §2 response guidance, locate existing tests (incl. `scripts/smoke.mjs` overlap), pick the cheapest useful layer, decide whether e2e shares the `smoke` job's local-Supabase setup, and flag speculative risks or misleading hot-spot evidence.

## Summary

1. **The app degrades to "anonymous", not to an error, when Supabase is missing or down.** `createClient` returns `null` without env (`src/lib/supabase.ts:6-8`), the middleware then sets `locals.user = null` (`src/middleware.ts:9-16`), and the signin route redirects back with an error query (`src/pages/api/auth/signin.ts:10-11, 15-16`). Env vars are `optional: true` (`astro.config.mjs:19-20`), so the build passes without them. Consequence for Risk #6: any e2e assertion that holds for an anonymous visitor (e.g. "signin page renders", "protected page redirects to /auth/signin") **passes against a dead or unconfigured Supabase**. "Fails loudly" therefore needs (a) a preflight like the integration suite's and (b) a seed scenario whose final assertion is only reachable with a real session.
2. **The seed scenario must be signin → `/campaigns/<uuid>` with the campaign page rendered.** Signin redirects to `/dashboard` (`signin.ts:19`), which redirects to `/campaigns/<id>` via `resolveLandingCampaign` (`src/pages/dashboard.ts:17-22`); a new user has a campaign because the `on_auth_user_created` trigger creates one (`supabase/migrations/20260922120000_campaign_notes_schema.sql:200-202`). The signin form is a hydrated React island with client-side validation that can `preventDefault` (`src/components/auth/SignInForm.tsx:36-40, 43`), which is the part `smoke.mjs` (raw `fetch`) cannot exercise — the real reason e2e adds signal here.
3. **"Unit tests on schemas cover auth" is not just weak — there are none.** The 11 unit test files under `src/` include schema tests only for `campaigns`, `notes`, `note-images` (`src/lib/schemas/*.test.ts`); auth routes use no zod schema (`signin.ts:6-7` casts `form.get(...) as string`). The only automated auth coverage is `scripts/smoke.mjs:41-118` (HTTP-level) and the integration helper that calls `signUp` directly (`tests/integration/helpers.ts:33`).
4. **Existing CI has two silent-pass/obscure-fail seams Phase 1 should not copy:** the preview wait loop never fails on timeout (`.github/workflows/ci.yml:54`), and `smoke.mjs`'s signin check passes on any redirect starting with `/` (`scripts/smoke.mjs:58` expects `location: "/"`, compared with `startsWith` at `:126`; actual is `/dashboard`).
5. **CI recommendation: add e2e as steps inside the existing `smoke` job** (reuse `supabase start`, the `.env`/`.dev.vars` write and the build, `ci.yml:40-50`), with Playwright's `webServer` owning the preview server. A separate job would duplicate Supabase start + `npm ci` + build for one scenario. One ordering hazard must be resolved (see §CI wiring).

## Detailed Findings

### Risk #6 — e2e flakes or silently skips in CI

**Real failure paths in code (observed):**

- Missing env does not fail the build: `SUPABASE_URL`/`SUPABASE_KEY` are `envField.string({ context: "server", access: "secret", optional: true })` (`astro.config.mjs:19-20`). At runtime `createClient` returns `null` (`src/lib/supabase.ts:6-8`).
- Middleware with no client or no user: `context.locals.user = null` and protected prefixes redirect to `/auth/signin` (`src/middleware.ts:9-22`). When Supabase is unreachable, `auth.getUser()` resolves with no user (inference from `@supabase/ssr` returning `{ data: { user: null }, error }` rather than throwing — not executed in this research), so the visitor is treated as anonymous.
- Signin with no client redirects to `/auth/signin?error=Supabase is not configured` (`signin.ts:10-11`); with an auth error, to `/auth/signin?error=<message>` (`signin.ts:15-16`). Both render the signin page with HTTP 200 (`src/pages/auth/signin.astro:5, 14`).
- `/dashboard` returns a 500 text body when unconfigured (`dashboard.ts:13-14`) and 404 when no campaign (`dashboard.ts:18-19`) — but only reached by a signed-in user, since the middleware redirects first.

**Consequence:** the anti-pattern "job that skips on missing env" is real but takes a subtler form here — not a skip, but *tests whose assertions coincide with the degraded state*. A seed test asserting only the signin page or an anonymous redirect would be green with Supabase stopped.

**Existing protections to copy:**

- Integration preflight fails (does not skip) on missing env, non-local host, or unhealthy `/auth/v1/health` (`tests/integration/global-setup.ts:13-34`). The same checks fit a Playwright `globalSetup`.

**Existing seams not to copy:**

- `ci.yml:54`: `for i in $(seq 1 60); do curl -sf ... && break; sleep 1; done` — exits 0 after 60 s even if the server never answered. `smoke.mjs` would then fail with an unhandled `fetch` rejection (top-level `await` at `scripts/smoke.mjs:123`), which is loud but uninformative. Playwright's `webServer` throws on startup timeout (Context7 `/microsoft/playwright`, `TestConfig.webServer.timeout`, default 60000 ms), so letting Playwright own the server is strictly better.
- `supabase/setup-cli@v1` with `version: latest` (`ci.yml:36-38`) — unpinned CLI is a plausible flake source for every local-Supabase job; flag only, outside Phase 1 scope unless the spike hits it.

**Response guidance verdict:** *Supported, with corrections.*

- Keep: "fails when a scenario fails", "fails loudly when Supabase or server is unreachable", "avoid retries masking flakiness".
- Correct: "jobs that skip on missing env" → also "assertions that hold in the degraded anonymous state". The proof must include running the seed scenario with Supabase stopped (or env removed) and observing a red job — not only a deliberately broken assertion.
- Concrete Playwright knobs (Context7 `/microsoft/playwright`, checked 2026-10-09): `forbidOnly: !!process.env.CI`; `retries: 0` (default is no retries); `failOnFlakyTests: !!process.env.CI` (since v1.52) if retries are ever enabled; `webServer.reuseExistingServer: !process.env.CI` — on CI, if something already listens on the URL, Playwright **throws** "is already used" (webServerPlugin `_startProcess`).
- Unverified, check in the spike: Playwright's exit status when zero tests match (e.g. a mistyped `testDir`). The proof set should include it.

**Proposed proof set for "the job ran" (CI job + one-off checks):**

| Check | Expected | Why |
|---|---|---|
| deliberately failing assertion pushed on a throwaway branch | job red | scenario failure propagates |
| Supabase not started (or `.env` absent) | job red, error names Supabase | degraded-anonymous trap |
| server command broken / wrong port | job red via `webServer` timeout | replaces the silent wait loop |
| empty/mistyped test dir | job red | "no tests ran" ≠ green (verify behaviour) |
| `test.only` committed | job red | `forbidOnly` |
| report shows `1 passed` (not `0`/`skipped`) | visible in log | "job passed ⇒ tests ran" made observable |

### Risk #4 (seed) — signin → protected page

**Real path (observed):**

1. `/auth/signin` renders `SignInForm` with `client:load` (`signin.astro:14`).
2. Form is `method="POST" action="/api/auth/signin"` with `noValidate`; `handleSubmit` calls `preventDefault` when client validation fails (`SignInForm.tsx:36-40, 43`). Field ids `email` / `password`, labels "Email" / "Password", button text "Sign in" (`SignInForm.tsx:44-47, 58-60, 82-84`).
3. API: `signInWithPassword`, then `redirect("/dashboard")` (`signin.ts:13, 19`); cookies are written through `setAll` with `sameSite: "lax"`, `secure: import.meta.env.PROD` (`supabase.ts:12, 17-21`).
4. Middleware resolves the user from cookies (`middleware.ts:10-13`); `/dashboard` → `/campaigns/<id>` (`dashboard.ts:17-22`).
5. Campaign page renders `<h1>{campaign.name}</h1>` plus "Rename", "Memory map", "New note" links (`src/pages/campaigns/[campaignId]/index.astro:35-60`); Topbar has a "Sign out" form (`src/components/Topbar.astro:49-51`).

**Seed-user creation:** local email confirmations are disabled (`supabase/config.toml:209`), so `auth.signUp` with the anon key returns a session immediately — already relied on by `tests/integration/helpers.ts:15, 33-39`. The `smoke` job exports only `API_URL` and `ANON_KEY` (`ci.yml:43`), so seeding via signUp (fresh unique email per run, as `smoke.mjs:5` does) fits without adding the service-role key. A new user's default campaign comes from the trigger (`campaign_notes_schema.sql:200-202`, name `'My Campaign'` at `:207` in the backfill).

**Cookie note:** `secure: import.meta.env.PROD` (`supabase.ts:12`) means the preview (production build) sets `Secure` cookies on `http://localhost`. Chromium treats `localhost` as a secure context so this works there, and `smoke.mjs` works because it ignores cookie attributes; whether other browsers accept it is unverified — keep the spike to Chromium.

**Oracle (avoid copying expected messages from code under test):**

- Assert *structure and outcome*, not app strings: final URL matches `/campaigns/<uuid>`, response OK, and a sign-out control is present (presence of a session-only control). Text like "Sign in" / "Sign out" is UI baseline; PRD-v2 FR-010 says only "sign up, sign in and sign out; session behavior unchanged" (`context/foundation/prd-v2.md:160`), so no PRD wording exists to pin. Recommend role-based locators (`getByRole("button", { name: /sign out/i })`) and treating the current UI as the recorded baseline, stated explicitly in the plan.
- The wrong-password message is produced by Supabase Auth (`error.message` passed through at `signin.ts:16`), not app code — out of the seed scope; belongs to Phase 3.

**Response guidance verdict:** *Supported; one claim strengthened.* "Unit tests on schemas cover auth" — there are no auth schemas and no auth unit tests (inspected: the 11 `src/**/*.test.ts` files; none reference signin/signup/auth). The S-04 constants sweep and S-05 theme revamp would touch exactly `signin.ts`/`SignInForm.tsx`/`Topbar.astro`, which only `smoke.mjs` covers today.

### Overlap with `scripts/smoke.mjs`

`smoke.mjs` already covers at HTTP level (`scripts/smoke.mjs:41-118`): anonymous redirects (`/dashboard`, `/map`, `/campaigns/<id>`), signup, wrong/correct password, dashboard → campaign, campaign page 200, signout, post-signout redirect, anonymous API 401. What e2e adds for the seed: the hydrated form (client validation not blocking a valid submit), real browser cookie handling (`SameSite`/`Secure`), and rendered content. The cheapest *useful* layer for the seed is therefore one browser test; adding more HTTP assertions to e2e would duplicate smoke. Smoke weakness worth fixing opportunistically: `"signin accepts correct password"` expects `location: "/"` (`smoke.mjs:58`), which `startsWith` (`:126`) matches for any path — should be `/dashboard`.

### CI wiring — shared `smoke` job vs own job

Current `smoke` job: start Supabase with many services excluded (`ci.yml:40-43`), write `.env` + `.dev.vars` (`:44-48`), integration tests (`:49`), build (`:50`), background preview + wait loop + smoke (`:51-55`), `supabase stop` under `if: always()` (`:56-57`). `deploy` needs `[ci, smoke]` (`:61`).

**Recommendation: same job, new steps after build.** Rationale: one scenario does not justify a second `supabase start` + `npm ci` + build; the gate automatically blocks deploy via existing `needs`. Costs: `npx playwright install --with-deps chromium` adds time (cacheable); job name "smoke" becomes a misnomer (rename optional — `needs` references the job id).

**Ordering hazard (must be resolved in the plan):** the smoke step starts `npm run preview -- --port 4321 &` and never stops it. If Playwright later uses `webServer` on port 4321 with `reuseExistingServer: false` on CI, it throws "already used". Options: run e2e *before* the smoke step; or give Playwright a different port; or let Playwright's `webServer` serve both (smoke as a step after is not possible since the server dies with Playwright). Running e2e before smoke on its own port is the simplest.

**When a separate job would be justified:** if the job wall-clock becomes a problem, or Phase 2/3 e2e grows beyond a handful of scenarios. Not now.

**Docs drift:** `CLAUDE.md:89` says CI runs on push/PR to `master`; `ci.yml:5,7` uses `main`. Also CLAUDE.md says "There is still no e2e test framework" — will need updating when Phase 1 lands.

### Hot-spot evidence check

- `src/` "route-guard churn": in the last 30 days, 8 commits touched the union of `src/middleware.ts`, `src/pages/api/auth`, `src/pages/auth`, `src/lib/supabase.ts`, `scripts/` (`git log --since=2026-09-09`), mostly feature work on campaign routing (`972f2b7`) and review fixes, not auth logic. `PROTECTED_ROUTES` is a 4-entry prefix list (`middleware.ts:4`) matched with `startsWith` (`:18`) — note it also matches e.g. `/notesXYZ`, `/mapping`; relevant to Phase 3, not Phase 1. The churn is real likelihood evidence for Risk #2/#4, weaker for Risk #6.
- `src/pages/api` is the Risk #1 hot spot; for Phase 1 only `api/auth/signin.ts` matters.
- `scripts/`: only `smoke.mjs` — evidence for Risk #6 is the CI seams above, which live in `ci.yml`, not `scripts/`. The hot-spot pointer was partly misleading: the real Risk #6 anchors are `.github/workflows/ci.yml:36-55` and `astro.config.mjs:19-20`.
- Minor count drift: test-plan §4 says "6 integration under tests/integration/" (correct: 6 `*.test.ts` + `global-setup.ts` + `helpers.ts`); roadmap Baseline says "7 integration test files" (`context/foundation/roadmap.md:73`) — counts the setup file or is stale; cosmetic.

## Code References

- `astro.config.mjs:19-20` — Supabase env optional; build passes without it
- `src/lib/supabase.ts:6-8, 12, 17-21` — null client without env; cookie options; cookie writes
- `src/middleware.ts:4, 9-22` — protected prefixes; degrade-to-anonymous
- `src/pages/api/auth/signin.ts:10-19` — signin error/success redirects
- `src/pages/dashboard.ts:13-22` — 500/404/redirect to campaign
- `src/pages/auth/signin.astro:5, 14` — error query, hydrated form
- `src/components/auth/SignInForm.tsx:36-43` — client validation + POST form
- `src/pages/campaigns/[campaignId]/index.astro:15-60` — protected page content
- `src/components/Topbar.astro:49-51` — sign-out form
- `supabase/config.toml:209` — email confirmations disabled locally
- `supabase/migrations/20260922120000_campaign_notes_schema.sql:200-209` — default campaign trigger/backfill
- `tests/integration/global-setup.ts:13-34` — fail-loud preflight pattern to reuse
- `tests/integration/helpers.ts:15, 33-39` — signUp-returns-session seeding
- `scripts/smoke.mjs:41-135` — HTTP auth smoke; weak `"/"` assertion at `:58`/`:126`
- `.github/workflows/ci.yml:28-57` — smoke job; silent wait loop at `:54`; unpinned CLI at `:38`
- `vitest.config.ts:18-37` — Vitest projects; e2e must stay out of `include` globs

## Architecture Insights

- Auth failure is modelled as "no user", not as an error. Good for users, dangerous for tests: every test needs an assertion only a real session can satisfy, plus a preflight.
- The integration suite's "fail, never skip" preflight is the project's established pattern — Phase 1 should mirror it rather than invent one.
- Playwright files must not match Vitest globs (`src/**/*.test.ts`, `tests/integration/**/*.test.ts`); e.g. `tests/e2e/**/*.spec.ts` is safe. ESLint type-checked config will also lint the new files and `playwright.config.ts` (tsconfig inclusion to verify in the plan).

## Historical Context (from prior changes)

- Not inspected in depth; no prior e2e change exists under `context/changes/` or `context/archive/` (only `e2e-framework-spike/` itself). The integration preflight and smoke job came from earlier changes; their current code is cited above.

## Related Research

- Not applicable — first research for this change.

## Open Questions

1. Playwright exit code when no tests are found — verify during the spike (part of the proof set).
2. Does `auth.getUser()` with an unreachable Supabase resolve `user: null` or throw inside workerd? Either way the seed scenario fails; matters only for error clarity. Verify with the "Supabase stopped" check.
3. Seed via the UI signup page or via `signUp` in a setup step? Recommendation: setup step (signup UI is Phase 3 scope); planner's choice.
4. Rename the `smoke` job (e.g. `local-stack`)? Cosmetic; `deploy.needs` must follow.
