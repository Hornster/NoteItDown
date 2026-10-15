# Testing

## Prerequisites

- Local Supabase running (`npx supabase start`, requires Docker) with `SUPABASE_URL` and `SUPABASE_KEY` in `.env` (or `.dev.vars` for Cloudflare local dev).
- For http and e2e: a fresh `npm run build` first; locally e2e reuses any server already listening on port 4322, so stop stale preview/dev servers and rebuild before running it.

## Unit and integration (Vitest)

- `npm run test:unit` runs the unit suite (`src/**/*.test.ts`) with no external services.
- `npm run test:integration` runs the integration suite (`tests/integration/**/*.test.ts`) against local Supabase and fails loudly if it is not reachable.
- `npm test` runs the unit, hooks and integration projects; not `http` (needs a build) and not e2e.

## HTTP route guard (Vitest `http`)

- Prerequisites: local Supabase running, a fresh `npm run build`, and port 4323 free (the project starts its own production preview there; stop stale servers first).
- `npm run test:http` runs `tests/http/**/*.test.ts`: an anonymous route matrix derived from the `src/pages` file tree (every non-public page redirects to sign-in, every API handler returns 401) plus session-revocation and path-variant checks, and a signed-in forged-ID matrix (`tests/http/forged-id.test.ts`: user B's session on user A's campaign, note and image ids must get 404 with no A data). Public pages are listed in `PUBLIC_ROUTES` (`tests/http/support/route-inventory.ts`).
- Fails loudly when Supabase or env is missing; it never skips.

## Agent hooks proof (Vitest)

- `npm run test:hooks` runs `tests/hooks/agent-hooks.test.ts` (Vitest project `hooks`), which executes the real scripts in `.claude/hooks/` (per-edit lint, related tests, end-of-turn sweep).
- It runs them in a throwaway temp git repo with stubbed `node_modules/.bin/eslint` and `vitest`, so it needs no Supabase or real lint run. Requires `jq`, git ≥ 2.31 and bash ≥ 4 on `PATH` (the hooks themselves need the same; stock macOS bash 3.2 is too old).

## End-to-end (Playwright)

- `npx playwright install chromium` downloads the Chromium browser Playwright drives (once per machine or Playwright upgrade).
- `npm run test:e2e` runs the browser scenarios in `tests/e2e/` against the production preview on port 4322, which Playwright starts itself. Scenarios: sign-in and auth session chain, note create/edit/delete with the pinned relation-change notice wording, memory-map node click, and a forged note URL (`notes-relations.spec.ts`).
- `npm run test:screenshots` runs the on-demand `screenshots` Playwright project (`tests/e2e/screenshots/*.shot.ts`; `npm run test:e2e` pins `--project=chromium` and never runs it) against the same preview server and preflight. Needs local Supabase and a fresh `npm run build`. Writes full-page PNGs to `.screenshots/theme/<SHOT_LABEL>/` (git-ignored; `SHOT_LABEL` env, default `adhoc`), e.g. `SHOT_LABEL=before npm run test:screenshots`. Uses 2 auth calls per run.
- `npx playwright show-trace <zip>` opens a `trace.zip` downloaded from a failed CI run's `playwright-report` artifact.

## Smoke and infrastructure

- `npm run smoke` runs the dependency-free auth-flow check (`scripts/smoke.mjs`) against a running server at `BASE_URL` (default `http://localhost:4321`). Run it against the production preview (`npm run build && npm run preview`), as CI does — not against `astro dev` (see below).
- `npx supabase start` starts the local Supabase stack that the integration and e2e suites require.

### Known issue: `astro dev` fails the request after an unread request body

Under `astro dev`, a request whose body the handler never reads makes the **next** request on the same connection fail with a 500 `fetch failed` (Astro dev error page). The production preview and deployed Workers are not affected.

- **Mechanism**: `@cloudflare/vite-plugin` (1.63.0) forwards each dev request to workerd through `miniflare.dispatchFetch`, which uses undici (7.29.1). When the Worker responds without consuming the request body, the pooled connection is left dirty and the next dispatch on it throws `fetch failed` (stack: `undici/lib/web/fetch/index.js` ← `miniflare` `fetch4` ← `_Miniflare.dispatchFetch` ← `@cloudflare/vite-plugin`). The app code is never reached for the failing request.
- **Trigger in this app**: any API handler that returns early — 401, or 404 on a malformed id — before `await context.request.json()`, called with a body. Requests without a body, and requests whose body is read (including 400 validation errors), leave the connection healthy.
- **How it shows up**: smoke's "rename-campaign API 404s a malformed id" (PATCH with body, rejected before the body is read) poisons the connection, so the next step "edit-note API 404s a malformed note id" gets 500 instead of 404. Repeating that PATCH alternates 404, 500, 404, 500. Found 2026-10-11 during `auth-risk-tests` Phase 4.
- **Repro** (against `npx astro dev` on 4321): `PATCH /api/campaigns/not-a-uuid` with `Content-Type: application/json`, `Origin: http://localhost:4321` and body `{"name":"x"}` → 404; immediately `GET /` → 500 `fetch failed`; `GET /` again → 200.
- **Workaround**: run smoke, `test:http` and e2e against the production preview (they already do in CI). Expect occasional dev-only 500s after rejected requests while clicking through the UI under `astro dev`.
- **Possible fixes (not done)**: upgrade `@cloudflare/vite-plugin` / miniflare once fixed upstream (check for an existing issue first, file one with the repro if none), or drain the request body before early returns in API handlers. Tracked in `context/foundation/roadmap.md` → Observations.
