<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-Campaign Support Implementation Plan

- **Plan**: context/changes/multi-campaign-support/plan.md
- **Scope**: Phase 3 of 3
- **Reviewed phases**: 3
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated criteria were re-run on 2026-09-29 against HEAD (61b9c74, clean tree):
- `test:unit`: 33/33 passed
- `test:integration`: 47/47 passed
- `lint`: clean
- `astro check`: 0 errors, 0 warnings
- `build`: OK
- `smoke` against the preview: 16/16 steps passed

All 6 "Changes Required" items match the plan in substance; F1 is the one behavioral deviation. There are no scope-guardrail violations: no delete, no `/campaigns` index page, no count limits, and `MemoryMap` is untouched.

Post-triage re-verification (2026-09-29, after the F1–F6 fixes): lint clean, `astro check` 0 errors, unit 33/33, integration 47/47, build OK, smoke 18/18 against a fresh preview.

## Findings

### F1 — Campaign switcher is disabled or mis-selected when the current campaign isn't in the list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/campaigns/CampaignSwitcher.tsx:20-34
- **Detail**: The plan asks for "a disabled placeholder when `campaignId` is absent", meaning a disabled placeholder *option*. The implementation sets `disabled={!campaignId}` on the whole `<select>`. So on `/campaigns/new` and on the signed-in home page (`Welcome.astro` renders `<Topbar />`), the switcher can't be used at all. There is a second symptom: when `campaignId` is set but isn't in `campaigns` (the 404 pages for a foreign or nonexistent id), no option matches. The browser shows the first campaign as selected, and picking it fires no `onChange`, so the user can't switch to it.
- **Fix**: Compute `selected = campaigns.some(c => c.id === campaignId) ? campaignId : ""`. Render the disabled placeholder option whenever `selected === ""`, bind `value={selected}`, and drop `disabled` from the `<select>`.
- **Decision**: FIXED — `selected` computed from the campaign list; placeholder option shown when nothing matches; `disabled` removed from the select.

### F2 — Topbar's `listCampaigns` failure takes down every signed-in page

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/Topbar.astro:19-25
- **Detail**: `listCampaigns` throws on any PostgREST error, and Topbar doesn't catch it. Topbar is navigation chrome, but it now issues a DB query on every signed-in page. That includes the home page (`Welcome.astro`), the 404 pages and `/campaigns/new`, none of which otherwise depend on campaign data. A transient Supabase error there becomes a framework 500. Phase 2 F1 accepted throwing services for page *content*. This is different, because the failing call is optional chrome.
- **Fix A ⭐ Recommended**: Wrap the call in try/catch, log with `console.error` (eslint-disable as in the API routes), and fall back to `[]`.
  - Strength: Pages that don't need campaign data keep rendering, and the user can still sign out or navigate. The change is 5 lines in one file.
  - Tradeoff: Adds a second error convention next to Phase 2 F1's "let it throw".
  - Confidence: HIGH — the switcher already handles an empty list: it renders only the options it is given.
  - Blind spot: An empty switcher during an outage may look like "you have no campaigns". Hiding the switcher when the list is empty would avoid that.
- **Fix B**: Accept as risk, consistent with the Phase 2 F1 decision.
  - Strength: One uniform error model: services throw and the framework shows a 500.
  - Tradeoff: Widens the outage blast radius to pages that previously had no DB dependency (home).
  - Confidence: MED — the risk is real but rare on a single-user tool.
  - Blind spot: How Cloudflare renders an unhandled throw hasn't been checked (same gap as Phase 2 F1).
- **Decision**: FIXED (Fix A) — `listCampaigns` wrapped in try/catch in Topbar; logs via `console.error` and falls back to an empty list.

### F3 — PATCH validates the body before resolving the campaign id

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/campaigns/[campaignId]/index.ts:31-54
- **Detail**: The sibling `POST /api/campaigns/[campaignId]/notes` checks the campaign (404) before parsing the body. The PATCH route parses and validates first, so a malformed id with a bad body returns 400 instead of 404. Its `!campaignId` guard at l.52 is effectively dead code, because Astro always supplies the param. Safety is unaffected: `renameCampaign` still checks `isUuid` and RLS.
- **Fix**: Move the `!campaignId` 404 guard above the JSON parse, to match notes.ts ordering.
- **Decision**: FIXED — guard moved above the JSON parse and extended to `!campaignId || !isUuid(campaignId)`, so a malformed id returns 404 before the body is read; foreign ids still get 404 via `renameCampaign`.

### F4 — `jsonError` / `fieldFromPath` copy-pasted into a third and fourth route

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/campaigns/index.ts, src/pages/api/campaigns/[campaignId]/index.ts (also src/pages/api/campaigns/[campaignId]/notes.ts)
- **Detail**: The same two helpers now live in three API route files. They are behaviorally identical today, but they will drift once one of them changes.
- **Fix**: Extract them to `src/lib/api.ts` and import them in all three routes.
- **Decision**: FIXED — `jsonError` and `fieldFromPath(path, fields)` extracted to `src/lib/api.ts`; the three campaign API routes import them and keep their own `FIELDS` sets.

### F5 — Manual criterion 3.13 (phone width) ticked while the roadmap parks mobile support

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/multi-campaign-support/plan.md:414 and context/foundation/roadmap.md:172
- **Detail**: The same commit adds a roadmap entry saying "phone-width checks are not MVP acceptance criteria" (user decision 2026-09-28), yet 3.13 is marked `[x]` with no note. The code does hedge for narrow widths (`flex-wrap`, `max-w-[10rem]`, `truncate`). Still, a future reader can't tell whether 3.13 was verified or waived.
- **Fix**: Append "(waived — mobile support parked, roadmap 2026-09-28; basic flex-wrap/truncate in place)" to 3.13.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Waived criteria are annotated, not ticked — 3.13 in plan.md annotated as waived.

### F6 — New campaign APIs have no HTTP-level test coverage

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs
- **Detail**: Integration tests cover the service layer (`createCampaign` / `renameCampaign`), but nothing exercises `POST /api/campaigns` or `PATCH /api/campaigns/[id]` over HTTP. The route status mapping (401/400/404/409/201/200) is verified only by the manual checks 3.7–3.9. The plan didn't require it, so this is a coverage gap, not drift.
- **Fix**: Add two signed-in smoke steps: `POST /api/campaigns` with a unique name → 201, and `PATCH /api/campaigns/not-a-uuid` → 404.
- **Decision**: FIXED — 2 signed-in smoke steps added (`POST /api/campaigns` → 201, `PATCH /api/campaigns/not-a-uuid` → 404); `request()` gained a `json` option.
