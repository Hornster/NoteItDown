---
project: note-it-down
researched_at: 2026-09-20
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: js/ts
  framework: Astro 7 (SSR, @astrojs/cloudflare adapter)
  runtime: Cloudflare Workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

NoteItDown's tech stack already targets Cloudflare Workers — `@astrojs/cloudflare` is the adapter in use, `npx wrangler deploy` is the documented deploy command, and GitHub Actions CI is already wired for auto-deploy-on-merge. Cloudflare Workers scored 5/5 on the agent-friendly criteria (CLI-first via `wrangler`, fully managed/serverless, markdown docs + `llms.txt`, deterministic deploy/rollback, official MCP servers), tying with Fly.io — but Cloudflare requires zero migration, while Fly.io would require swapping to `@astrojs/node`, writing and maintaining a Dockerfile, and rewriting CI. Given the interview's DX-over-cost priority and the project's 3-week, after-hours, solo timeline, avoiding a structural migration is itself the DX win. The free tier (100k requests/day) fully covers this MVP's small user scale at $0, and the one concrete platform-specific risk found (a documented Astro-middleware bug on Workers) has a known one-line fix rather than a structural cost.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Vercel | Pass | Pass | Partial | Pass | Partial | 3P/2Pt |
| Netlify | Partial | Pass | Pass | Partial | Pass | 3P/2Pt |
| Fly.io | Pass | Pass* | Pass | Pass | Pass | 5 Pass |
| Railway | Partial | Pass | Pass | Partial | Pass | 3P/2Pt |
| Render | Partial | Pass | Partial | Partial | Pass | 2P/3Pt |

\*Fly.io requires a Dockerfile + `@astrojs/node` — no OS patching needed, but materially more setup than the adapter-based platforms.

**Cloudflare Workers** — `wrangler deploy`/`rollback`/`tail` cover the full CLI-first loop; fully serverless (V8 isolates, no infra to patch); docs are published as markdown and `llms.txt`/`llms-full.txt`; deploys and rollbacks are deterministic by deployment ID; Cloudflare runs official hosted MCP servers (Workers, R2, KV, D1, DNS, Observability) with OAuth connection support.

**Vercel** — CLI (`vercel deploy`/`rollback`/`logs`) and the `@astrojs/vercel` adapter are both GA and mature; docs are web-only with no markdown/`llms.txt` mirror found (Partial); Vercel MCP is public beta with mutating tools only added mid-2026 (Partial). Hobby tier explicitly disallows commercial use, pushing real cost to ~$20-30/mo on Pro.

**Netlify** — `netlify deploy`/`logs` are GA CLI commands and the official `netlify-mcp` server is vendor-stated GA; but CLI-driven rollback is undocumented (rollback is a dashboard "Publish Deploy" action), which weakens both CLI-first and deploy-API scores (Partial/Partial).

**Fly.io** — Ties Cloudflare on the matrix (full VM control, `flyctl` covers deploy/rollback/logs, markdown docs + `llms.txt`, official `fly mcp server`), but has had no free tier since Oct 2024, defaults to scale-to-zero cold starts, and has no official Astro adapter — deployment requires `@astrojs/node` plus a maintained Dockerfile.

**Railway** — `railway` CLI covers deploy/logs/restart but rollback to an arbitrary past deployment is dashboard-only (Partial/Partial); official MCP server (`mcp.railway.com`) is recently launched. Requires swapping to `@astrojs/node`; the default builder (Nixpacks) has had reported Node-22 version-pinning bugs.

**Render** — CLI covers most operations but rollback via CLI/API doesn't disable autodeploy, so a subsequent autodeploy can silently re-apply the rolled-back change (Partial); `llms.txt` support is explicitly labeled experimental (Partial). Free tier has 30-60s cold starts after 15 minutes idle.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Zero migration cost from the current scaffold, 5/5 on the agent-friendly criteria, a free tier that fully covers this MVP's traffic, and official MCP server support. The adapter's Pages→Workers transition (v13+ dropped Pages support) and a documented middleware/`nodejs_compat` interaction are real risks, but both have known, concrete fixes — see the cross-check and risk register below.

#### 2. Vercel

Best-in-class CLI/rollback maturity and one of the most polished DX stories in the industry, with a GA `@astrojs/vercel` adapter. The gap versus Cloudflare is migration cost (adapter swap required) and real dollar cost — the free Hobby tier's non-commercial-use restriction pushes a genuine MVP to the ~$20-30/mo Pro tier.

#### 3. Railway

Solid DX, official MCP server, and predictable ~$5/mo pricing once past the trial. The gap versus Cloudflare is a full runtime migration (swap to `@astrojs/node`, no adapter), dashboard-only rollback for arbitrary past deployments, and a beta next-gen builder (Railpack) sitting alongside a default builder (Nixpacks) with reported Node-22 quirks.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Middleware bug threatens the auth gate.** `@astrojs/cloudflare` had a documented issue ([withastro/astro#14511](https://github.com/withastro/astro/issues/14511), closed) where `nodejs_compat` + `compatibility_date >= 2025-09-15` + Astro middleware returned `[object Object]` instead of a proper `Response`. This directly threatens `src/middleware.ts`, which resolves `locals.user` and redirects from `PROTECTED_ROUTES` on every request. If `compatibility_date` isn't pinned to `2026-02-19`+ (or the `disable_nodejs_process_v2` workaround flag set), auth can silently break in production — and there's no test suite to catch it.
2. **Workers is not real Node.js.** `@supabase/ssr` already needs `nodejs_compat` to work (it touches Node's `stream` APIs). Any future dependency (e.g., image processing for FR-004 attachments) risks hitting the same class of incompatibility, discoverable only at deploy time.
3. **10ms CPU-time-per-request ceiling on the free tier.** FR-007's exact-name-match scan (comparing new note text against every existing note name in a campaign) is a real risk if it ever runs synchronously in the request path on a campaign with hundreds of notes — a container-based platform wouldn't impose this limit.
4. **Stale deployment-target hint.** `context/foundation/tech-stack.md` hints `deployment_target: cloudflare-pages`, but `@astrojs/cloudflare` v13+ dropped Pages deploy support entirely. A first deploy attempted via Pages tooling fails outright until this is corrected.
5. **One-way pull toward Cloudflare-native storage.** If cost or latency pressure later pushes toward R2/D1/KV (e.g., image storage instead of Supabase Storage), that's a one-way move away from the portable, Supabase-only design the PRD's Access Control section currently assumes.

### Pre-Mortem — How This Could Fail

The team deployed NoteItDown's Astro SSR app on Cloudflare Workers via `@astrojs/cloudflare`. Locally, `npm run dev` ran fine under workerd and `npm run build` succeeded, so the solo after-hours developer shipped without a staging deploy. Auth broke in production: `middleware.ts` returned `[object Object]` instead of a `Response` because `compatibility_date` was left at the scaffolded default, colliding with `nodejs_compat`. Every dashboard request silently 500'd. With no e2e suite and no staging environment, the bug wasn't caught until real users hit `dashboard.astro` and saw blank pages — days after the "final" pre-deadline push. Debugging cost two evenings, since local workerd dev didn't reproduce the exact production `compatibility_date`. Separately, the stale `cloudflare-pages` hint led to a first deploy attempt via Pages, which failed outright since the adapter dropped Pages support in v13 — another half-evening lost re-reading the changelog to discover Workers was now the only supported target.

### Unknown Unknowns

- The Pages→Workers transition isn't a naming change — Pages-specific conventions (Pages Functions routing, `_routes.json`) don't carry over 1:1 to Workers; anything scaffolded assuming Pages semantics needs re-verification.
- `compatibility_date` isn't a set-once cosmetic config field — bumping it later (to pick up an unrelated Workers feature) can silently reintroduce or fix behavior like the middleware bug, so it deserves the same scrutiny as a dependency upgrade.
- The 10ms free-tier CPU limit is CPU *time*, not wall-clock time — `await`ing Supabase network I/O doesn't count against it, but synchronous JS work does; exceeding it kills the worker abruptly rather than timing out gracefully, which can look like a random intermittent bug.
- `astro:env/server` validates `SUPABASE_URL`/`SUPABASE_KEY` as `optional: true` per CLAUDE.md — a missing Workers secret fails at runtime, not at `npm run build` in CI, so it's only caught by the first real user request.
- Local `wrangler dev` and `wrangler deploy` can diverge subtly in `nodejs_compat` polyfill behavior between versions/compatibility dates — "works in dev" is necessary but not sufficient proof the same code path works once deployed.

(Full findings, plus a parallel cross-check run on Fly.io as the runner-up alternative considered during this research, are recorded in `context/infrastructureResearch/cloud-flare.md` and `context/infrastructureResearch/fly-io.md`.)

## Operational Story

- **Preview deploys**: `wrangler versions upload` publishes a new Worker version with a unique preview URL without shifting production traffic to it — usable for PR/branch verification before merge. Production promotion happens via `wrangler deploy` (or `wrangler versions deploy` to route traffic to an already-uploaded version). The existing GitHub Actions CI (`ci_default_flow: auto-deploy-on-merge`) should call `wrangler deploy` on merge to `main`; adding a preview-upload step on PRs is a small CI addition, not yet configured.
- **Secrets**: Local dev secrets live in `.dev.vars` (gitignored, per CLAUDE.md). Production secrets are set via `wrangler secret put SUPABASE_URL` / `wrangler secret put SUPABASE_KEY` (stored encrypted by Cloudflare, readable only by the Worker at runtime and by accounts with Cloudflare dashboard/API token access). CI needs `SUPABASE_URL`/`SUPABASE_KEY` as GitHub Actions repository secrets (already required per CLAUDE.md's CI section). Rotation: re-run `wrangler secret put` with the new value; no automatic expiry.
- **Rollback**: `wrangler rollback [deployment-id]` reverts to the previous (or a specified) deployment almost instantly. Caveat: Supabase schema migrations do not roll back automatically alongside a Worker rollback — a rollback that crosses a migration boundary needs a manual, separate migration revert.
- **Approval**: Human approval required for: rotating `SUPABASE_KEY` (has account-wide blast radius), the first production deploy, and any destructive Supabase migration (dropping/altering columns with data loss). An agent may perform unattended: PR preview deploys (`wrangler versions upload`), read-only log tailing, and additive (non-destructive) migrations that go through normal PR review.
- **Logs**: `wrangler tail` streams live production logs read-only (`wrangler tail --status error` to filter to failures). Cloudflare's official Workers Observability MCP server exposes the same data as structured tool calls for an agent, once connected via OAuth.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Astro middleware returns `[object Object]` instead of a `Response`, silently breaking the auth gate | Devil's advocate | L | H | Pin `compatibility_date >= 2026-02-19` (or set `disable_nodejs_process_v2`) in `wrangler.jsonc`/`wrangler.toml` before first deploy; verify via a real preview deploy, not just local `wrangler dev` |
| Stale `deployment_target: cloudflare-pages` hint causes first deploy attempt to fail (adapter dropped Pages support in v13) | Research finding | H | M | Update `context/foundation/tech-stack.md`'s hint to Workers; target `wrangler deploy` explicitly from the start |
| FR-007's exact-name matching hits the free tier's 10ms CPU-time-per-request ceiling as campaigns grow | Devil's advocate | L (now) / M (at scale) | M | Keep matching logic efficient and off the synchronous hot path; monitor Worker CPU usage; paid plan raises the CPU limit if needed |
| Missing/misconfigured `SUPABASE_URL`/`SUPABASE_KEY` Workers secret fails at runtime, not build time | Unknown unknowns | M | H | Run `npm run smoke` against the deployed preview URL before promoting to production; CI already requires the secrets per CLAUDE.md's CI section |
| Local `wrangler dev` and `wrangler deploy` diverge in `nodejs_compat` polyfill behavior across compatibility dates | Unknown unknowns | L | M | Always do a real `wrangler deploy`/`versions upload` to a preview environment before relying on local dev as proof of correctness |
| Future storage needs pull toward Cloudflare-native R2/D1, eroding the portable Supabase-only design | Devil's advocate | L | L | Treat R2/D1 adoption as an explicit, reviewed architecture decision, not a default; keep Supabase as the system of record per the PRD's Access Control section |

## Getting Started

1. Confirm the `@astrojs/cloudflare` adapter is present (it should already be, via the 10x-astro-starter scaffold); if not, run `npx astro add cloudflare`.
2. In `wrangler.jsonc`/`wrangler.toml`, set `compatibility_flags: ["nodejs_compat"]` (required for `@supabase/ssr`) and pin `compatibility_date` to `2026-02-19` or later (or add `disable_nodejs_process_v2`) to avoid the middleware bug documented above.
3. Correct the stale hint: update `context/foundation/tech-stack.md`'s `deployment_target` from `cloudflare-pages` to Workers, since the adapter no longer supports Pages deploys as of v13.
4. Set secrets: populate `.dev.vars` locally (gitignored), run `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY` for production, and confirm `SUPABASE_URL`/`SUPABASE_KEY` exist as GitHub Actions repository secrets for CI.
5. Deploy once manually with `npx wrangler deploy` to verify end-to-end, then run `npm run smoke` (with `BASE_URL` pointed at the deployed URL) before relying on CI's auto-deploy-on-merge for subsequent pushes.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
