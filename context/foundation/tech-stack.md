---
starter_id: 10x-astro-starter
package_manager: npm
project_name: note-it-down
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

NoteItDown is a solo, after-hours, 3-week MVP for a small-scale web app requiring login-gated per-account data (FR-001/FR-002) and optional image attachments (FR-004) — no payments, realtime collaboration, AI/NLP matching (explicitly excluded per Non-Goals), or background jobs. 10x Astro Starter is the recommended default for `(web, js)` and clears all four agent-friendly gates: it bundles Supabase (Postgres + auth + storage) and Cloudflare edge deploy out of the box, covering auth and image storage without extra integration work, which fits the tight timeline. Its bootstrapper confidence is first-class — expect mostly-smooth scaffolding with occasional manual steps. Deployment defaults to Cloudflare Pages (the starter's own default) and CI runs on GitHub Actions with auto-deploy-on-merge, both accepted as-is for a solo build.
