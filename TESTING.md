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
- `npm run test:http` runs `tests/http/**/*.test.ts`: an anonymous route matrix derived from the `src/pages` file tree (every non-public page redirects to sign-in, every API handler returns 401) plus session-revocation and path-variant checks. Public pages are listed in `PUBLIC_ROUTES` (`tests/http/support/route-inventory.ts`).
- Fails loudly when Supabase or env is missing; it never skips.

## Agent hooks proof (Vitest)

- `npm run test:hooks` runs `tests/hooks/agent-hooks.test.ts` (Vitest project `hooks`), which executes the real scripts in `.claude/hooks/` (per-edit lint, related tests, end-of-turn sweep).
- It runs them in a throwaway temp git repo with stubbed `node_modules/.bin/eslint` and `vitest`, so it needs no Supabase or real lint run. Requires `jq`, git ≥ 2.31 and bash ≥ 4 on `PATH` (the hooks themselves need the same; stock macOS bash 3.2 is too old).

## End-to-end (Playwright)

- `npx playwright install chromium` downloads the Chromium browser Playwright drives (once per machine or Playwright upgrade).
- `npm run test:e2e` runs the browser scenarios in `tests/e2e/` against the production preview on port 4322, which Playwright starts itself.
- `npx playwright show-trace <zip>` opens a `trace.zip` downloaded from a failed CI run's `playwright-report` artifact.

## Smoke and infrastructure

- `npm run smoke` runs the dependency-free auth-flow check (`scripts/smoke.mjs`) against a running server at `BASE_URL` (default `http://localhost:4321`).
- `npx supabase start` starts the local Supabase stack that the integration and e2e suites require.
