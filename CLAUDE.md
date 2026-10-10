AGENTS.md is a symlink to this file — edit CLAUDE.md, not AGENTS.md.

## Hard rules

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.


## Foundation paths

- `context/foundation/tech-stack.md` — input (Lesson 2 hand-off, hard constraints)
- `context/foundation/prd.md` — input (Lesson 1 hand-off, soft weights)
- `context/foundation/infrastructure.md` — output (the third foundation contract)
- `context/deployment/deploy-plan.md` — output of Plan Mode deploy (audit trail of "what was supposed to happen")
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` — load-bearing names registry
- `context/foundation/roadmap.md` - sequence of tasks to implement. preparation, edge-to-edge slices, dependencies, blockers, unknowns. Not an execution plan itself, only a base for making one.
- `context/changes/<change-id>/plan.md` - per-change implementation plan. Architecture of a single slice, steps to execute, files.
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff


## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase.
- `npm run test:unit` — Vitest unit suite (`src/**/*.test.ts`). No external services required.
- `npm run test:hooks` — Vitest `hooks` project (`tests/hooks/`): proves the agent hooks below against stubbed eslint/vitest in a temp git repo. Needs `jq` and git, no Supabase.
- `npm run test:integration` — Vitest integration suite (`tests/integration/**/*.test.ts`). Requires local Supabase running (`npx supabase start`); refuses to run against a non-local `SUPABASE_URL` and fails loudly (not silently) if Supabase isn't reachable.
- `npm test` — runs every Vitest project: unit, hooks, integration (not e2e).
- `npm run test:e2e` — Playwright (Chromium) browser scenarios in `tests/e2e/` against the production preview on port 4322, which Playwright starts itself. Requires local Supabase and a fresh `npm run build`; first run needs `npx playwright install chromium`. Fails loudly (preflight error naming Supabase) when Supabase or env is missing.

Full testing command reference with prerequisites: `TESTING.md`.

`scripts/smoke.mjs` remains a smoke check only, not a substitute for the Vitest suites or the Playwright e2e scenarios above (README says so explicitly). There is no e2e coverage beyond the sign-in seed scenario yet.

Agent hooks (Claude Code; scripts in `.claude/hooks/`, registered in `.claude/settings.json`): after every Write/Edit, `lint-edited-file.sh` runs eslint (check-only) and `related-tests.sh` runs `vitest related <file> --run --project unit` on the edited file; at end of turn `end-of-turn.sh` (Stop) sweeps all changed and untracked files with one eslint and one related-tests run, skipping when nothing changed since the last green sweep. Failures exit 2 with stderr fed back to the agent. Restart the session after editing `settings.json`; use `/hooks` to inspect.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

ESLint uses `tseslint.strictTypeChecked` + `stylisticTypeChecked` (stricter than the default recommended config), with `no-console: "warn"`, unused-vars ignored via `^_` prefix, and `no-misused-promises` allowing void-returning handlers (e.g. `onClick={asyncFn}`). Prettier: 120 print width, double quotes, trailing commas everywhere.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

Integrations: `@astrojs/react`, `@astrojs/cloudflare`, `@astrojs/sitemap`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared `optional: true` in astro.config.mjs `env.schema` — a missing value fails at runtime, not at build time).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/campaigns/[campaignId]/index.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`, and on demand via `workflow_dispatch` (Actions → CI → Run workflow, or `gh workflow run ci.yml --ref <branch>`):
- `ci` — `npx astro sync`, lint, unit tests, hook proof (`npm run test:hooks`), `npx astro check`, then build. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- `local-stack` — starts local Supabase (CLI pinned), runs integration tests, builds, runs `npm run test:e2e` (uploads a `playwright-report` artifact with traces on failure), then `npm run smoke` against a preview on port 4321. No secrets needed.
- `deploy` — `npx wrangler deploy`, only on push to `main` after `ci` and `local-stack` pass; dispatched runs never deploy.

<!-- BEGIN @przeprogramowani/10x-cli -->

### Foundation paths used by this lesson

- `AGENTS.md` / `CLAUDE.md` (and per-area variants) — `/10x-agents-md` output
- `context/foundation/lessons.md` — `/10x-lesson` output (append-only register, consumed by future planning/review skills)
- `context/foundation/prd.md`, `context/foundation/tech-stack.md` — inputs from earlier lessons, still present
- `docs/reference/contract-surfaces.md` — load-bearing names registry (scaffolded by `/10x-init`)

## Triage

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

## Subagents usage

For implementation purposes with subagents aim to use Sonnet with Medium effort. For research and planning use Sonnet with High effort. Inform which subagent do you plan to instantiate.
<!-- END @przeprogramowani/10x-cli -->
