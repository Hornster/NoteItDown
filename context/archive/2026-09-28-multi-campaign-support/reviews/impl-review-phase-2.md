<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-Campaign Support Implementation Plan

- **Plan**: context/changes/multi-campaign-support/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated criteria were re-run on 2026-09-29 against the current tree, which is HEAD (Phase 3 included) plus uncommitted Phase 1 triage edits:
- `test:unit`: 33/33 passed
- `test:integration`: 47/47 passed
- `lint`: clean
- `astro check`: 0 errors
- `build`: OK
- `smoke` against the preview: 13/13 steps passed
- 2.7 grep: no matches

All 8 "Changes Required" items match the plan. There are no scope-guardrail violations.

## Findings

### F1 — Redirect endpoints have no DB-error handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.ts:17 (also map.ts:17, notes/new.ts:18, notes/[id].ts:16, campaigns/index.ts:17)
- **Detail**: `resolveLandingCampaign` and `getNote` throw on any PostgREST error, and the endpoints don't catch it. A transient Supabase failure on `/dashboard`, the post-sign-in target, therefore gives Astro's default 500 page. This is not a regression: the old `dashboard.astro` called the throwing `getActiveCampaign` with no catch. The nested pages behave the same way.
- **Fix A ⭐ Recommended**: Accept this as a known risk; throwing services plus the framework 500 is the existing project-wide convention.
  - Strength: Consistent with every page and service in the repo. Zero churn.
  - Tradeoff: A user may see a raw 500 during a Supabase blip.
  - Confidence: HIGH — the pattern predates this change (`git show 972f2b7^:src/pages/dashboard.astro`).
  - Blind spot: What Cloudflare Workers show for an unhandled throw in production hasn't been checked.
- **Fix B**: Wrap the five redirect GETs in try/catch that logs the error and returns a plain 503.
  - Strength: Friendlier failure on the sign-in landing path.
  - Tradeoff: Diverges from the pages, which still throw. A half-applied convention is arguably worse than none.
  - Confidence: MED — simple edit, but it invites an inconsistent error model.
  - Blind spot: No shared error-response helper exists yet.
- **Decision**: ACCEPTED (Fix A) — risk accepted; recorded in `context/foundation/roadmap.md` → Open Roadmap Questions → Observations for next-version research.

### F2 — Smoke doesn't exercise the malformed-id and legacy note redirects

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:74
- **Detail**: The plan's core trust rule is to UUID-check before querying, because PostgREST raises 22P02 and gives a 500 otherwise. That rule is covered only at the service level (`campaigns-service.test.ts`). Smoke's only 404 probe uses a well-formed nil UUID. `/campaigns/not-a-uuid`, `/notes/new` (302) and `/notes/<random uuid>` (404) are never hit over HTTP. A future page that bypasses `getCampaign` would regress silently. Smoke meets plan item 7 as written, so this is a coverage gap, not drift.
- **Fix**: Add three smoke steps (signed-in): `/campaigns/not-a-uuid` → 404, `/notes/new` → 302 to `/campaigns/`, `/notes/00000000-0000-0000-0000-000000000000` → 404.
- **Decision**: FIXED — 3 steps added to `scripts/smoke.mjs`; smoke 16/16 passing against preview.

### F3 — `getActiveCampaign` renamed to private `getOldestCampaign` rather than deleted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/campaigns.ts:17
- **Detail**: The plan says "`getActiveCampaign` is deleted". The query survives as a non-exported helper that backs `resolveLandingCampaign`'s oldest-campaign fallback, which the plan itself requires. The public name is gone, criterion 2.7's grep passes, and the commit message documents the change. The deviation is benign.
- **Fix**: None needed. Optionally note it in the plan's Phase 2 §6 for future readers.
- **Decision**: FIXED — as-implemented note added to plan.md Phase 2 §6.

### F4 — Redirect endpoints return 404 when Supabase isn't configured

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.ts:14 (and siblings)
- **Detail**: "Supabase is not configured." is a server misconfiguration, but it returns 404. `POST /api/campaigns/[campaignId]/notes` returns 500 for the same condition. The plan specified 404, so this flaw comes from the plan rather than the implementation. It only happens on a misconfigured deploy.
- **Fix**: Return 500 (or 503) for the null-client branch in the four landing endpoints; keep 404 for "no campaign".
- **Decision**: FIXED — null-client branch now 500 in dashboard.ts, map.ts, notes/new.ts, campaigns/index.ts; contract-surfaces.md updated. (`notes/[id].ts` still folds it into its single 404, left as-is.)

### F5 — Notes-list page `<title>` still "Dashboard"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/campaigns/[campaignId]/index.astro:29
- **Detail**: The title was carried over verbatim from `dashboard.astro`, while the H1 is now the campaign name. With several campaigns, every browser tab reads "Dashboard".
- **Fix**: Use `title={campaign ? campaign.name : "Campaign not found"}`.
- **Decision**: FIXED — title now uses the campaign name (matches edit.astro / [noteId].astro pattern).
