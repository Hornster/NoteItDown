---
platform: Fly.io
researched_at: 2026-09-20
context: NoteItDown MVP infrastructure research (/10x-infra-research)
tech_stack:
  language: js/ts
  framework: Astro 7 SSR (would require switching to @astrojs/node + Dockerfile)
  runtime: Fly.io Firecracker VMs
---

# Fly.io — Research & Risk Findings

Fly.io scored 5/5 on the agent-friendly criteria matrix (CLI-first via `flyctl`, GA managed VMs, markdown docs + `llms.txt`, deterministic `fly deploy`/rollback, official `fly mcp server`) — tied with Cloudflare Workers. It was not selected for the top-3 shortlist in the first pass because it requires abandoning the tech stack's current `@astrojs/cloudflare` adapter entirely, in favor of `@astrojs/node` plus a maintained Dockerfile. Anti-bias cross-check below, run against this project's specific constraints: Astro 7 SSR, React 19 islands, Supabase (external, via `@supabase/ssr`), Node.js v22.14.0, solo/after-hours 3-week MVP timeline, no realtime/background-job requirement.

## Platform Facts (from research)

- No native Astro adapter — supported path is `npx astro add node` (`@astrojs/node`, SSR/`output: "server"`) + `fly launch`, which auto-generates a Dockerfile and `fly.toml` if none exists.
- CLI: `fly launch`, `fly deploy`, rollback via `fly releases --image <old>` (no dedicated rollback subcommand), `fly logs` for live tailing.
- Docs available as markdown (`/docs/<path>.md`) plus `fly.io/llms.txt`.
- **No free tier since Oct 7, 2024** — only a 2-VM-hour/7-day trial. Pay-as-you-go: shared-cpu-1x/256MB ≈ $2/mo running 24/7, egress $0.02/GB, volumes $0.15/GB-mo.
- WebSockets/persistent processes fully supported (not needed for this project).
- `auto_stop_machines` (scale-to-zero) is GA and the default — trades cost for cold starts unless `min_machines_running` is set.
- Official `fly mcp server` CLI subcommand for Claude Code/Desktop integration.

## Devil's Advocate — Weaknesses

1. **Full migration cost inside a 3-week, after-hours, solo timeline.** The project currently uses `@astrojs/cloudflare`, `wrangler deploy` in CI (GitHub Actions, auto-deploy-on-merge), and Workers-native `astro:env/server` secrets. Moving to Fly.io means swapping to `@astrojs/node`, writing and maintaining a Dockerfile, translating `SUPABASE_URL`/`SUPABASE_KEY` to `fly secrets set`, and rewriting the CI deploy step — a real chunk of a tight budget where every after-hours evening counts.
2. **No free tier since Oct 2024.** Real dollar cost from day one (~$2/mo baseline plus egress) versus Cloudflare Workers' free tier (100k requests/day), which fully covers this MVP's small-scale traffic at $0.
3. **Scale-to-zero cold starts by default.** `auto_stop_machines` is on by default; a low-traffic solo MVP will see idle cold starts unless `min_machines_running` is explicitly set — which then erodes the cost advantage that made scale-to-zero attractive.
4. **No official adapter means ongoing Dockerfile ownership.** Base image updates and security patching become the developer's responsibility, something a fully managed adapter-based platform (Cloudflare, Vercel, Netlify) absorbs automatically.
5. **Fly Postgres is explicitly "not managed Postgres."** Not relevant today since Supabase is external, but signals Fly's own data-layer story is less turnkey than competitors if ever reconsidered.

## Pre-Mortem — How This Could Fail

The team switched to Fly.io mid-build after the Cloudflare cross-check flagged a middleware bug. The switch required writing a Dockerfile, swapping `@astrojs/cloudflare` for `@astrojs/node`, rewriting the GitHub Actions workflow, and manually moving Supabase credentials into `fly secrets set`. This ate three of the twenty-one after-hours days budgeted for the entire MVP. Once deployed, `auto_stop_machines` was left at its default, so the app's first request after any idle period took 5-10 seconds to cold-start a VM — noticeable and embarrassing during a demo to a prospective user. Turning on `min_machines_running=1` fixed the cold start but pushed the "no free tier" always-on cost above what the solo developer had budgeted for a project with no revenue yet. In hindsight, the Cloudflare middleware bug that triggered the switch had a one-line fix (`compatibility_date` pin), and the switch cost far more time than the original bug would have.

## Unknown Unknowns

- `fly launch`'s auto-generated Dockerfile and `fly.toml` aren't regenerated on later Astro/adapter upgrades — they can silently drift (wrong Node version, stale entrypoint path) unless manually kept in sync.
- Fly doesn't know where the external Supabase project lives — picking a Fly region far from Supabase's region silently adds round-trip latency to every database-touching request, undiagnosed unless the developer checks region alignment themselves.
- Fly bills by machine uptime (CPU-seconds/RAM), not requests — for a spiky, low-volume hobby-scale app this can make cost *harder* to predict than a request-based free tier; a stuck process or errant loop keeps burning cost even at zero real traffic.
- `fly deploy` does a rolling VM replacement, not Workers' near-instant atomic deploy — it can briefly 5xx in-flight requests during cutover unless health checks and deploy strategy are explicitly tuned, which the default `fly launch` scaffold doesn't necessarily configure correctly out of the box.
- Volumes (if ever added) are tied to a specific physical host/region and don't trivially move — irrelevant today (Supabase holds all state) but becomes a real constraint if local caching or file storage on Fly is ever added directly.

## Comparison Note vs. Cloudflare

Both platforms score 5/5 on the agent-friendly criteria. The deciding factors are: (a) Cloudflare requires zero migration from the current scaffold, Fly requires a full adapter + Dockerfile + CI rewrite; (b) Cloudflare's free tier is genuinely free at this project's scale, Fly has no free tier; (c) Cloudflare's risk (the middleware bug) has a known one-line fix, while Fly's main risks (migration time, cold starts, Dockerfile upkeep) are structural rather than a single patch.
