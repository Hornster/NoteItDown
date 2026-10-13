<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Constants Sweep (S-04), Phase 3 (Auth defects and route matching)

- **Plan**: context/changes/constants-sweep/plan.md
- **Scope**: Phase 3 only
- **Mode**: Deep (claims verified inline against the code; no sub-agent)
- **Date**: 2026-10-13
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding
Grounding: 6/6 modified paths ✓ (`api/auth/{signin,signup,signout}.ts`, `middleware.ts`, `auth-session.spec.ts`, `route-guard.test.ts`), 3/3 new `src/` files absent as expected ✓, symbols ✓ (`UI_BASELINE` @ auth-session.spec.ts:8-12, `PROTECTED_ROUTES` @ middleware.ts:4, `MESSAGES.SUPABASE_NOT_CONFIGURED` already carries the period, `confirmPassword` @ SignUpForm.tsx:106, `AuthError.code` type @ auth-js errors.d.ts:20), all 8 GoTrue codes in the mapping exist in auth-js `ErrorCode` ✓, both forms are `noValidate` so the JS-disabled empty-password check reaches the server ✓, smoke unaffected (no duplicate signup; wrong-password step checks only the `?error=` prefix) ✓, Progress↔Phase 3 9/9 ✓, brief↔plan ✓.

## Findings

### F1 — authFormSchema returns zod's default text for missing fields

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §1 (Contract), §3, §5; criteria 3.4 and 3.9
- **Detail**: The contract is `z.string().trim().min(1, MESSAGES.EMAIL_REQUIRED)`. When a field is absent, `formData().get()` gives `null`, and `Object.fromEntries` gives `undefined`. zod then fails the type check before `.min` runs. Run against zod 4.6.5: `{}` gives `Invalid input: expected string, received undefined` for both fields, and a form with only `email` gives the same text for `password`. A `File` value gives `… received Blob`. Two failure paths follow. A JSON body becomes an empty form, and a form without a password has no `password` key, so neither produces `Email is required` or `Password is required`. Both §5 HTTP cases (3.4) and the curl probe (3.9) would fail. The `?error=` contract ("always carries a `MESSAGES` value") would also break, because zod's English default text would reach the user. The §1 unit tests don't assert messages, so they wouldn't catch it.
- **Fix**: Give each field a type-level error. Use `email: z.string({ error: MESSAGES.EMAIL_REQUIRED }).trim().min(1, MESSAGES.EMAIL_REQUIRED)`, and do the same for `password` with `PASSWORD_REQUIRED` (verified: `{}`, a missing password, a `Blob` and whitespace all give the dictionary text). In §1 tests, assert the literal `issues[0].message` for missing email, missing password and a non-string value.
- **Decision**: FIXED — §1 contract adds the type-level `error` to both fields with a note on why; §1 tests assert literal messages for missing email, missing password, whitespace-only and non-string email.

### F2 — An invalid email format falls through to the generic "Something went wrong"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 ("Format and strength checks stay with Supabase") and §2 mapping table
- **Detail**: The mapping sends `email_address_invalid` to `EMAIL_INVALID`. GoTrue uses that code for addresses it refuses (blocklist or delivery checks). A malformed address such as `foo` at signup returns `validation_failed` ("Unable to validate email address: invalid format"), which falls through to `AUTH_FAILED`. Without JS, or with a crafted request, the user gets "Something went wrong. Please try again." where today they get a hint about the format. `SignUpForm.tsx:27` already rejects this format on the client with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, so the server and client copies now disagree. `SignInForm` has no format check.
- **Fix A ⭐ Recommended**: Check the format in `authFormSchema` with the same pattern as `SignUpForm` (shared as one exported constant) and `MESSAGES.EMAIL_INVALID`.
  - Strength: The check never reaches GoTrue (no rate-limit spend), uses one pattern for client and server, and doesn't guess at GoTrue codes. It continues phase 2's schema/form mirror.
  - Tradeoff: It reverses the plan's "format stays with Supabase" decision. At signin, a malformed email now shows "Enter a valid email address" instead of "Invalid login credentials". That leaks nothing, but it is new wording on a path no e2e test pins.
  - Confidence: HIGH — the pattern is already in production on the client.
  - Blind spot: GoTrue's own format rule may be stricter than the regex in rare cases; those still fall back to `AUTH_FAILED`.
- **Fix B**: Map `validation_failed` → `EMAIL_INVALID` in `authErrorMessage`.
  - Strength: A one-row change that keeps the plan's decision intact.
  - Tradeoff: GoTrue uses `validation_failed` for other checks too (for example, an over-long password), and those would show an email message.
  - Confidence: MED — the GoTrue code for format errors comes from GoTrue source, not a live call.
  - Blind spot: There is no list of every `validation_failed` source in the pinned CLI 2.120.0.
- **Decision**: FIXED via Fix A — §1 exports `EMAIL_PATTERN` (from `SignUpForm.tsx:27`, which now imports it) and adds `.regex(EMAIL_PATTERN, MESSAGES.EMAIL_INVALID)`; `SignUpForm.tsx` added to §1 files; the signin wording change is recorded as accepted; test for `foo` → `Enter a valid email address`.

### F3 — Moving PROTECTED_ROUTES leaves two doc references stale

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §4 (blast radius), Phase 4 §5
- **Detail**: Phase 4 §5 updates only `README.md:161`, plus a new contract-surfaces entry. Two other docs still point at the old location and the prefix semantics:
  - `docs/reference/contract-surfaces.md:167` (Routes section) says "Protected (`PROTECTED_ROUTES` in `src/middleware.ts`)".
  - `context/foundation/test-plan.md:148` says "Register the prefix in `PROTECTED_ROUTES` (`src/middleware.ts`)".

  Both would mislead the next person who adds a protected page.
- **Fix**: Add `contract-surfaces.md:167` and `test-plan.md:148` to the Phase 4 §5 list. They should name `src/lib/protected-routes.ts` and say "path, or path + `/`" instead of "prefix".
- **Decision**: FIXED — Phase 4 §5 adds `context/foundation/test-plan.md` to the files and a bullet for `contract-surfaces.md:167` and `test-plan.md:148`.
