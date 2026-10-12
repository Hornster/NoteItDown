# Notes, Relations & Isolation Risk Tests — Plan Brief

> Full plan: `context/changes/notes-relations-risk-tests/plan.md`
> Research: `context/changes/notes-relations-risk-tests/research.md`

## What & Why

Roadmap S-02 / test-plan Phase 2 (Risks #1, #3, #5): every named risk scenario for notes & campaigns CRUD, automatic relations, memory-map navigation and per-user/per-campaign isolation gets at least one CI test. The binding constraint: the relation-change notice wording must be pinned **before** S-04 moves the text.

## Starting Point

Service/RPC-level isolation is already well tested with two real anon-key users; most research scenarios are "Fits". Missing: route-level isolation (http suite is anonymous-only), a systematic RLS matrix (direct-table B writes, owner CRUD on existing rows), the notice wording (inline JSX, untested), and any UI/map e2e. Three tests check results but not "no row written".

## Desired End State

A named scenario register in test-plan §6.6 maps every research scenario to a test (or "not applicable"). B gets 404/empty with A's data unchanged on every page, note/campaign API and image API; owners keep CRUD; the notice wording fails CI if any line changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Layer per scenario | integration = policy matrix + extensions; http = forged-ID routes; e2e = forged URL, notice/CRUD, map click | Cheapest layer with real signal (`test-plan.md:55-59`). | Research |
| Notice wording | Approve current copy; pin **exact text per line**: `Saved "<name>".` / `Relations added: <A>, <B>` / `Relations removed: <C>` / `Relations unchanged.` / `Deleted "<name>".` / `No relations touched.`; type-only edit shows only the Saved line; link hrefs asserted | S-04 must not drift punctuation or separators unnoticed. | Plan (user) |
| Rate limit | Raise local `sign_in_sign_ups` 30 → **50**; raise again later if needed | ~24 used + ~10 new exceeds 30; local-only config. | Plan (user) |
| Image routes in http matrix | Included (upload, commit, get/patch/delete image) with valid bodies, lowercase ids | Risk #1 covers every entry point taking an id; 0 extra auth calls. | Plan (user) |
| Out-of-scope defects (uppercase-UUID 500, replayed commit 500) | Log for S-04 in test-plan §6.6; don't pin, don't fix | Same precedent as auth-risk-tests; keeps S-02 tests-only. | Plan (user) |
| Optional scenarios | Include forged `last_campaign_id` cookie route rows **and** campaign-list exclusion | Cheap; pins middleware wiring and closes an own-ID-only test. | Plan (user) |
| Double-submit notice overwrite | No guard needed | Fixed: `useSaveNote.ts:113-114` keeps pending until navigation. | Plan (verified) |
| Campaign delete | Not applicable | Feature doesn't exist. | Research |

## Scope

**In scope:**
- `rls-policy-matrix.test.ts` (owner / owner-denied / B, per table × operation)
- Extensions: 1.3, 1.7, 1.10, 1.12, 5.1 (content round-trip), 5.4 (add+remove in one edit), C.1
- `tests/http/forged-id.test.ts` + `signInJar` helper
- E2E: notice wording + UI note CRUD, forged URL, map node click
- Test-plan register, cookbook §6.2/6.4/6.5, rate-cap docs

**Out of scope:**
- Any `src/` change or wording change; fixing the two image-route defects
- Consolidating existing tenant pairs; component-test (jsdom/RTL) setup
- Rewriting tests research marked "Fits"; image compression/HEIC/Safari

## Architecture / Approach

Tests only, in existing harnesses: Vitest `integration` and `http` projects and the Playwright `tests/e2e` directory, all already run by CI `local-stack`. Two real users per file via `createTestUser`; seeding only through the owner's anon-key client; "denied" is proven by owner re-read, because RLS row denial is silent in PostgREST.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Integration | Rate cap 50, RLS policy matrix, 7 extensions | Asserting errors where RLS silently filters rows |
| 2. HTTP forged-ID | B-on-A route matrix incl. images, mixed ids, forged cookie | Image rows returning 400 before the ownership check |
| 3. E2E | Pinned notice wording via UI CRUD, forged URL, map click | React Flow `client:only` hydration timing |
| 4. Docs | Scenario register, cookbook, defects logged for S-04 | Register missing a research scenario id |

**Prerequisites:** local Supabase (`npx supabase start`), fresh `npm run build`, Playwright Chromium installed.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Auth-call budget (~35 of 50) is an estimate; if 429s appear, raise the cap further (user-approved path).
- Matrix expectations come from reading the migrations; a cell that disagrees at runtime is a finding to triage, not to "fix" the test.

## Success Criteria (Summary)

- Every research scenario id is in the register with a CI test or "not applicable".
- `npm test`, `test:http` and `test:e2e` are green locally and in CI.
- Changing any notice line or breaking an RLS/page ownership check makes a test fail.
