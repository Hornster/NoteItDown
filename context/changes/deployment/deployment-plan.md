---
status: in-progress
created_at: 2026-09-20
---

# First Production Deployment of NoteItDown to Cloudflare Workers

## Context

NoteItDown's foundation docs (`context/foundation/infrastructure.md`, `context/foundation/tech-stack.md`) already recommend and scaffold for Cloudflare Workers via `@astrojs/cloudflare`, but the app has never been deployed. This plan executes the first production deploy per `infrastructure.md`'s "Getting Started" section, and also wires GitHub Actions to auto-deploy on every push to `main` going forward, so future merges don't require a manual `wrangler deploy`.

Research (two Explore passes + a Plan pass, plus direct verification) found that most of the scaffolded config is already correct (adapter present, `nodejs_compat` + `compatibility_date: 2026-05-08` already past the documented middleware-bug threshold from `withastro/astro#14511`), but surfaced three real gaps, all resolved with the user:

1. `context/foundation/tech-stack.md` prose still says "Cloudflare Pages" (stale; frontmatter is already correct) → fix.
2. `.github/workflows/ci.yml` triggers on branch `master`, but this repo's actual branch is `main` (confirmed via `git status`) — CI (and the new deploy job) would silently never fire → fix to `main`.
3. `wrangler.jsonc`'s Worker `name` is still the starter default `10x-astro-starter` → rename to `note-it-down` (matches `project_name` in `tech-stack.md`) before the first deploy makes a URL live.
4. No production Supabase project exists yet → user will create one and supply credentials directly to `wrangler secret put` (never pasted to the agent).
5. Fresh Supabase projects default to email-confirmation ON, which breaks `scripts/smoke.mjs`'s signup→signin flow → turn confirmations off for now (matching local dev), with an explicit follow-up note to re-enable before real users are onboarded.

Per `infrastructure.md`'s own approval policy, the first production deploy requires human approval. This document records the plan; **execution is deliberately deferred until the user triggers it.**

## Steps

**Progress: steps 1–10 done (2026-09-20). App is live at https://note-it-down.crazedaerialcable.workers.dev, verified by full smoke pass. Only step 11 remains (user-performed GitHub repo secrets for CI auto-deploy).**

### 1. Fix stale doc: `context/foundation/tech-stack.md` — DONE
Replace the last sentence of the "Why this stack" paragraph:
- From: "Deployment defaults to Cloudflare Pages (the starter's own default) and CI runs on GitHub Actions with auto-deploy-on-merge, both accepted as-is for a solo build."
- To: "Deployment targets Cloudflare Workers (the adapter's current deployment model — Pages support was dropped in `@astrojs/cloudflare` v13+) and CI runs on GitHub Actions with auto-deploy-on-merge, both accepted as-is for a solo build."

### 2. Rename the Worker: `wrangler.jsonc` — DONE
Change `"name": "10x-astro-starter"` → `"name": "note-it-down"`. Safe pre-deploy (no secrets/traffic exist under the old name yet). Resulting public URL: `https://note-it-down.<subdomain>.workers.dev`.

### 3. Fix branch trigger: `.github/workflows/ci.yml` — DONE
Change both `on.push.branches` and `on.pull_request.branches` from `[master]` to `[main]`.

### 4. Add CI `deploy` job to `.github/workflows/ci.yml` — DONE
Append a new job, gated on `ci` + `smoke` succeeding, running only on push to `main`:
```yaml
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: [ci, smoke]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```
Notes: reuses the existing `SUPABASE_URL`/`SUPABASE_KEY` repo secrets (already required by the `ci` job) for the build step only — the Worker's *runtime* secrets (set once via `wrangler secret put`, step 7) persist on Cloudflare independently and are not re-supplied by CI. Uses plain `npx wrangler deploy` (already a pinned devDependency) rather than a third-party action, to match exactly what the user runs manually in step 9.

### 5. Create `context/deployment/deploy-plan.md` — DONE (stub; filled in progressively as later steps execute)
Per CLAUDE.md's foundation-paths convention, this is the output audit trail of the actual executed deploy (distinct from this planning document). Once execution happens, record there (secret *names* only, never values):
- Pre-deploy corrections made (steps 1–3)
- Supabase production project record (name, that URL/anon key were set as both Worker secrets and GH Actions repo secrets; email-confirmation setting = off, with a follow-up note to revisit before onboarding real users)
- Cloudflare record (Worker name `note-it-down`, deployed URL once known)
- Verification results (`wrangler dev` local check if done, `npm run smoke` result against the deployed URL)
- CI changes made (new `deploy` job, new repo secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`)
- Approval record (first production deploy approved by the user, dated)

### 6. User-performed: Cloudflare auth
User runs `npx wrangler login` themselves in their own terminal.

### 7. User-performed: create production Supabase project + set Worker secrets
- Create a free project at https://supabase.com/dashboard.
- Project Settings → API: grab **Project URL** and the **anon/public** key (not `service_role` — confirmed correct per `src/lib/supabase.ts`'s `@supabase/ssr` usage, which relies on RLS + session cookies).
- Authentication settings: turn **Confirm email** OFF for now — **follow-up: re-enable before real users are onboarded**, since this MVP-only relaxation should not persist once the app has real signups.
- Run, entering real values at the interactive prompt (never as CLI args):
  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```

### 8. Optional local sanity check
```bash
npm run build
npx wrangler dev
```
Reads `.dev.vars` if the user creates one locally from `.env.example` (already gitignored). Skippable.

### 9. First manual deploy
```bash
npm run build
npx wrangler deploy
```
Capture the printed `https://note-it-down.<subdomain>.workers.dev` URL for step 10 and for `context/deployment/deploy-plan.md`.

### 10. Post-deploy verification
```bash
BASE_URL=https://note-it-down.<subdomain>.workers.dev npm run smoke
```
With confirmations off (step 7), this should pass end-to-end (home page, auth-gate redirect, signup, wrong/right password signin, dashboard render, signout). Record the result in `context/deployment/deploy-plan.md`.

### 11. User-performed: GitHub secrets for CI deploy
- Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom token: **Account → Workers Scripts: Edit**, scoped to the specific account (not all accounts), no zone permissions needed (no custom domain yet).
- Add as GitHub repo secret `CLOUDFLARE_API_TOKEN`.
- Add `CLOUDFLARE_ACCOUNT_ID` as a repo secret too (from the Cloudflare dashboard sidebar or `npx wrangler whoami`), since CI is non-interactive and can't prompt for account selection.
- Confirm `SUPABASE_URL`/`SUPABASE_KEY` already exist as repo secrets (already required by the pre-existing `ci` job).

## Files to be changed by the agent (on execution)
- `context/foundation/tech-stack.md` — one-sentence prose fix
- `wrangler.jsonc` — rename Worker
- `.github/workflows/ci.yml` — branch fix + new `deploy` job
- `context/deployment/deploy-plan.md` — new audit-trail file, written after the real deploy happens

## Actions the user must perform themselves (credentials/interactive)
- `wrangler login`
- Creating the Supabase project and turning off email confirmation
- `wrangler secret put SUPABASE_URL` / `SUPABASE_KEY`
- Creating the Cloudflare API token and adding both it and `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets
- Confirming `SUPABASE_URL`/`SUPABASE_KEY` GitHub repo secrets already exist
- Giving explicit go-ahead immediately before `npx wrangler deploy` is run for the actual first production push, per `infrastructure.md`'s "first production deploy requires human approval"

## Verification (on execution)
- `npm run build` succeeds locally after the `wrangler.jsonc` rename.
- `npm run lint` and `npx astro check` still pass after doc/config edits (no code logic touched).
- `npx wrangler deploy` completes and returns a live `*.workers.dev` URL.
- `npm run smoke` (with `BASE_URL` set to that URL) passes all steps.
- After merging to `main`, confirm the new CI `deploy` job actually fires (branch-name fix) and completes successfully on GitHub Actions.
