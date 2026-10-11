# Review fixes — auth-risk-tests

Follow-ups queued from implementation reviews. Each one names its source finding and the slice that owns it.

## From `reviews/impl-review-phase-1.md`

- [ ] **F2 — Literal `302` in the HTTP suite** (owner: S-04 constants sweep). Add `FOUND: 302` to `HTTP_STATUS` (`src/lib/constants/http-status.ts`), then replace the bare `302` literals in `tests/http/route-guard.test.ts:42,59` and `tests/http/session-revocation.test.ts:28,61,69,75`. This was deferred because auth-risk-tests is tests-only ("No `src/` changes").
