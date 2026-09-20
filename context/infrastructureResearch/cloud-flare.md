---
platform: Cloudflare Workers + Pages
researched_at: 2026-09-20
context: NoteItDown MVP infrastructure research (/10x-infra-research)
tech_stack:
  language: js/ts
  framework: Astro 7 SSR (@astrojs/cloudflare adapter)
  runtime: Cloudflare Workers
---

# Cloudflare Workers — Risk Findings

Anti-bias cross-check output from `/10x-infra-research` on the top-ranked platform recommendation (Cloudflare Workers) for NoteItDown's tech stack: Astro 7 SSR, React 19 islands, Supabase (external, via `@supabase/ssr`), Node.js v22.14.0, deployed via `wrangler deploy`.

## Devil's Advocate — Weaknesses

1. **Middleware bug threatens the auth gate.** `@astrojs/cloudflare` had a documented issue ([withastro/astro#14511](https://github.com/withastro/astro/issues/14511), closed) where the combination of `nodejs_compat` + `compatibility_date >= 2025-09-15` + Astro middleware returned `[object Object]` instead of a proper `Response`. This directly threatens `src/middleware.ts`, which resolves `locals.user` and redirects from `PROTECTED_ROUTES` on every request. If `compatibility_date` isn't pinned to `2026-02-19` or later (or the `disable_nodejs_process_v2` workaround flag isn't set), auth can silently break in production in a way that passes local `npm run dev` and has no test suite to catch it.
2. **Workers is not real Node.js.** `@supabase/ssr` already needs the `nodejs_compat` compatibility flag just to work (it touches Node's `stream` APIs). Any future dependency (e.g., image processing for FR-004 attachments) risks hitting the same class of incompatibility — discoverable only at deploy time, not at `npm run dev`/`npm run build`.
3. **10ms CPU-time-per-request ceiling on the free tier.** FR-007's exact-name-match scan (comparing new note text against every existing note name in a campaign) is a real risk if it ever runs synchronously in the request path on a campaign with hundreds of notes. A container-based platform wouldn't impose this limit; Workers does, and exceeding it kills the worker abruptly rather than timing out gracefully.
4. **Stale deployment-target hint.** `context/foundation/tech-stack.md` hints `deployment_target: cloudflare-pages`, but `@astrojs/cloudflare` v13+ dropped Pages deploy support entirely — the adapter targets Workers only now. A first deploy attempted via Pages tooling will fail outright until this is corrected.
5. **One-way architectural pull toward Cloudflare-native storage.** If cost or latency pressure later pushes toward R2/D1/KV (e.g., for image storage instead of Supabase Storage), that's a one-way move away from the portable, Supabase-only design the PRD's Access Control section currently assumes.

## Pre-Mortem — How This Could Fail

The team deployed NoteItDown's Astro SSR app on Cloudflare Workers via `@astrojs/cloudflare`. Locally, `npm run dev` ran fine under workerd and `npm run build` succeeded, so the solo after-hours developer shipped without a staging deploy. Auth broke in production: `middleware.ts` returned `[object Object]` instead of a `Response` because `compatibility_date` was left at the scaffolded default, colliding with `nodejs_compat`. Every dashboard request silently 500'd. With no e2e suite and no staging environment, the bug wasn't caught until real users hit `dashboard.astro` and saw blank pages — days after the "final" pre-deadline push. Debugging cost two evenings, since local workerd dev didn't reproduce the exact production `compatibility_date`. Separately, the stale `cloudflare-pages` hint led to a first deploy attempt via Pages, which failed outright since the adapter dropped Pages support in v13 — another half-evening lost re-reading the changelog to discover Workers was now the only supported target.

## Unknown Unknowns

- The Pages→Workers transition isn't a naming change — Pages-specific conventions (Pages Functions routing, `_routes.json`) don't carry over 1:1 to Workers; anything scaffolded assuming Pages semantics needs re-verification.
- `compatibility_date` isn't a set-once cosmetic config field — bumping it later (to pick up an unrelated Workers feature) can silently reintroduce or fix behavior like the middleware bug, so it deserves the same scrutiny as a dependency upgrade.
- The 10ms free-tier CPU limit is CPU *time*, not wall-clock time — `await`ing Supabase network I/O doesn't count against it, but synchronous JS work does; exceeding it kills the worker abruptly rather than timing out gracefully, which can look like a random intermittent bug.
- `astro:env/server` validates `SUPABASE_URL`/`SUPABASE_KEY` as `optional: true` per CLAUDE.md — a missing Workers secret fails at runtime, not at `npm run build` in CI, so it's only caught by the first real user request.
- Local `wrangler dev` and `wrangler deploy` can diverge subtly in `nodejs_compat` polyfill behavior between versions/compatibility dates — "works in dev" is necessary but not sufficient proof the same code path works once deployed.

## Concrete Mitigations (if Cloudflare is chosen)

- Pin `compatibility_date >= 2026-02-19` in `wrangler.jsonc`/`wrangler.toml` (or set `disable_nodejs_process_v2`) before first deploy, specifically because of the middleware bug above.
- Target Workers explicitly (not Pages) — update `context/foundation/tech-stack.md`'s stale `deployment_target: cloudflare-pages` hint once the platform decision is finalized.
- Do a real `wrangler deploy` to a preview/staging environment before the first production push, since local `wrangler dev` parity with production `compatibility_date` behavior is not guaranteed.
- Keep FR-007's matching logic async/off the hot request path if note volume per campaign grows large enough to approach the 10ms CPU budget.

## Supporting Research (context)

Full platform research summary (adapter status, CLI, pricing, MCP integration, GA/beta status per feature) is available in the `/10x-infra-research` session that produced this file — see `context/foundation/infrastructure.md` once written for the full scored comparison against other candidates.
