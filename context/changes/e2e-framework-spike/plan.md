# E2E Framework Spike Implementation Plan

## Overview

Install Playwright and add exactly one browser scenario — sign in → land on the signed-in user's campaign page — that runs locally and in CI against local Supabase only, and is proven to fail loudly (never pass by skipping or by coinciding with the degraded "anonymous" state). Roadmap F-01; test-plan §3 Phase 1 (Risk #6, Risk #4 seed). Fix four adjacent CI/smoke seams on the way.

## Current State Analysis

- No e2e framework. Automated auth coverage is only `scripts/smoke.mjs:41-118` (raw `fetch`, HTTP level) and integration helpers that call `signUp` directly (`tests/integration/helpers.ts:21-45`).
- The app degrades to "anonymous", not to an error, when Supabase is missing/down: env is `optional: true` (`astro.config.mjs:19-20`), `createClient` returns `null` (`src/lib/supabase.ts:6-8`), middleware sets `locals.user = null` and redirects protected prefixes to `/auth/signin` (`src/middleware.ts:9-22`). Any assertion that holds for an anonymous visitor passes against a dead Supabase.
- Fail-loud preflight pattern exists for integration: `tests/integration/global-setup.ts:9-34` (env present, host local, `/auth/v1/health` ok).
- CI (`.github/workflows/ci.yml`): triggers only on push/PR to `main` (`:3-7`); job `smoke` (`:28-57`) starts local Supabase, writes `.env` + `.dev.vars`, runs integration, builds, then starts `npm run preview -- --port 4321 &` and never stops it (`:53`); its wait loop exits 0 on timeout (`:54`); Supabase CLI unpinned (`:38`); `deploy.needs: [ci, smoke]` (`:61`).
- `smoke.mjs:58` expects signin `location: "/"`, compared with `startsWith` (`:126`) — matches any path; real target is `/dashboard`.
- Installed Supabase CLI devDependency: `2.120.0` (`node_modules/supabase/package.json`).

## Desired End State

- `npm run test:e2e` runs one Chromium scenario against the preview build on port 4322 and prints `1 passed`; it fails with a Supabase-named error when Supabase is down or env is missing.
- CI job `local-stack` (renamed from `smoke`) runs that scenario after the build and before the smoke step; failure uploads trace/screenshot artifacts; `deploy` still gated on it.
- Six CI runs (one green, five deliberately red) are recorded in `context/changes/e2e-framework-spike/proof-runs.md` with run URLs.
- `TESTING.md` at repo root lists every testing command with a one-sentence explanation; CLAUDE.md and test-plan reflect that e2e exists.

### Key Discoveries:

- Signin form is a hydrated island (`src/pages/auth/signin.astro:14`, `client:load`) whose client validation can `preventDefault` (`src/components/auth/SignInForm.tsx:36-43`); labels "Email"/"Password", button "Sign in". It is also a native `<form method="POST" action="/api/auth/signin">` (`SignInForm.tsx:43`), so a submit before hydration (or with broken island JS) still signs in. The seed scenario therefore proves a real browser session, not that the island hydrated; island coverage (client validation) is deferred to S-01.
- Signin → `/dashboard` (`src/pages/api/auth/signin.ts:19`) → `/campaigns/<id>` (`src/pages/dashboard.ts:17-22`); a new user gets a campaign via trigger (`supabase/migrations/20260922120000_campaign_notes_schema.sql:200-202`). `createTestUser` already resolves that campaign id (`tests/integration/helpers.ts:43-`), giving an exact-URL oracle.
- Session-only control: Topbar "Sign out" button (`src/components/Topbar.astro:49-51`).
- Cookies use `secure: import.meta.env.PROD` (`src/lib/supabase.ts:12`): preview sets `Secure` cookies on `http://localhost`; Chromium accepts this — keep the spike Chromium-only.
- Vitest globs `src/**/*.test.ts`, `tests/integration/**/*.test.ts` (`vitest.config.ts:23,30`) — `tests/e2e/**/*.spec.ts` stays out. Root tsconfig includes `**/*`, so type-checked ESLint covers new TS files.
- `vitest.config.ts:8` loads `.env` into `process.env` via vite `loadEnv`; Playwright does not load `.env` by itself.

## What We're NOT Doing

- No second scenario (wrong password, signup UI, signout, route-guard matrix) — Phase 3 / S-01 scope.
- No Firefox/WebKit projects.
- No retries (`retries: 0`); no `failOnFlakyTests` needed while retries are 0.
- No separate e2e CI job, no Playwright browser cache step.
- No seed.sql user and no service-role key in CI.
- No changes to app code under `src/`.
- No retiring/rewriting of `smoke.mjs` beyond the one assertion fix.
- `e2e` is not added to `npm test`.

## Implementation Approach

Mirror established patterns rather than inventing: the integration preflight becomes a shared helper used by both global setups; seeding reuses `createTestUser`; env loading mirrors `vitest.config.ts`. Playwright's `webServer` owns the preview server (throws on startup timeout and on an occupied port in CI), replacing the silent wait-loop seam for e2e. The scenario's final assertions (exact campaign URL of the seeded user + visible sign-out control) are reachable only with a real session, so the degraded-anonymous state cannot satisfy them.

## Critical Implementation Details

- **`workflow_dispatch` must be on the default branch first.** GitHub only dispatches a workflow whose `main` copy declares the trigger; the dispatched run then uses the `--ref` branch's file. Phase 2 therefore lands on `main` (push → full CI incl. deploy) before Phase 3 can dispatch proof branches. Pushing to `main` and to proof branches is outward-facing — confirm with the user before each push.
- **"Supabase stopped" proof must not be masked by the integration step.** Stop Supabase in an extra step placed *after* build and *before* the e2e step on that proof branch only; otherwise integration goes red first and the run proves nothing about e2e.
- **Auth rate limit.** Local GoTrue allows 30 sign-in/sign-ups per 5 min per IP, shared by integration, e2e and smoke in one job (`tests/integration/helpers.ts:17-19`). The scenario must create exactly one user once (not per retry/project). If CI shows 429s, report it rather than adding retries.
- **Port separation.** e2e uses 4322; smoke keeps 4321 and starts after e2e finished, so Playwright's CI `reuseExistingServer: false` never sees an occupied port.

## Phase 1: Playwright + seed scenario green locally

### Overview

Add Playwright, config, shared preflight, the seed scenario and docs so `npm run build && npm run test:e2e` passes locally against local Supabase.

### Changes Required:

#### 1. Dependency and script

**File**: `package.json`

**Intent**: Add `@playwright/test` as a devDependency (current release, v1.63 line) and a `test:e2e` script; leave `test` as Vitest only.

**Contract**: `"test:e2e": "playwright test"`. If `npm` requires an `allowScripts` entry for a Playwright package, add it like the existing entries. Chromium is installed with `npx playwright install chromium` (documented in TESTING.md).

#### 2. Shared Supabase preflight

**File**: `tests/support/supabase-preflight.ts` (new); `tests/integration/global-setup.ts`

**Intent**: Move the existing preflight body (env present, local host, `/auth/v1/health` ok) into one exported function; integration's global setup calls it unchanged in behavior. Error messages keep naming Supabase and the fix command, with a suite label parameter so the message says which suite failed.

**Contract**: `export async function assertLocalSupabase(suite: string): Promise<void>` — throws, never skips.

#### 3. Seed helper returns credentials

**File**: `tests/integration/helpers.ts`

**Intent**: `createTestUser` additionally returns the `email` and `password` it signed up with so e2e can drive the signin UI; existing callers are unaffected.

**Contract**: return type gains `email: string; password: string`.

#### 4. Playwright config

**File**: `playwright.config.ts` (new)

**Intent**: One Chromium project, `testDir: "tests/e2e"`, `testMatch: "**/*.spec.ts"`, global setup calling `assertLocalSupabase("e2e")`, `.env` loaded into `process.env` the same way as `vitest.config.ts:8`, fail-loud CI knobs, failure diagnostics, and `webServer` owning the preview server.

**Contract**:
- `forbidOnly: !!process.env.CI`, `retries: 0`, `workers: 1`, `reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list"`.
- `use: { baseURL: "http://localhost:4322", trace: "retain-on-failure", screenshot: "only-on-failure" }`.
- `webServer: { command: "npm run preview -- --port 4322", url: "http://localhost:4322", reuseExistingServer: !process.env.CI, timeout: 60_000 }`.
- Global setup file: `tests/e2e/global-setup.ts`.

#### 5. Seed scenario

**File**: `tests/e2e/signin.spec.ts` (new)

**Intent**: Seed one user with `createTestUser`, then in the browser: open `/auth/signin`, fill the form by label, submit via the "Sign in" button, and assert outcome-only facts reachable only with a session. The scenario does not wait for or assert hydration (see Key Discoveries). Current UI labels are the recorded baseline (no PRD wording exists to pin; research §Oracle).

**Contract**: Final assertions: `page` URL equals `/campaigns/<campaignId returned by createTestUser>` (exact, not a prefix), and `getByRole("button", { name: /sign out/i })` is visible. Role/label locators only; no CSS selectors; no asserting app message strings.

#### 6. Ignore Playwright output

**File**: `.gitignore`; `eslint.config.js` only if lint picks up generated output

**Intent**: Ignore `playwright-report/`, `test-results/`, `playwright/.cache/`. ESLint already respects `.gitignore` via `includeIgnoreFile`.

**Contract**: three new ignore lines.

#### 7. Testing command reference

**File**: `TESTING.md` (new, repo root)

**Intent**: Keep testing knowledge from dissipating: list every testing command with one sentence each — `npm run test:unit`, `npm run test:integration`, `npm test`, `npm run test:e2e`, `npx playwright install chromium`, `npm run smoke`, `npx supabase start`, plus prerequisites (local Supabase, `.env`/`.dev.vars`, fresh `npm run build` before e2e; locally e2e reuses any server already on 4322, so stop stale preview/dev servers and rebuild first) and `npx playwright show-trace <zip>` for CI failure artifacts.

**Contract**: one heading per command group; one sentence per command.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Unit tests pass: `npm run test:unit`
- Integration tests still pass with the shared preflight: `npm run test:integration`
- e2e passes and reports `1 passed`: `npm run build && npm run test:e2e`
- e2e fails with a Supabase-named preflight error when local Supabase is stopped (`npx supabase stop && npm run test:e2e`, then `npx supabase start`) and when env is missing (`mv .env .env.bak && npm run test:e2e; mv .env.bak .env`)

#### Manual Verification:

- Before running anything, check for an already running dev/preview server on 4321/4322 and ask the user before stopping it (lessons.md)
- `TESTING.md` reads correctly and every listed command works as described
- `git status` shows no Playwright output directories as untracked

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: CI wiring + seam fixes

### Overview

Run the scenario in CI inside the existing local-Supabase job, enable manual dispatch for proof runs, and fix the four adjacent seams.

### Changes Required:

#### 1. Workflow triggers

**File**: `.github/workflows/ci.yml`

**Intent**: Add `workflow_dispatch` alongside the existing triggers so proof branches can be run on demand. Keep `branches: [main]` on `push` and `pull_request` unchanged, so pushing `e2e-proof/*` branches does not trigger CI by itself. The `deploy` guard (`github.event_name == 'push' && github.ref == 'refs/heads/main'`) already prevents dispatched runs from deploying — keep it unchanged.

**Contract**: `on:` gains `workflow_dispatch: {}`; `push.branches` and `pull_request.branches` stay `[main]`.

#### 2. Job rename and CLI pin

**File**: `.github/workflows/ci.yml`

**Intent**: Rename job id `smoke` → `local-stack` (it now runs integration, e2e and smoke) and update `deploy.needs`; pin `supabase/setup-cli` to the installed devDependency version.

**Contract**: `needs: [ci, local-stack]`; `version: 2.120.0`.

#### 3. e2e steps

**File**: `.github/workflows/ci.yml`

**Intent**: After `npm run build` and before the smoke step: install Chromium with OS deps, run `npm run test:e2e` with `CI` set (GitHub sets it), and on failure upload `playwright-report/` and `test-results/`.

**Contract**: steps in order — `npx playwright install --with-deps chromium`; `npm run test:e2e`; `actions/upload-artifact@v4` with `if: failure()`, name `playwright-report`. Must stay before the existing `supabase stop` (`if: always()`) step.

#### 4. Smoke wait loop fails on timeout

**File**: `.github/workflows/ci.yml`

**Intent**: The preview wait loop must exit non-zero with a clear message if the server never answers, instead of falling through to an uninformative smoke crash.

**Contract**: after the loop, a check that fails the step (e.g. a final `curl -sf` or a ready-flag test) with "preview server did not start on 4321".

#### 5. Smoke signin assertion

**File**: `scripts/smoke.mjs`

**Intent**: The "signin accepts correct password" check expects `location: "/dashboard"` instead of `"/"`, so it no longer matches any redirect.

**Contract**: `scripts/smoke.mjs:58` only.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Workflow YAML parses: `npx --yes yaml-lint .github/workflows/ci.yml` (or `actionlint` if available)
- Smoke passes locally against preview with the tightened assertion: `npm run build && (npm run preview -- --port 4321 &) && BASE_URL=http://localhost:4321 npm run smoke` (stop the server afterwards)
- After the user-approved push to `main`, CI is green with jobs `ci`, `local-stack`, `deploy`, and the `local-stack` log shows `1 passed` for e2e

#### Manual Verification:

- User confirms push to `main` before it happens (triggers deploy)
- "Run workflow" button for CI appears in the GitHub Actions UI
- User checks whether branch protection requires a check named `smoke` and updates it to `local-stack` if so

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: CI proof runs + docs

### Overview

Prove in CI that the e2e layer fails loudly in every Risk #6 failure mode, record the evidence, and update project docs.

### Changes Required:

#### 1. Proof runs

**File**: throwaway branches `e2e-proof/<n>-<slug>` (never merged); `context/changes/e2e-framework-spike/proof-runs.md` (new)

**Intent**: For each check, branch from `main`, make the single breaking change, push (user-confirmed), run `gh workflow run ci.yml --ref <branch>`, and record branch, change, run URL, observed result and the decisive log line. Delete the branches afterwards.

**Contract**: the six checks and expected outcomes:

| # | Branch change | Expected |
|---|---|---|
| P1 | none (dispatch `main`) | green; e2e log shows `1 passed` |
| P2 | spec expects a wrong campaign URL | red; failure artifact uploaded with trace |
| P3 | extra `supabase stop` step after build, before e2e | red; preflight error names Supabase |
| P4 | `webServer.command` preview port ≠ `url` port | red via `webServer` timeout |
| P5 | `testDir` mistyped | red ("no tests found") |
| P6 | `test.only` added to the spec | red via `forbidOnly` |

If P5 comes back green, add a guard that fails the e2e step when zero tests ran (e.g. JSON reporter + check `stats.expected >= 1`), land it via the Phase 2 path, and re-run P5.

#### 2. Project docs

**File**: `CLAUDE.md`; `context/foundation/test-plan.md`

**Intent**: CLAUDE.md: add `npm run test:e2e` to Commands, point to `TESTING.md`, replace "There is still no e2e test framework", fix the CI section (`main` not `master`, job `local-stack` runs integration + e2e + smoke, `workflow_dispatch` exists). test-plan: §3 row 1 status, §4 e2e row (Playwright confirmed, version), §6.3 cookbook entry (seed via `createTestUser`, preview on 4322, assert session-only outcome).

**Contract**: prose edits in the named sections only.

### Success Criteria:

#### Automated Verification:

- `proof-runs.md` lists P1–P6, each with a run URL and an observed result matching the expected column
- Lint passes: `npm run lint`
- No `e2e-proof/*` branches remain: `git ls-remote --heads origin 'e2e-proof/*'` prints nothing

#### Manual Verification:

- User approves each proof-branch push
- User spot-checks at least one red run (P2) and opens its trace artifact with `npx playwright show-trace`
- CLAUDE.md, TESTING.md and test-plan read consistently

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added; the change is test infrastructure. Existing unit suite must stay green.

### Integration Tests:

- Existing suite re-run after the preflight extraction (behavior unchanged).

### Manual Testing Steps:

1. Local: `npx supabase start`, `npm run build`, `npm run test:e2e` → `1 passed`.
2. Local: stop Supabase, re-run → red with Supabase-named error.
3. CI: P1–P6 as tabled in Phase 3.

## Performance Considerations

Chromium install with OS deps adds roughly a minute to `local-stack`; accepted (no cache step for one scenario). Revisit with a separate job or cache if Phase 2/3 e2e grows.

## Migration Notes

Job id rename changes the required-check name (`smoke` → `local-stack`) for any branch protection rule.

## References

- Research: `context/changes/e2e-framework-spike/research.md`
- Test plan: `context/foundation/test-plan.md` §3 Phase 1, §5, §6.3
- Roadmap: `context/foundation/roadmap.md` F-01
- Preflight pattern: `tests/integration/global-setup.ts:9-34`
- Seeding pattern: `tests/integration/helpers.ts:21-45`
- CI job: `.github/workflows/ci.yml:28-61`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Playwright + seed scenario green locally

#### Automated

- [ ] 1.1 Lint passes: `npm run lint`
- [ ] 1.2 Type check passes: `npx astro check`
- [ ] 1.3 Unit tests pass: `npm run test:unit`
- [ ] 1.4 Integration tests still pass with the shared preflight: `npm run test:integration`
- [ ] 1.5 e2e passes and reports `1 passed`: `npm run build && npm run test:e2e`
- [ ] 1.6 e2e fails with a Supabase-named preflight error when local Supabase is stopped and when env is missing

#### Manual

- [ ] 1.7 Check for an already running dev/preview server on 4321/4322 and ask before stopping it
- [ ] 1.8 `TESTING.md` reads correctly and every listed command works as described
- [ ] 1.9 `git status` shows no Playwright output directories as untracked

### Phase 2: CI wiring + seam fixes

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Workflow YAML parses
- [ ] 2.3 Smoke passes locally against preview with the tightened assertion
- [ ] 2.4 After the user-approved push to `main`, CI is green with `ci`, `local-stack`, `deploy` and e2e shows `1 passed`

#### Manual

- [ ] 2.5 User confirms push to `main` before it happens
- [ ] 2.6 "Run workflow" button for CI appears in the GitHub Actions UI
- [ ] 2.7 Branch protection required check updated from `smoke` to `local-stack` if present

### Phase 3: CI proof runs + docs

#### Automated

- [ ] 3.1 `proof-runs.md` lists P1–P6 with run URLs and observed results matching expected
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 No `e2e-proof/*` branches remain on origin

#### Manual

- [ ] 3.4 User approves each proof-branch push
- [ ] 3.5 User opens the P2 trace artifact with `npx playwright show-trace`
- [ ] 3.6 CLAUDE.md, TESTING.md and test-plan read consistently
