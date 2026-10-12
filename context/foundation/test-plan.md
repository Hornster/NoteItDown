# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-12

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `tests/`, `scripts/`, `supabase/` (last 30 days, 33 commits; docs, `context/`, lockfiles and build output excluded).

Rollout phases reuse the roadmap M-2 change IDs (F-01, S-01, S-02, S-03) rather than opening parallel `testing-*` changes.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                | Impact | Likelihood | Source (evidence — not anchor)                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A signed-in user reads or modifies another user's campaign or note by supplying its ID (forged URL or request body)                    | High   | High       | interview Q1, Q3, Q4; prd-v2 FR-008 (per-user/campaign isolation); hot-spot dirs `src/pages/api` (22), `src/pages/campaigns` (23) |
| 2   | An anonymous user reaches a protected page or API route, or a signed-out session keeps access                                          | High   | Medium     | interview Q4; prd-v2 FR-010; roadmap S-01; hot-spot dir `src/` (route-guard churn)                                                |
| 3   | A migration or RLS policy change locks owners out of their existing rows, or opens rows to other users                                 | High   | Medium     | interview Q2, Q3; hot-spot dir `supabase/migrations` (8)                                                                          |
| 4   | Signup / signin / signout / session behavior regresses when the constants sweep or theme revamp edits auth routes and pages            | High   | Medium     | prd-v2 FR-010 + Constraints (sequencing); roadmap S-04, S-05 risks                                                                |
| 5   | Creating or editing a note loses its text, or relation re-detection / relation-change notice wording drifts during the constants sweep | Medium | Medium     | interview Q5; prd-v2 FR-011, FR-012; roadmap S-04 risk; hot-spot dir `src/lib` (30)                                               |
| 6   | The e2e layer flakes or silently skips in CI, so risk tests read green without having run                                              | Medium | Medium     | prd-v2 FR-007, Open Question 1; roadmap F-01                                                                                      |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                    | Must challenge                                                          | Context `/10x-research` must ground                                                                                            | Likely cheapest layer                                                               | Anti-pattern to avoid                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| #1   | User B gets a denied / not-found response with no data returned and no row written for every read, update and delete aimed at user A's campaign or note — including note IDs reached through a campaign B owns | "RLS exists, so routes are safe"; "200 with an empty body means denied" | every entry point taking a campaign or note ID; which Supabase client/key each uses; how DB errors are translated to responses | integration against local Supabase with two real users; one e2e forged-URL scenario | happy-path tests using only own IDs; mocking Supabase so RLS never executes                                               |
| #2   | Every protected route redirects (pages) or returns 401 (API) with no session and after signout                                                                                                                 | "the redirect works on one page, so it works on all"                    | how protected routes are registered and matched; API vs page handling in the guard                                             | HTTP-level integration over an enumerated route list; e2e for the redirect          | hand-picking a few routes instead of enumerating all of them                                                              |
| #3   | On a database with existing rows, the owner retains full CRUD and a second user still gets nothing, for every table and the image storage bucket                                                               | "the migration applied cleanly, so access is intact"                    | RLS policies per table × operation; storage policies; how test fixtures are seeded                                             | integration policy matrix (user × table × operation)                                | asserting that policies exist rather than what they allow; seeding and asserting via the service role, which bypasses RLS |
| #4   | Signup → signin → protected page → signout → redirect works end to end with unchanged status codes and messages                                                                                                | "unit tests on schemas cover auth"                                      | cookie session shape; confirm-email behavior on local Supabase                                                                 | e2e for the session chain; integration for API status/messages                      | expected messages copied from the code under test (oracle problem) — take wording from the PRD / current UI baseline      |
| #5   | Saved note text round-trips unchanged; the relation-change notice wording and the added/removed relations match the spec                                                                                       | "existing relation tests already pin the notice wording"                | which relation/notice tests already exist and what they assert; source of the notice wording                                   | extend existing integration/unit tests; e2e only if the UI save path is uncovered   | duplicating existing tests; whole-response snapshots                                                                      |
| #6   | The e2e job fails when a scenario fails, and fails loudly when Supabase or the server is unreachable                                                                                                           | "the job passed, so the tests ran"                                      | how CI starts local Supabase and the preview server; whether the `smoke` job setup can be shared                               | CI job plus a one-off deliberately-broken-test check                                | retries masking flakiness; a job that skips on missing env instead of failing                                             |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                 | Goal (one line)                                                                                                | Risks covered | Test types                                                  | Status                                                             | Change folder                               |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| 1   | E2E foundation             | Prove one sign-in e2e scenario runs on local Supabase and fails loudly in CI                                   | #6, #4 (seed) | e2e + CI job                                                | implemented (CI proof runs P1–P6 in change folder `proof-runs.md`) | context/changes/e2e-framework-spike/        |
| 2   | Access control & isolation | Prove cross-user reads/writes are denied and RLS holds for existing rows; pin note text and relation behavior  | #1, #3, #5    | integration (policy matrix) + http forged-ID + targeted e2e | implemented                                                        | context/changes/notes-relations-risk-tests/ |
| 3   | Auth & route guard         | Prove every protected route rejects anonymous and signed-out users; pin the auth flow before S-04/S-05 edit it | #2, #4        | HTTP-level integration + e2e                                | implemented                                                        | context/changes/auth-risk-tests/            |
| 4   | Per-file feedback gate     | Run lint + related unit tests for each edited file within ~10 s                                                | cross-cutting | post-edit hook                                              | implemented (hooks + proof wired in `ci`)                          | context/changes/per-file-check-hook/        |

Phase 2 maps to roadmap S-02 (`notes-relations-risk-tests`), Phase 3 to S-01 (`auth-risk-tests`), Phase 4 to S-03 (`per-file-check-hook`). Phases 2 and 3 depend only on Phase 1; Phase 2 is ordered first because data isolation is the top user concern (interview Q1).

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

Test-base profile: **sparse** — Vitest configured with `unit`, `hooks`, `integration` and `http` projects; middleware and every page/API route are covered by the `http` route-guard matrix, plus a signed-in forged-ID matrix (user B on user A's ids); the auth session chain and the UI note CRUD / relation-notice / memory-map flows by Playwright e2e; no component-level UI tests.

| Layer         | Tool                                           | Version | Notes                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit          | Vitest (`unit` project)                        | 5.0.1   | `npm run test:unit`; no external services                                                                                                                                                                                                                                          |
| integration   | Vitest (`integration` project)                 | 5.0.1   | `npm run test:integration`; local Supabase only, files run serially                                                                                                                                                                                                                |
| http          | Vitest (`http` project)                        | 5.0.1   | `npm run test:http`; raw `fetch` against its own production preview on port 4323; needs local Supabase and a fresh build; not part of `npm test`; added by Phase 3 (`auth-risk-tests`), extended by Phase 2 (`forged-id.test.ts`, signed-in forged-ID matrix); checked: 2026-10-12 |
| smoke         | `scripts/smoke.mjs`                            | n/a     | dependency-free auth smoke against a running server; not a test suite                                                                                                                                                                                                              |
| e2e           | Playwright (`@playwright/test`, Chromium only) | 1.64.0  | `npm run test:e2e`; confirmed by Phase 1 (`e2e-framework-spike`); runs in CI `local-stack` job against local Supabase; `retries: 0`, `forbidOnly` in CI; checked: 2026-10-09                                                                                                       |
| accessibility | none — out of scope                            | —       | palette contrast is checked manually per prd-v2                                                                                                                                                                                                                                    |

**Stack grounding tools (current session):**

- Docs: Context7 — resolved Playwright (`/microsoft/playwright`, versions through v1.63); installed 1.64.0 in Phase 1; checked: 2026-10-09
- Search: Exa.ai — available, not used (no discovery question at plan level); checked: 2026-10-09
- Runtime/browser: Claude in Chrome — available for manual verification only, not a test layer; checked: 2026-10-09
- Provider/platform: none (no GitHub, Supabase or Cloudflare MCP in this session); checked: 2026-10-09

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                      | Where                                  | Required?                                                                                                                               | Catches                                         |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| lint + `astro check` + build              | local + CI (`ci` job)                  | required (wired)                                                                                                                        | syntactic / type drift                          |
| unit tests                                | local + CI (`ci` job)                  | required (wired)                                                                                                                        | logic regressions in `src/lib`                  |
| integration tests                         | CI (`local-stack` job, local Supabase) | required (wired); extended by §3 Phase 2–3; the `http` route-guard suite (`npm run test:http`) runs in the same job right after `build` | service, DB function, RLS and route regressions |
| e2e on risky flows                        | CI on push (`local-stack` job)         | required (wired by §3 Phase 1); scenarios added by §3 Phase 2–3                                                                         | broken auth / isolation user paths              |
| per-file hook (lint + related unit tests) | local (agent / editor loop)            | recommended (wired by §3 Phase 4; proof `npm run test:hooks` in `ci` job)                                                               | regressions at edit time                        |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the unit under test, `src/**/<module>.test.ts`.
- **Run locally**: `npm run test:unit`.
- Pattern notes: the per-file hook resolves related tests through Vitest's import graph (`vitest related`), so a new unit test is picked up for a file as long as it imports that file.

### 6.2 Adding an integration test

- **Location**: `tests/integration/**/*.test.ts`; requires `npx supabase start`.
- **Run locally**: `npm run test:integration`.
- Pattern notes — two-user cross-ownership: create a pair with `createTestUser` (anon-key signup, so RLS really runs; never the service role) and seed A's rows through A's client. RLS denial is silent in PostgREST: a B-side `update`/`delete` returns no error and zero rows, so assert the outcome (`.select()` returns `[]`, service `not_found`, RPC `P0002`) and then **re-read the row as the owner** to prove nothing was written. Only column-grant violations error (42501). Add a positive control (A can do the same thing) so a denial cannot come from broken setup. Create the minimum number of users per file (shared auth rate limit).

### 6.3 Adding an e2e test

- **Location**: `tests/e2e/**/*.spec.ts`; requires `npx supabase start`, a fresh `npm run build` and `npx playwright install chromium` once.
- **Run locally**: `npm run test:e2e` — Playwright starts the production preview on port 4322 itself (locally it reuses a server already on 4322, so stop stale servers first). See `TESTING.md`.
- **Seed** users through the API with `createTestUser` (`tests/support/test-user.ts`), which returns `email`, `password` and the user's `campaignId`; create the minimum number of users per run — local GoTrue's auth rate limit (50 / 5 min / IP, raised from 30 in `supabase/config.toml`) is shared with integration and smoke in CI.
- **Assert a session-only outcome**: the app degrades to "anonymous" (not an error) when Supabase is down, so final assertions must be unreachable for an anonymous visitor — e.g. the exact `/campaigns/<campaignId>` URL of the seeded user plus a visible "Sign out" control. Never assert only something a signed-out visitor also sees.
- Pin UI wording via a user-approved `UI_BASELINE` literal in the spec, never imported from `MESSAGES` (oracle problem).
- Role/label locators; wait for island hydration (`astro-island:not([ssr])`) before filling a React form, or controlled state wipes the input.
- The global setup's `assertLocalSupabase("e2e")` preflight fails the run with a Supabase-named error when env is missing or Supabase is unreachable; do not add skips.
- CI failure: download the `playwright-report` artifact and open `trace.zip` with `npx playwright show-trace`.

### 6.4 Adding a test for a new protected route or API endpoint

- **Location**: `tests/http/**/*.test.ts` (Vitest `http` project); `npm run test:http` needs local Supabase and a fresh `npm run build`, and starts its own preview on port 4323. See `TESTING.md`.
- **New protected page** (`src/pages/**/*.astro`): nothing to write. The matrix derives routes from the file tree and fails if the page does not redirect anonymous users to sign-in. Register the prefix in `PROTECTED_ROUTES` (`src/middleware.ts`) or the suite will fail.
- **New public page**: add its path to `PUBLIC_ROUTES` in `tests/http/support/route-inventory.ts`; the suite then excludes it from the denial matrix and fails if the entry no longer exists on disk (it does not assert the page is reachable).
- **New API handler** (`src/pages/api/**/*.ts`): automatically covered by its exported method (`GET`, `POST`, ...); anonymous callers must get 401. A route file with no detectable method export fails the suite by name.
- Send `Origin: <base URL>` on every POST (Astro `checkOrigin`). Probe double-slash variants with a deeper path (e.g. `//campaigns/<uuid>`).
- **Forged-ID ownership** (`tests/http/forged-id.test.ts`): seed users with `createTestUser`, get cookie jars with `signInJar` (`tests/http/support/session.ts`, one auth call each), seed A's data with distinctive strings, then send B's jar (`jar.clone()`) at A's ids. Expect 404 (HTML for pages, JSON for APIs), none of A's distinctive data in the body, and an owner re-read at the end showing A's data unchanged. Include mixed ids (B's campaign with A's note; A's note under A's other campaign) and an A-jar positive control. Image routes validate the body before the ownership lookup, so send schema-valid bodies with lowercase ids (commit `path` must pass `isOwnImagePath` for the caller), or the row answers 400 and proves nothing.

### 6.5 Adding a test for a new migration or RLS policy

- Pattern: `tests/integration/rls-policy-matrix.test.ts`, one `it.each` table per concern (owner on existing rows, owner-denied operations, other user on direct-table access) over every table × operation. Seed shared rows through the owner's client and never mutate them; give each mutating cell its own disposable target. Re-assert the row still exists before every "unchanged" re-read.
- Add a row for each new table or policy: the owner's granted operations, the operations that must stay denied (no policy or column grant: expect 42501 or zero rows), and the other user's attempt (insert 42501, update/delete zero rows then owner re-read).
- Break-check the matrix: weaken the policy in an uncommitted scratch migration and `npx supabase db reset`. For notes between users weaken both `notes_select_own_campaign` and `notes_update_own_campaign`, otherwise the select policy still hides the row and the update test stays green.

### 6.6 Per-rollout-phase notes

(Appended by each phase's final sub-phase.)

**Phase 3 - Auth & route guard (`auth-risk-tests`, implemented 2026-10-11)**

- `UI_BASELINE` in `tests/e2e/auth-session.spec.ts` pins the sign-in and duplicate-signup wording; approved by the user 2026-10-11. `signupDuplicateEmail` is a labelled characterization of the current (enumerable) wording, so S-04 must change it on purpose.
- Smoke seams fixed: the signout step now requires an exact `/` location, and the signin step clears the cookie jar so the dashboard step proves signin set the session.
- Known defects deliberately left for S-04 (logged, not pinned, not fixed):
  - a malformed (non-form) body to `/api/auth/signin|signup` returns 500 (`formData()` before validation, no zod);
  - the prefix match over-matches (`/mapping`, `/notesX`); harmless today, no such routes exist;
  - raw Supabase `error.message` is passed in `?error=` (no `MESSAGES` mapping; possible account enumeration);
  - 4 API files use literal 401s instead of `HTTP_STATUS`/`MESSAGES` (constants sweep).

**Phase 2 - Access control & isolation (`notes-relations-risk-tests`, implemented 2026-10-12)**

- `UI_BASELINE` in `tests/e2e/notes-relations.spec.ts` pins the relation-change notice wording line by line; approved by the user 2026-10-11 in `/10x-plan`. S-04 must change it on purpose when it moves the text.
- Local GoTrue `sign_in_sign_ups` raised 30 → 50 (`supabase/config.toml`); a running stack needs `npx supabase stop && npx supabase start` to pick it up.
- Known defects deliberately left for S-04 (logged, not pinned, not fixed):
  - an uppercase UUID in `campaignId`/`noteId` on image upload/commit returns 500 (`isUuid` is case-insensitive, `isOwnImagePath` embeds the URL ids verbatim, the DB path-shape check is lowercase);
  - a replayed image commit returns 500 when a free slot exists (unique `path`, 23505, falls into "unexpected"); `note-images.test.ts` asserts only that the replay fails and the objects survive.
- Constants gap left for S-04 (impl-review F3): `HTTP_STATUS` has no `FOUND`, so `tests/http/` asserts redirects with a literal `302` (`support/assertions.ts`, `support/session.ts`, `session-revocation.test.ts`, `forged-id.test.ts`). S-04 adds `HTTP_STATUS.FOUND` and replaces those literals.
- Named scenario register (scenario ids from `research.md`; test names abbreviated). Matrix cell names in `rls-policy-matrix.test.ts` are the `it.each` `name` values.

| Id   | Scenario                                                               | Test (file → name)                                                                                                                                                                                                                                                                                               | Verdict / notes                                         |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1.1  | B reads A's campaign                                                   | `tests/integration/campaigns-service.test.ts` → "getCampaign returns null for another tenant's id and for a malformed id"                                                                                                                                                                                        | Fits                                                    |
| 1.2  | Forged `last_campaign_id` falls back to own campaign                   | `campaigns-service.test.ts` → "resolveLandingCampaign falls back to the oldest for undefined, a foreign id and a malformed id"; route level: `tests/http/forged-id.test.ts` → "1.2 forged last_campaign_id cookie (route level)"                                                                                 | Fits (service) + New (http)                             |
| 1.3  | B renames A's campaign                                                 | `campaigns-service.test.ts` → "renaming tenant A's campaign as tenant B maps to not_found and leaves A's name unchanged"                                                                                                                                                                                         | Extended (owner re-read)                                |
| 1.4  | B creates a note in A's campaign                                       | `tests/integration/create-note-function.test.ts` → "rejects tenant B using tenant A's campaign id with an existing type id, unchanged counts" and "... with a new type name, unchanged counts"                                                                                                                   | Fits                                                    |
| 1.5  | B reads A's note                                                       | `tests/integration/notes-service.test.ts` → "getNote returns null for another tenant's note"                                                                                                                                                                                                                     | Fits                                                    |
| 1.6  | B updates/deletes A's note via the RPC                                 | `tests/integration/note-edit-delete-functions.test.ts` → "returns P0002 for a foreign user's note or a wrong campaign id, changing nothing"                                                                                                                                                                      | Fits                                                    |
| 1.7  | B updates A's note via the service layer                               | `notes-service.test.ts` → "updateNote with A's campaign id and B's client maps to not_found and writes nothing"                                                                                                                                                                                                  | Extended (owner re-read)                                |
| 1.8  | B deletes A's note via the service layer                               | `notes-service.test.ts` → "deleteNote removes the note, reports its relations, and maps a missing note to not_found"                                                                                                                                                                                             | Fits                                                    |
| 1.9  | B reads A's relations                                                  | `tests/integration/relation-detection.test.ts` → "listRelations › returns an empty list when tenant A queries tenant B's campaign id"                                                                                                                                                                            | Fits                                                    |
| 1.10 | B's `note_images` select/insert/update/delete on A's rows              | `tests/integration/note-images.test.ts` → "hides rows from other tenants and cascades when the note is deleted"; "note_images table: tenant B writes › denies B inserting a row for A's note and leaves A's alt_text untouched on B's update"                                                                    | Extended (owner re-read, B writes)                      |
| 1.11 | B's storage upload, sign, list and remove on A's objects               | `note-images.test.ts` → "storage.objects policies › blocks tenant B from uploading into A's folder or under A's note id"; "blocks tenant B from signing upload URLs ..."; "blocks tenant B from listing, signing or removing A's objects"                                                                        | Fits                                                    |
| 1.12 | B calls the image service read path on A's image                       | `note-images.test.ts` → "tenant B cannot read A's committed image through the services (1.12)"                                                                                                                                                                                                                   | New                                                     |
| 1.13 | B's session on A's ids: pages and campaign/note/image APIs             | `tests/http/forged-id.test.ts` → "1.13 B's session on A's ids: pages" (7 pages), "1.13 B's session on A's ids: APIs"; positive control "A's own jar is served A's note page"; "A's data is unchanged after every forged write"                                                                                   | New                                                     |
| 1.14 | Mixed ids (B's campaign + A's note; A's note under A's other campaign) | `forged-id.test.ts` → "1.14 mixed ids" (page, API and image rows for both directions, plus control)                                                                                                                                                                                                              | New                                                     |
| 1.15 | Browser forged URL: B opens A's note URL                               | `tests/e2e/notes-relations.spec.ts` → "a signed-in user opening another user's note URL gets a 404 without the note's data"                                                                                                                                                                                      | New                                                     |
| 3.1  | B gets nothing per table × operation (direct table access)             | `tests/integration/rls-policy-matrix.test.ts` → "tenant B gets nothing on direct table access (3.1)" (insert 42501 on notes/relations/note_types; update/delete zero rows on campaigns/notes/relations)                                                                                                          | New                                                     |
| 3.2  | Owner keeps CRUD on existing rows                                      | `rls-policy-matrix.test.ts` → "owner keeps CRUD on existing rows (3.2)" (campaigns, notes, relations, note_types, note_images alt_text)                                                                                                                                                                          | New                                                     |
| 3.3  | Denied operations stay denied for the owner                            | `rls-policy-matrix.test.ts` → "owner-denied operations stay denied (3.3)" (`campaigns.owner_id`, `notes.campaign_id`, relations/note_types update, note_types delete, storage upsert)                                                                                                                            | New                                                     |
| 3.4  | Relations only within a campaign and for the same user                 | `relation-detection.test.ts` → "creates no relation across tenants when tenant B's note names tenant A's note"; `campaigns-service.test.ts` → "a note in campaign 2 mentioning a campaign 1 note name produces no relation in either campaign"                                                                   | Fits                                                    |
| 5.1  | Note content round-trips unchanged                                     | `create-note-function.test.ts` → "round-trips $label content exactly"; `note-edit-delete-functions.test.ts` → "update round-trips $label content exactly"                                                                                                                                                        | Extended (multi-line, Unicode, whitespace, 20000 chars) |
| 5.2  | Mention matching rule                                                  | `relation-detection.test.ts` → "note_mentions" `it.each` cases                                                                                                                                                                                                                                                   | Fits                                                    |
| 5.3  | Create, edit, rename, delete add/remove the right relations            | `relation-detection.test.ts` (create, reverse, rename, cascade); `note-edit-delete-functions.test.ts` → "content edit adding a mention ...", "rename breaking a mention ...", "delete returns the name and every former neighbour ..."; `notes-service.test.ts` → "updateNote returns the change set on success" | Fits                                                    |
| 5.4  | One edit both adds and removes a relation                              | `note-edit-delete-functions.test.ts` → "one edit that both adds and removes a relation reports both sets"                                                                                                                                                                                                        | Extended                                                |
| 5.5  | Relation-change notice wording (edit and delete variants)              | `notes-relations.spec.ts` → "note create, edit and delete through the UI show the approved relation notices" (steps for added, removed, added+removed, unchanged, type-only, delete with/without relations)                                                                                                      | New (`UI_BASELINE`)                                     |
| C.1  | Campaign create, duplicate, rename, list                               | `campaigns-service.test.ts` → "createCampaign creates ...", "createCampaign maps a duplicate name ...", "renameCampaign succeeds ...", "listCampaigns returns oldest first ...", "listCampaigns never contains another tenant's campaign ids"                                                                    | Fits + extended (list isolation)                        |
| C.2  | Campaign delete                                                        | none                                                                                                                                                                                                                                                                                                             | Not applicable: no delete feature                       |
| C.3  | Note create, view, edit, delete through the UI                         | `notes-relations.spec.ts` → steps "create notes through the form" through "delete a note without relations ..."                                                                                                                                                                                                  | New                                                     |
| M.1  | Map shows only the campaign's own notes; foreign map is 404            | `relation-detection.test.ts` → "listRelations" cases; route level: `forged-id.test.ts` → "1.13 ... pages" row `/campaigns/{A}/map`                                                                                                                                                                               | Fits (service) + New (http)                             |
| M.2  | Clicking a map node opens the note page                                | `notes-relations.spec.ts` → step "map node click opens the note page"                                                                                                                                                                                                                                            | New                                                     |

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Image compression and HEIC conversion edge cases** — images are optional on notes, text is not; existing unit tests stay, no new budget. Re-evaluate if image upload becomes required or a per-user storage quota lands. (Source: Phase 2 interview Q5.)
- **Safari image upload/view** — parked by prd-v2 FR-015. Re-evaluate when Safari users appear. (Source: prd-v2.)
- **Coverage-percentage targets and a full e2e suite** — prd-v2 Non-Goals; e2e covers only the risky flows. (Source: prd-v2.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-12
- Stack versions last verified: 2026-10-09
- AI-native tool references last verified: 2026-10-09

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
