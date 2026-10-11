<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Risk Tests Implementation Plan

- **Plan**: context/changes/auth-risk-tests/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Evidence

- Phase 3 commit: `0c318cc`. It touches only `tests/e2e/auth-session.spec.ts` (new, 87 lines) and the plan's Progress section. There are no `src/` edits and nothing outside the plan. Later commits did not touch the spec.
- Session chain (`auth-session.spec.ts:20-54`) matches the contract: a unique `e2e-<uuid>@example.com` email, a hydration wait before each form, signup → `/auth/confirm-email`, `context.clearCookies()`, signin → `/campaigns/<uuid>` with "Sign out" visible, then signout → `/`, `/dashboard` → `/auth/signin`, and the recorded campaign URL → `/auth/signin`. That is 2 auth calls.
- Approved wording (`:56-87`): `beforeAll` → `createTestUser()`, then wrong-password → `/auth/signin?error=` and duplicate signup → `/auth/signup?error=`. Both locate the error with `getByText(UI_BASELINE.x, { exact: true })`, not by class. The `UI_BASELINE` comment carries the approval date (2026-10-11), the Progress refs, the "never import from `MESSAGES`" rule (plan-review-3 F4) and the S-04 enumeration-defect note on `signupDuplicateEmail` (plan-review-3 F1).
- Auth budget: e2e uses 2 (existing) + 5 (new) = 7, which matches the plan's count.
- Phase 3 does not change any Phase 1 or Phase 2 assumptions. It touches no `tests/http/` files and no ports other than Playwright's 4322.
- Ports 4321–4323 were free before the run, and local Supabase was running.
- `npm run lint`: exit 0.
- `npm run build && npm run test:e2e`: 4 passed in 4.9 s (3 new scenarios plus the existing `signin.spec.ts`).

## Findings

### F1 — Manual check 3.5 ticked without saying which mutation ran

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/auth-risk-tests/plan.md:379 (Progress 3.5)
- **Detail**: 3.5 offers two variants. Changing the spec's own expectation proves only that an assertion can fail. Breaking `signout.ts` proves the chain detects an app defect. plan-review-3 F3 flagged this and was "Accepted" without a plan change. The tick has no note saying which variant ran, and a manual mutation leaves nothing in the diff, so a later reader can't tell how strong the evidence is. Under the lesson "Waived criteria are annotated, not ticked", the note belongs on the Progress line.
- **Fix**: Append the variant that was run to 3.5, e.g. `(ran: signout.ts skipped signOut(); chain failed at post-signout /dashboard, trace.zip in test-results/)`.
- **Decision**: FIXED — 3.5 annotated: the spec-expectation variant ran; the app-defect variant (`signout.ts`) did not. Phase 2's 2.3 mutation covers signout revocation at the HTTP level.

### F2 — Hydration wait duplicated between e2e specs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/auth-session.spec.ts:16
- **Detail**: `waitForHydration()` repeats the inline locator from `tests/e2e/signin.spec.ts:11`, including its comment. Two copies are harmless. A third spec, or S-05 changing island markup, would mean editing several places. The plan did not ask for a shared helper.
- **Fix**: Leave as is for now. Extract it to `tests/e2e/support/` when a third spec needs it.
- **Decision**: FIXED — extracted to `tests/e2e/support/hydration.ts`; both specs import it. Lint clean, `npm run test:e2e` 4/4 green.
