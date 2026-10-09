<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: E2E Framework Spike

- **Plan**: context/changes/e2e-framework-spike/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated re-run 2026-10-09 (all pass): lint; astro check (0 errors); unit 91/91; integration 89/89; build; e2e `1 passed`; preflight fails loudly naming Supabase with `SUPABASE_URL=http://127.0.0.1:1` (unreachable) and with `SUPABASE_KEY=` (missing env). `git status` clean after the run.

## Findings

### F1 — Plan's hydration premise was wrong; Phase 2 fix contradicts the Phase 1 contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/signin.spec.ts:10-11; context/changes/e2e-framework-spike/plan.md:25,102,106
- **Detail**: In Key Discoveries the plan says a submit before hydration "still signs in", so the scenario "does not wait for or assert hydration". In CI the opposite happened: React hydration wiped the email typed into the SSR input, and client validation then blocked the submit (commit 1f94969). Phase 1 shipped that race; 1.5 passed locally only because of timing. The Phase 2 fix waits on `page.locator("astro-island:not([ssr])")`. That is a CSS selector, which breaks the Phase 1 contract ("Role/label locators only; no CSS selectors"). It also matches any island on the page: if `/auth/signin` ever gets a second island, `waitFor()` fails Playwright's strict-mode check, or it could resolve on the wrong island. The plan was never amended, so S-01 planning will inherit the wrong premise.
- **Fix A ⭐ Recommended**: Amend plan (Key Discoveries + §5 contract) with an addendum recording the race and the hydration wait as an accepted exception, and scope the locator to the signin island (`page.locator("astro-island:not([ssr])", { has: page.getByRole("button", { name: "Sign in" }) })`).
  - Strength: The plan is accurate again for S-01, and the wait no longer depends on the signin page having only one island.
  - Tradeoff: A small test edit after the CI proofs ran; needs one local e2e re-run.
  - Confidence: HIGH — `has:` filtering is standard Playwright; the race is evidenced in the 1f94969 message.
  - Blind spot: The `has:` match runs against the SSR markup before hydration. It should still match because the button is server-rendered, but this hasn't been run.
- **Fix B**: Amend the plan only; leave the spec as is.
  - Strength: Zero code churn; spec is proven green in CI (P1).
  - Tradeoff: The unscoped island locator stays, and breaks if an island is ever added to the signin page.
  - Confidence: HIGH — doc-only change.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — plan addenda at Key Discoveries + §5; locator scoped with `has:`; e2e re-run `1 passed`

### F2 — Unplanned webServer flags not reflected in plan contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: playwright.config.ts:22-25
- **Detail**: The plan's contract specifies `command: "npm run preview -- --port 4322"`. The code also passes `--ignore-lock` and `env: { ASTRO_PREVIEW_BACKGROUND: "1" }`. Both are justified: astro's preview CLI auto-backgrounds the server when it detects an agent unless that env var is set (`node_modules/astro/dist/cli/preview/index.js:45`), and it keeps a single preview lock per project. Both are commented in code and in the commit message, but the plan contract still shows the old command.
- **Fix**: Add a one-line addendum under Phase 1 §4 listing both flags and why.
- **Decision**: FIXED — addendum under Phase 1 §4 contract

### F3 — e2e imports its seed helper from the integration suite

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/signin.spec.ts:3
- **Detail**: The preflight was moved into `tests/support/` for sharing, but `createTestUser` is still imported from `tests/integration/helpers.ts`, so e2e now depends on the integration suite's internals. Reusing the helper was the plan's choice, so this is not drift. When S-01 adds more e2e specs, though, edits to integration helpers will quietly reach e2e.
- **Fix**: When S-01 adds e2e specs, move `createTestUser` into `tests/support/` alongside the preflight (no action needed now).
- **Decision**: FIXED — moved to `tests/support/test-user.ts`; `tests/integration/helpers.ts` re-exports it; e2e import and test-plan §6.3 path updated; lint, astro check, integration 89/89, e2e `1 passed`
