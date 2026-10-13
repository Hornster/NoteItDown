<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Constants Sweep (S-04)

- **Plan**: context/changes/constants-sweep/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Automated checks, all green on 2026-10-13:**
  - `npx astro check`: 0 errors.
  - `npm run lint`: clean.
  - `npm test`: 291 tests passed.
  - `npm run test:hooks`: 35 passed.
  - `npm run build && npm run test:http`: 108 passed.
  - `npm run test:e2e`: 6 passed.
  - `npm run smoke`: all steps passed.
  - All plan greps print nothing, apart from the literal oracles in `*.test.ts` (kept literal by design).
  - The ESLint `--stdin` probe exits 1 with `no-restricted-syntax`.
  - The curl JSON-body probe returns `302 /auth/signin?error=Email%20is%20required`.
- **Plan drift:** every planned change in phases 1–4 is MATCH, and no item is DRIFT or MISSING. The scope guardrails were respected.
- **Dismissed after verification:** the subagent claimed a percent-encoded path such as `/%63ampaigns/new` bypasses the middleware guard. Against the preview, `/%63ampaigns/new` and `/%64ashboard` both return 302 to `/auth/signin`, so the claim does not hold.

## Findings

### F1 — A duplicate signup can be told apart by its session cookie when confirmations are off

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:33-35
- **Detail**:
  - Verified against the local preview, where `supabase/config.toml:210` sets `enable_confirmations = false`:
    - A new signup returns 302 `/auth/confirm-email` and sets the `sb-127-auth-token` session cookie.
    - A duplicate signup returns the same 302 with only the PKCE flow and code-verifier cookies, and no session cookie.
  - The redirect looks identical, but a client can still enumerate accounts by checking for the session cookie.
  - With confirmations ON (expected in hosted production), GoTrue returns an obfuscated user and no session for both cases, so the responses match. The plan's Migration Notes allude to this, but no contract doc states the precondition.
  - No test pins the property.
- **Fix A ⭐ Recommended**: State the precondition in `docs/reference/contract-surfaces.md` (auth entry): signup is non-enumerating only with `enable_confirmations = true`. Also confirm that the hosted Supabase project has confirmations on.
  - Strength: Matches the actual guarantee. It costs one doc line plus one dashboard check, and there are no code changes.
  - Tradeoff: Local dev and CI keep the distinguishable behavior. This is acceptable because they hold no real accounts.
  - Confidence: HIGH — the cookie difference was observed directly, and the hosted behavior is GoTrue's documented obfuscation.
  - Blind spot: The hosted project's confirmation setting has not been checked in this review.
- **Fix B**: Open a follow-up change to make the responses identical in every config, e.g. by never establishing a session on signup and always requiring signin after confirm-email.
  - Strength: Removes the dependency on hosted configuration.
  - Tradeoff: Changes the signup UX and the e2e session chain (`auth-session.spec.ts:29` relies on signup setting cookies). It is out of S-04's scope.
  - Confidence: MED — the UX and test changes are not designed yet.
  - Blind spot: Effect on the S-01 session-chain tests.
- **Decision**: FIXED (Fix A) — precondition documented at docs/reference/contract-surfaces.md:88. User found hosted Supabase email confirmations OFF and turned them ON (2026-10-13).

### F2 — The exact-or-slash matcher fails open for future lookalike routes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/protected-routes.ts:1-6
- **Detail**:
  - The old `startsWith` guarded `/mapping`, `/notes-x` and similar paths. The new matcher does not.
  - This is the intended fix, and no route exists under those names today.
  - A future top-level route such as `/notes-export` or `/maps` would be public by default unless it is added to `PROTECTED_ROUTES`. Before, it would have been protected by accident.
- **Fix**: Add a one-line comment on `PROTECTED_ROUTES` saying that every new protected top-level route must be listed. `tests/http/support/route-inventory.ts` already derives protected routes from the filesystem as an independent oracle.
- **Decision**: FIXED — comment added on PROTECTED_ROUTES in src/lib/protected-routes.ts.

### F3 — SignInForm keeps its own copy of the email regex

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/SignInForm.tsx:23
- **Detail**:
  - `SignUpForm` imports `EMAIL_PATTERN` from `@/lib/schemas/auth`, but `SignInForm` still inlines `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
  - The plan named only SignUpForm, so this is not drift.
  - It still leaves the client/server mirror that `EMAIL_PATTERN` exists to prevent.
- **Fix**: Import `EMAIL_PATTERN` in SignInForm and delete the local regex.
- **Decision**: FIXED — SignInForm imports EMAIL_PATTERN from @/lib/schemas/auth.

### F4 — The ESLint guard has gaps beyond the documented `switch` case

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: eslint.config.js:73-93
- **Detail**:
  - Probed via `eslint --stdin`. These forms are not flagged:
    - a quoted key such as `{"status": 404}`, because the selector uses `key.name`;
    - a JSX attribute such as `<X status={404}/>`;
    - `case 404:`, which the lesson already documents.
  - A later config block setting `no-restricted-syntax` would silently replace these selectors, because flat config replaces rule options rather than merging them.
- **Fix**: Add a `Property[key.value='status'] > Literal[...]` selector and a comment that the block owns `no-restricted-syntax`. Alternatively, leave the code as it is and extend the lesson's known-gap sentence.
- **Decision**: FIXED — added Property[key.value='status'] selector and an ownership comment in eslint.config.js; the quoted-key probe now reports no-restricted-syntax. JSX status attributes and `case 404:` stay known gaps.

### F5 — Unplanned `TestingCommands.md` on the change branch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: TestingCommands.md:3
- **Detail**:
  - Commit `53e3575` adds a personal command cheat sheet that is unrelated to S-04.
  - Line 3 says `kill $(lsof -t -i:8080)` while its description says `<port>`.
  - The file has no trailing newline.
- **Fix**: Change `8080` to `<port>`, and either keep the file deliberately or move it off the branch or into `TESTING.md`.
- **Decision**: ACCEPTED — user will fix TestingCommands.md themselves.
