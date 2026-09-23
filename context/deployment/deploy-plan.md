---
status: done
created_at: 2026-09-20
---

# First Production Deployment — Audit Trail

Executed deploy record for `context/changes/deployment/deployment-plan.md`. This file records what actually happened; the other file records what was planned.

## Pre-deploy corrections (steps 1–3)

- `context/foundation/tech-stack.md`: fixed stale "Cloudflare Pages" prose → "Cloudflare Workers". Done.
- `wrangler.jsonc`: Worker `name` changed `10x-astro-starter` → `note-it-down`. Done.
- `.github/workflows/ci.yml`: branch triggers changed `master` → `main`; new `deploy` job added (gated on `ci` + `smoke`, push to `main` only). Done.

## Supabase production project

- Project name: user-created directly in Supabase dashboard (not recorded here — no need for agent to know it).
- Project URL: set as Worker secret `SUPABASE_URL` via `wrangler secret put` — done (user-performed).
- Anon/public key: set as Worker secret `SUPABASE_KEY` via `wrangler secret put` — done (user-performed; secret **names** only recorded here, never values).
- GitHub repo secrets `SUPABASE_URL` / `SUPABASE_KEY` for CI — still to be confirmed present (step 11, not yet done).
- Email confirmation: assumed turned OFF per plan step 7 (user-performed) — **not yet independently confirmed**, since the signup smoke step never got far enough to test it (blocked by the signups-disabled issue below).
  - **Follow-up (tracked, not yet done):** re-enable email confirmation before real users are onboarded.
- **Issue found during verification, resolved 2026-09-20:** Supabase project initially had **new signups disabled** ("Signups not allowed for this instance" — a distinct setting from email confirmation, under Authentication → Sign In / Providers → "Allow new users to sign up"). User enabled it in the Supabase dashboard; re-run of smoke test (below) confirms the fix.

## Cloudflare

- Worker name: `note-it-down`
- Deployed URL: **https://note-it-down.crazedaerialcable.workers.dev**
- KV Namespace `SESSION` auto-provisioned on first deploy (`note-it-down-session`).
- Deploy completed 2026-09-20, Version ID `a61dc147-1c4b-4bca-907b-a934424f189c`.

## Verification

- `wrangler dev` local check (step 8): done — home page 200, unauthenticated `/dashboard` redirects 302. Passed.
- `npm run smoke` against deployed URL (step 10):
  - First run, 2026-09-20: **2 of 8 steps failed** (signup + downstream dashboard-render step), root-caused to Supabase signups being disabled — see Supabase section above. One additional pre-existing smoke-script false-pass noted and left unfixed (see below).
  - Re-run, 2026-09-20, after user enabled signups in Supabase: **all 8 steps passed** (home renders, dashboard redirect, signup creates account → /auth/confirm-email, signin rejects wrong password, signin accepts correct password → /, dashboard renders for signed-in user, signout clears session, dashboard redirects after signout). Deploy fully verified.
  - **Known pre-existing smoke-script issue (not blocking, not fixed as part of this work):** `scripts/smoke.mjs` line 66 checks `actual.location.startsWith(expected.location)`; the "signin accepts correct password" step's `expected.location` is `"/"`, which matches any redirect path, so that step would false-PASS even if signin failed. Confirmed during the first (failing) run — worth a follow-up script fix separately.

## CI changes

- New `deploy` job added to `.github/workflows/ci.yml` (gated on `ci` + `smoke`, `push` to `main`).
- New repo secrets added by user (step 11, done 2026-09-20): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- `SUPABASE_URL` / `SUPABASE_KEY` repo secrets: **not already present as assumed** — the `ci` job's local-Supabase smoke job doesn't need them, so they'd never been added. User added both as repo secrets during step 11 so the new `deploy` job's build step can use them.
- **Verified**: pushed commit `6bcd6a9` to `main` (GitHub Actions run [35526322529](https://github.com/Hornster/NoteItDown/actions/runs/35526322529)) — all three jobs (`ci`, `smoke`, `deploy`) passed. Auto-deploy-on-merge to Cloudflare Workers confirmed working end to end.

## Schema migration — campaign-notes-schema (F-01)

- Migration `supabase/migrations/20260922120000_campaign_notes_schema.sql` pushed to production, 2026-09-22 (user-performed `supabase link --project-ref xxnftruwtalhjmhblmlq` + `supabase db push`, using a personal access token; token not stored here).
- `supabase migration list` against the linked remote confirms `20260922120000` applied on both `local` and `remote`.
- Backfill verified in production Studio: 2/2 existing `auth.users` rows each own exactly 1 `campaigns` row and 4 `note_types` rows (NPC, Place, Quest, Observation, `is_predefined = true`).
- Worker rollback does not revert this migration (per `infrastructure.md`'s rollback caveat) — a future down-migration would be needed to undo it.

## Approval record

- First production deploy: plan reviewed with user per `infrastructure.md`'s approval policy. Explicit go-ahead given immediately before `npx wrangler deploy` (step 9), 2026-09-20. Deploy executed and verified successfully.
