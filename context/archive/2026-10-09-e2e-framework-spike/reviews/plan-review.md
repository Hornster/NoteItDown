<!-- PLAN-REVIEW-REPORT -->
# Plan Review: E2E Framework Spike Implementation Plan

- **Plan**: context/changes/e2e-framework-spike/plan.md
- **Mode**: Deep
- **Date**: 2026-10-09
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
9/9 paths ✓ (3 new files correctly absent), 8/8 symbols ✓ (ci.yml triggers/smoke job/deploy.needs, smoke.mjs:58/126, signin.ts:19, dashboard.ts:17-22, Topbar "Sign out", supabase 2.120.0 in lockfile, vitest loadEnv), brief↔plan ✓, Progress↔Phase ✓, contract surfaces: none touched. Auth rate-limit budget in one CI job: integration 12 + e2e 2 + smoke 3 = 17/30.

## Findings

### F1 — Scenario can pass without the island ever hydrating

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Key Discoveries; Phase 1 §5; brief Desired End State
- **Detail**: SignInForm is a native `<form method="POST" action="/api/auth/signin">` (SignInForm.tsx:43); the island only blocks invalid submits. A pre-hydration click or broken island JS falls back to a native POST and both assertions still pass. The session is proven; "through the real hydrated form" is not.
- **Fix A ⭐ Recommended**: Change the claim; defer island coverage to S-01
  - Strength: Lean, outcome-only; session proof is the Risk #6 goal.
  - Tradeoff: Island breakage uncovered until S-01.
  - Confidence: HIGH — fallback visible in code.
  - Blind spot: None significant.
- **Fix B**: Wait for hydration before filling the form
  - Strength: Actually covers the island.
  - Tradeoff: Needs an attribute/CSS locator, breaking the role/label-only rule.
  - Confidence: MED — relies on Astro internal `ssr` attribute.
  - Blind spot: Stability across Astro 7 minors.
- **Decision**: FIXED (Fix A)

### F2 — workflow_dispatch contract could drop branch filters

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §1
- **Detail**: `on: { push, pull_request, workflow_dispatch: {} }` reads as dropping `branches: [main]`; proof-branch pushes would then auto-trigger duplicate runs.
- **Fix**: State that workflow_dispatch is added alongside existing triggers and branch filters stay.
- **Decision**: FIXED

### F3 — "Env missing" failure is promised but never verified

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State vs Phase 1 criterion 1.6
- **Detail**: End state promises a Supabase-named failure on missing env; only "Supabase stopped" had a criterion.
- **Fix**: Extend 1.6 with a missing-env run (`mv .env .env.bak && npm run test:e2e; mv .env.bak .env`).
- **Decision**: FIXED

### F4 — Local reuseExistingServer can silently test a stale build

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 webServer
- **Detail**: Locally Playwright reuses any server on 4322 (stale preview of old dist/, or astro dev falling back from 4321).
- **Fix**: Document in TESTING.md: stop stale preview/dev servers and rebuild first.
- **Decision**: FIXED
