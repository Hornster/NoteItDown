# Auth Risk Tests — Plan Brief

> Full plan: `context/changes/auth-risk-tests/plan.md`
> Research: `context/changes/auth-risk-tests/research.md`

## What & Why

Roadmap S-01 / test-plan Phase 3 (Risks #2 and #4): give every auth risk scenario — protected-route redirect, API 401, signed-out access, signup, signin, signout, session revocation — a named test that runs in CI on push. prd-v2 requires these tests to land before S-04 (constants sweep) and S-05 (theme revamp) edit auth routes and pages.

## Starting Point

Pages are guarded by a 4-prefix middleware list; API handlers self-guard with a JSON 401. The only coverage is `scripts/smoke.mjs`, which probes 3 of 12 protected pages and 1 of 10 API handlers, accepts any 302 on signout, and never proves the server revoked a signed-out session. E2E has one sign-in scenario.

## Desired End State

A new `npm run test:http` suite enumerates every route from `src/pages` and proves that anonymous requests and replayed pre-signout cookies are denied everywhere (302 `/auth/signin` for pages, 401 JSON for APIs), so a new unguarded route fails CI automatically. E2E walks the full signup → signin → Sign out → redirect chain and pins user-approved error wording. Smoke's false greens are gone.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Matrix placement | New Vitest `http` project, own preview on port 4323, CI step after `build` | Matches the test plan's "HTTP-level integration" layer and stays independent of Playwright's and smoke's servers | Plan (user) |
| Route list | Derived from `src/pages` file tree + exported methods, small public allowlist | Hand-picked lists are the named anti-pattern; derivation covers future routes | Research |
| Smoke (S-01 open unknown) | Fix seams (exact signout location, clear jar before signin), keep all steps | Smoke stays a self-contained post-upgrade check without false greens | Plan (user) |
| Error-message oracle | Visible UI text, approved by the user as a baseline during Phase 3 | Avoids copying expected wording from the code under test | Plan (user) |
| Known defects | Tests only; no `src/` edits; defects logged as S-04 follow-ups, not pinned | Honors "tests before auth edits" without freezing bugs into green tests | Plan (user) |
| API 401 assertion | Status + JSON `{ error: string }` shape, not wording | Contract-surfaces defines the 401; the wording is code, not a baseline | Plan |
| Revocation proof | Sign in via the app, snapshot cookies, sign out, replay on every route, with a positive control | Distinguishes "server revoked" from "client dropped the cookie" | Research |
| Drift guard | No separate unit test; the file-tree matrix fails on an escaped route | Avoids two tests for one invariant | Plan |

## Scope

**In scope:**
- `tests/http/` project (server lifecycle, request/cookie helpers, route inventory, anonymous + revocation matrices, path variants)
- `tests/e2e/auth-session.spec.ts` (session chain, wrong-password and duplicate-signup wording)
- Smoke seam fixes; CI step; TESTING.md, CLAUDE.md, test-plan §3/§4/§5/§6.4/§6.6

**Out of scope:**
- Any `src/` change (zod on auth endpoints, segment-boundary matcher, `MESSAGES` mapping, literal-401 cleanup → S-04)
- CSRF/origin rejection tests, crafted JWTs, Content-Type checks
- Retiring smoke steps; cross-user isolation (S-02)

## Architecture / Approach

The `http` globalSetup checks local Supabase, `dist/` and a free port 4323, then spawns `npm run preview` there and kills it on teardown. Tests use raw `fetch` with `redirect: "manual"`, an `Origin` header and a smoke-style cookie jar. `route-inventory.ts` maps `src/pages` files to concrete URLs (dynamic segments become a zero UUID) and splits them into page, API and public routes. CI order in `local-stack`: integration → build → **http** → e2e → smoke.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. HTTP project + anonymous matrix | `npm run test:http` in CI; every page/API denied anonymously | Preview spawn/teardown flakiness on 4323 |
| 2. Revocation + path variants | Replayed pre-signout cookies denied everywhere; normalization pinned | GoTrue might not reject a revoked access token — would be a real finding |
| 3. E2E session chain + messages | UI chain through Sign out; approved error wording | Hydration timing; baseline text needs user sign-off |
| 4. Smoke seams + docs | Discriminating smoke; cookbook §6.4 | — |

**Prerequisites:** F-01 done; `npx supabase start`; a fresh `npm run build`; `npx playwright install chromium`.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- The shared GoTrue budget (30 auth calls per 5 min per IP) must cover integration + http (2) + e2e (7) + smoke (3); count it before wiring CI.
- Revocation assumes `signOut()` (global scope) invalidates the access token for `getUser()`; if it doesn't, stop and report instead of loosening the test.
- Path-variant expectations rest on `astro@7.3.2` internals (research §1); an upgrade may legitimately change 302 vs 404, but never to 200.

## Success Criteria (Summary)

- A new page outside the guarded prefixes, or an API handler missing its user check, fails CI by name.
- Signed-out cookies are proven useless server-side on every protected route.
- Signup → signin → signout → redirect works through the UI with user-approved error wording, and smoke no longer passes on a wrong signout.
