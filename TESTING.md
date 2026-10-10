# Testing

## Prerequisites

- Local Supabase running (`npx supabase start`, requires Docker) with `SUPABASE_URL` and `SUPABASE_KEY` in `.env` (or `.dev.vars` for Cloudflare local dev).
- For e2e: a fresh `npm run build` first; locally e2e reuses any server already listening on port 4322, so stop stale preview/dev servers and rebuild before running it.

## Unit and integration (Vitest)

- `npm run test:unit` runs the unit suite (`src/**/*.test.ts`) with no external services.
- `npm run test:integration` runs the integration suite (`tests/integration/**/*.test.ts`) against local Supabase and fails loudly if it is not reachable.
- `npm test` runs every Vitest project (unit, hooks, integration); it does not include e2e.

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
