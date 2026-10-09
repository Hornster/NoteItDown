# E2E Framework Spike — Plan Brief

> Full plan: `context/changes/e2e-framework-spike/plan.md`
> Research: `context/changes/e2e-framework-spike/research.md`

## What & Why

Install Playwright and run exactly one sign-in scenario locally and in CI against local Supabase, proven to fail loudly. This is roadmap F-01 / test-plan Phase 1 (Risk #6: e2e silently skips or flakes; Risk #4 seed: signin → protected page). It unlocks S-01 and S-02 and answers whether an e2e framework fits the timeline.

## Starting Point

No e2e framework exists; auth is covered only by HTTP-level `scripts/smoke.mjs`. The app treats a dead or unconfigured Supabase as "anonymous", so naive e2e assertions (signin page renders, anonymous redirect) would pass with Supabase down. CI's `smoke` job already has local Supabase, `.env`/`.dev.vars` and a build, but has a silent wait loop and an unpinned Supabase CLI.

## Desired End State

`npm run test:e2e` signs a freshly seeded user in through the real signin form in Chromium (session proof; island hydration not asserted — S-01) and lands on that user's exact `/campaigns/<id>` page with "Sign out" visible. CI job `local-stack` runs it before smoke and uploads traces on failure. Six recorded CI runs show it goes red for a failing assertion, stopped Supabase, broken server, no tests and `test.only`, and green with `1 passed` otherwise. A root `TESTING.md` lists every test command.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Framework | Playwright, Chromium only | `webServer` fails on timeout/occupied port; Secure cookies on localhost are verified only for Chromium | Research |
| Oracle | Exact seeded campaign URL + visible sign-out control | Only reachable with a real session, so the degraded-anonymous state can't pass | Research |
| Preflight | Shared `assertLocalSupabase` used by integration and e2e | Reuse the project's fail-never-skip pattern | Research + Plan |
| Seed user | `createTestUser` (signUp, anon key) in the test, UI only for signin | No new secrets; signup UI is Phase 3 scope | Plan |
| Server | Preview build on port 4322 everywhere (build first locally) | Same runtime/cookies locally and in CI | Plan |
| CI wiring | Steps in existing job, after build, before smoke | Reuses Supabase + build; avoids smoke's port 4321 | Plan |
| Proof | All six checks executed in CI | Risk #6 is the phase goal; CI behavior must be observed, not inferred | Plan |
| Proof trigger | Add `workflow_dispatch`; dispatch throwaway `e2e-proof/*` branches | Branch pushes don't trigger CI today; deploy guard keeps dispatch safe | Plan |
| Seam fixes | smoke `/dashboard` assertion, wait-loop timeout fails, CLI pinned to 2.120.0, job renamed `local-stack` | All four touch the same job and are small | Plan |
| Diagnostics | Trace + screenshot on failure, artifact upload on failure | Red CI runs diagnosable without local repro | Plan |
| Script | `test:e2e`, not in `npm test`; root `TESTING.md` command list | e2e needs build + browser; knowledge kept in one file | Plan |

## Scope

**In scope:** Playwright install + config, shared preflight, one spec, `test:e2e`, `TESTING.md`, CI steps + artifact upload, `workflow_dispatch`, four seam fixes, six CI proof runs with recorded evidence, CLAUDE.md/test-plan updates.

**Out of scope:** more scenarios (wrong password, signup, signout, route-guard matrix), other browsers, retries, separate e2e job or browser cache, seed.sql users, any `src/` change, adding e2e to `npm test`.

## Architecture / Approach

Playwright `globalSetup` → `assertLocalSupabase("e2e")` (env, local host, auth health). `webServer` starts `npm run preview -- --port 4322`. The spec seeds a user via `createTestUser` (now also returning email/password), fills the signin form by label, and asserts the exact campaign URL plus the sign-out button. In CI the job runs: supabase start → integration → build → Chromium install → e2e → (artifact on failure) → smoke on 4321 → supabase stop.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Playwright + seed scenario green locally | Config, shared preflight, spec, `test:e2e`, `TESTING.md` | Secure-cookie/preview quirks in workerd |
| 2. CI wiring + seam fixes | e2e in `local-stack`, dispatch trigger, four seam fixes, green push to `main` | Push to `main` deploys; check rename may break branch protection |
| 3. CI proof runs + docs | `proof-runs.md` with P1–P6 run URLs; docs updated | P5 (no tests) may exit 0 → needs a guard and re-run |

**Prerequisites:** Docker + local Supabase, `.env` and `.dev.vars` with local values, `gh` authenticated, user approval for each push.
**Estimated effort:** ~2–3 sessions across 3 phases (Phase 3 is mostly waiting on CI runs).

## Open Risks & Assumptions

- `workflow_dispatch` works only after it lands on `main`, so Phase 2 must be pushed (and deployed) before proof runs.
- Local GoTrue rate limit (30 signups/signins per 5 min) is shared by integration, e2e and smoke in one job; e2e adds two calls.
- Playwright's exit code with zero tests is unverified; P5 decides whether a guard is needed.
- Renaming `smoke` → `local-stack` changes the required-check name if branch protection uses it.

## Success Criteria (Summary)

- A developer runs `npm run test:e2e` and sees `1 passed`; with Supabase down it fails naming Supabase.
- CI blocks deploy when the scenario fails, and `proof-runs.md` shows all five failure modes went red in real CI runs.
- S-01/S-02 can add scenarios by following test-plan §6.3 and `TESTING.md`.
