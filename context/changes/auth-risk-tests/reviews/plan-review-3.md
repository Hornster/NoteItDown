<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Risk Tests — Phase 3 (E2E auth session chain and approved messages)

- **Plan**: context/changes/auth-risk-tests/plan.md (Phase 3 only)
- **Mode**: Deep (claims verified inline against code)
- **Date**: 2026-10-11
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
Grounding: 5/5 paths ✓ (`tests/e2e/signin.spec.ts`, `playwright.config.ts`, `tests/support/test-user.ts`, `src/pages/api/auth/signout.ts`, `src/components/Topbar.astro`), 5/5 symbols ✓ (`createTestUser`, `astro-island:not([ssr])`, "Sign out" form button, `confirmPassword` field, `enable_confirmations = false`), brief↔plan ✓, Progress↔Phase ✓ (3.1–3.5), auth budget ✓ (integration 12 + http 2 + e2e 7 + smoke 3 = 24 / 30).

Verified: signup sets cookies (confirmations off), so `clearCookies()` is needed; signin → `/dashboard` → `/campaigns/<id>`; "Sign out" is a plain Topbar form (no hydration) rendered only for signed-in users; signout clears cookies and redirects to `/`.

## Findings

### F1 — Duplicate-signup baseline pins a defect the plan says it won't pin

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2 vs "What We're NOT Doing" (plan.md:45, :47)
- **Detail**: "What We're NOT Doing" lists the raw Supabase `error.message` ("possible account enumeration") as an S-04 defect and states "No test pins … any other known-bad behaviour as expected". Phase 3 pins `UI_BASELINE.signupDuplicateEmail`, expected to be GoTrue's "User already registered". That is the enumeration leak itself. research.md:216 also warned that pinning raw Supabase text bakes in the oracle problem. As written, the user approves the text at 3.4 without being told it is the logged defect.
- **Fix A ⭐ Recommended**: Keep the pin as a labelled characterization. Add an explicit exception to plan.md:47, extend the `UI_BASELINE` comment for `signupDuplicateEmail` ("characterizes known S-04 defect: account enumeration; expected to change in S-04"), and have 3.4 tell the user this before approval.
  - Strength: Keeps Risk #4's "messages unchanged" trip-wire, so S-04 has to change the wording on purpose, and the test-plan §6.6 S-04 follow-up list stays linked to a failing assertion.
  - Tradeoff: A test knowingly asserts bad behaviour until S-04 lands.
  - Confidence: HIGH — the UI_BASELINE comment already says changing it is an S-04 decision; this only makes the exception explicit.
  - Blind spot: None significant.
- **Fix B**: For duplicate signup, assert behaviour only (stays on `/auth/signup?error=`, a non-empty error is visible, `/dashboard` still redirects to `/auth/signin`). Pin wording only for wrong-password.
  - Strength: No test pins a known defect, which matches plan.md:47 literally.
  - Tradeoff: Loses the wording trip-wire for signup, so S-04 can change the text silently.
  - Confidence: MED — any non-empty text passes, so a regression to a generic or blank-ish message goes unnoticed.
  - Blind spot: Whether the PRD needs signup wording preserved through S-04.
- **Decision**: Fixed via Fix A

### F2 — Baseline approval sequencing and locator unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2, Success Criteria, Implementation Note
- **Detail**: (a) 3.2 (automated, e2e green) cannot pass until 3.3/3.4 (manual approval) supply the `UI_BASELINE` values, but the Implementation Note orders automated before manual. (b) "Running each flow once" has no mechanism. (c) Each run spends 5 auth calls. Local reruns hit the 30/5-min limit after about 4 runs, and then the observed "error" is GoTrue's rate-limit message, which could be presented to the user as the baseline. (d) "The visible server error" has no locator. `ServerError` is a bare `<p>` with no role or test id, and S-05 restyles it, so class selectors would break.
- **Fix**: In §2 specify: write the spec with `""` baselines, run once, read each "Received" value from the failure, reject rate-limit or "Supabase is not configured" text, present it to the user (3.3/3.4), then fill the values in and run 3.2. Locate the message with `page.getByText(UI_BASELINE.x, { exact: true })` + `toBeVisible()` (role/text, survives S-05). Note that 3.3/3.4 come before 3.2.
- **Decision**: Fixed

### F3 — Manual mutation check 3.5 is non-specific

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Manual Verification (3.5)
- **Detail**: "Change the signin redirect target in the spec's expectation" only proves an assertion can fail, not that the test detects an app defect. "Break signout" doesn't say how. Also, locally the reporter is `list` (HTML report only in CI), so "a trace in the report" means `test-results/…/trace.zip`.
- **Fix**: Replace with: make `signout.ts` skip `supabase.auth.signOut()` (still redirect to `/`), `npm run build && npm run test:e2e`, then confirm the chain fails at the post-signout `/dashboard` step and a `trace.zip` exists under `test-results/`; revert and rebuild.
- **Decision**: Accepted

### F4 — `UI_BASELINE` literals look like a MESSAGES-rule violation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §2 (`UI_BASELINE` comment)
- **Detail**: lessons.md "Use the central error/status/message dictionaries" and S-04's "no duplicated user-facing messages" rule could lead impl-review or an S-04 agent to replace the spec's literals with `MESSAGES` imports. That would make the oracle come from the code under test, which is the exact problem the baseline avoids.
- **Fix**: Add to the `UI_BASELINE` comment: "deliberately literal — never import from `MESSAGES`; the oracle must not come from the code under test".
- **Decision**: Fixed
