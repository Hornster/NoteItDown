---
date: 2026-10-11T18:11:35+02:00
researcher: Claude (Opus 5.5) with 3 Sonnet research subagents
git_commit: 1054cf776461aaae70035b6b33c54138a22a1405
branch: notes-relations-risk-tests
repository: NoteItDown
topic: "S-02 existing test coverage vs roadmap + test-plan risks: what fits, what to extend, what is missing"
tags: [research, testing, isolation, rls, relations, relation-notice, memory-map, S-02]
status: complete
last_updated: 2026-10-11
last_updated_by: Claude (Opus 5.5)
---

# Research: S-02 coverage of existing tests and blind spots

**Date**: 2026-10-11T18:11:35+02:00
**Researcher**: Claude (Opus 5.5), with three read-only Sonnet subagents (coverage inventory; entry points + RLS; PRD/prior decisions/harness)
**Git Commit**: 1054cf7
**Branch**: notes-relations-risk-tests
**Repository**: NoteItDown

## Research Question

Check the existing tests against `context/foundation/roadmap.md` S-02 and `context/foundation/test-plan.md` Phase 2 (risks #1, #3 and #5) for coverage and blind spots. For each scenario: does an existing test already fit, should one be extended or modified, or is a new test needed?

Scope references:
- Roadmap S-02 outcome: named risk scenarios for notes and campaigns CRUD, automatic relation management (including pinned notice wording), memory-map navigation, and per-user/per-campaign isolation, with at least one CI test each (`roadmap.md:107-118`).
- Test-plan Phase 2 covers risks #1, #3 and #5 (`test-plan.md:71`), with the proof criteria at `test-plan.md:55-59`.

## Summary

1. **Isolation is already well covered at the service/RPC layer, but nowhere at the HTTP/page layer.**
   - All 6 integration files create two real users through `createTestUser()`. That helper signs up with the anon key (`tests/support/test-user.ts`), so RLS genuinely runs.
   - A grep for `service_role` / `SERVICE_ROLE` over `tests/` and `src/` found 0 hits.
   - No test sends a signed-in second user's request to a page or `/api/campaigns/**` route. The `tests/http` suite covers only anonymous and signed-out access, using one user (`tests/http/session-revocation.test.ts:20`).
2. **The code holds up under forged IDs.**
   - Every user-callable SQL function is `security invoker`. Only the two signup triggers are definer functions (`supabase/migrations/20260922120000_campaign_notes_schema.sql:166-202`).
   - Pages and API routes in the inspected set answer 404 for a foreign or mismatched ID. Two examples: `notes/[noteId].astro:37,40` checks `found?.campaign_id === campaign.id`, and `map.astro:23` returns 404 for a foreign campaign.
   - No 200-with-empty-body or silent no-op was found. S-02 tests would pin this behaviour; they are not expected to expose a leak.
3. **The relation-change notice wording is pinned nowhere.**
   - The strings are inline JSX in `src/components/notes/RelationChangeNotice.tsx:63-78` and do not appear in `MESSAGES` or anywhere else in `src/` (grep).
   - `src/lib/relation-notice.test.ts` tests only the sessionStorage transport.
   - No component-test setup (jsdom/RTL) exists, so the cheapest real pin is an e2e test through the UI save path. That is exactly the "e2e only if the UI save path is uncovered" case in `test-plan.md:59`.
   - This must land before S-04 moves the text (`prd-v2.md:168-171,193`).
4. **The RLS policy matrix (risk #3) is covered for the cross-user side, but only in pieces.**
   - There is no systematic owner × table × operation matrix.
   - Direct-table writes by user B to `notes`, `campaigns` and `relations` (bypassing the RPCs) are not tested.
5. **Memory-map navigation and the notes/campaign UI flows have no tests beyond layout math** (`src/lib/memory-map-layout.test.ts`).
6. **The auth rate limit is tight.**
   - Local GoTrue allows 30 sign-in/sign-ups per 5 minutes (`supabase/config.toml:190`), shared by integration, http, e2e and smoke in CI.
   - Current usage is an estimated ~24 calls: integration 12 (6 files × 2 `createTestUser`), http 2, e2e ~7, smoke 3. This is an estimate, not measured.
   - New S-02 users must therefore be few, or existing per-file pairs consolidated.

## Detailed Findings

### Scenario catalogue: fits / extend / new

Verdicts:
- **Fits**: an existing test meets the test-plan proof criteria, so keep it and map it to a named scenario.
- **Extend**: an existing test is close, so add assertions to it.
- **New**: no existing test is close enough.

#### Risk #1: forged-ID isolation (user B against user A's data)

| # | Scenario | Existing test | Verdict |
|---|---|---|---|
| 1.1 | B reads A's campaign | `tests/integration/campaigns-service.test.ts:131` (`getCampaign` returns null for a foreign or malformed id) | Fits |
| 1.2 | Forged `last_campaign_id` cookie falls back to the user's own campaign | `campaigns-service.test.ts:149,158` (`resolveLandingCampaign`) | Fits at service level. A route-level check (`/dashboard`, `/map`, `/notes/new` give a 302 to the own campaign) is new and optional. |
| 1.3 | B renames A's campaign | `campaigns-service.test.ts:119` (asserts `not_found`) | **Extend**: re-read the name with the owner's client and assert it is unchanged ("no row written", `test-plan.md:55`). |
| 1.4 | B creates a note in A's campaign | `tests/integration/create-note-function.test.ts:153,170` (42501, A's note and type counts unchanged) | Fits |
| 1.5 | B reads A's note | `tests/integration/notes-service.test.ts:96` (null for B, positive control for A) | Fits |
| 1.6 | B updates or deletes A's note via the RPC, with A's campaign id or with B's own | `tests/integration/note-edit-delete-functions.test.ts:305` (P0002 both ways; A re-reads name and content at :332-334) | Fits |
| 1.7 | B updates A's note via the service layer | `notes-service.test.ts:144` uses B's own campaign id only and does not re-read | **Extend**: add the case with A's campaign id and B's client, then re-read as A. |
| 1.8 | B deletes A's note via the service layer | `notes-service.test.ts:177` (B gets `not_found`; A's later successful delete proves the row survived) | Fits |
| 1.9 | B reads A's relations | `tests/integration/relation-detection.test.ts:341` (`[]`, with a positive control) | Fits |
| 1.10 | B's `note_images` select/delete on A's rows | `tests/integration/note-images.test.ts:167` (B gets `[]`) | **Extend**: re-read A's row as A after B's delete. Add B insert/update on A's note id. |
| 1.11 | B's storage upload, sign, list and remove on A's objects | `note-images.test.ts:191,212,219` (denied; A's object survives at :235) | Fits |
| 1.12 | B calls the image service read path (`getImageUrls`, `listNoteImages`, `toImageViews`) on A's image | none. These run only as the owner. | **New** (integration, same file) |
| 1.13 | **Route level**: B's session on A's ids. Pages: `/campaigns/{A}`, `/edit`, `/map`, `/notes/new`, `/notes/{noteA}`, `/notes/{noteA}/edit`. API: `PATCH /api/campaigns/{A}`, `POST .../notes`, `PATCH`/`DELETE .../notes/{noteA}`, image routes. Expect 404, no A data in the body, and A's data unchanged. | none (the `tests/http` suite is anonymous/signed-out only) | **New** (http project, two signed-in cookie jars) |
| 1.14 | Mixed-ID route case: B's own `campaignId` with A's `noteId`, and A's own note under A's other campaign | RPC level only (`note-edit-delete-functions.test.ts:305`). Pages use a separate check (`notes/[noteId].astro:37`, `edit.astro:34`). | **New** (http, same file as 1.13) |
| 1.15 | **One e2e forged-URL scenario** (`test-plan.md:55`): B signed in through the UI opens A's note URL and sees the 404 text "This campaign doesn't exist or isn't yours." / not-found, with no A content | none | **New** (e2e) |

#### Risk #3: RLS / storage policy matrix

The policies, read from the migrations, give this matrix:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| campaigns | owner | owner | owner, column grant `name` only | owner |
| note_types | own campaign | own campaign, non-predefined | no policy | no policy |
| notes | own campaign | own campaign | own campaign, columns `name`/`content`/`type_id` | own campaign |
| relations (`20260922120000…sql:127-141`) | own campaign | own campaign | **no policy** | own campaign |
| note_images | own campaign | own campaign + path prefix = uid | own campaign, column `alt_text` only | own campaign |
| storage `note-images` | folder[1] = uid | folder = uid + owned note/campaign | **no policy** | folder[1] = uid |

Composite foreign keys stop relations, images and note types from crossing campaigns. These are summarised from the subagent's full read of the migrations; I spot-checked the `relations` policies.

| # | Scenario | Existing test | Verdict |
|---|---|---|---|
| 3.1 | Cross-user side: B gets nothing per table × operation | Scattered across 1.1–1.11 above. Direct-table B `insert`/`update`/`delete` on `notes`, `campaigns` and `relations` is untested (the RPC path only is tested). | **New**: one `it.each` policy-matrix file in `tests/integration/`. Reuse existing tests where they already fit; do not duplicate them. |
| 3.2 | Owner keeps full CRUD on existing rows | Only implicit (service-flow side effects) | **New**, in the same matrix file. Seed via the owner's client, never via the service role (`test-plan.md:57`). |
| 3.3 | Denied operations stay denied for the owner (`relations` UPDATE, storage UPDATE, `note_types` UPDATE/DELETE, column grants such as `campaigns.owner_id` and `notes.campaign_id`) | Partly: `note-images.test.ts:146` (path update gives 42501) | **New** (matrix file) |
| 3.4 | Relation created only within a campaign and only for the same user | `relation-detection.test.ts:258` and `campaigns-service.test.ts:169` | Fits |

#### Risk #5: note text and relation behaviour

| # | Scenario | Existing test | Verdict |
|---|---|---|---|
| 5.1 | Note content round-trips unchanged on create and edit | Only a short ASCII string on update (`note-edit-delete-functions.test.ts:135`). Create asserts name and type only. The zod schema preserves whitespace (`src/lib/schemas/notes.test.ts:51-55`). | **Extend**: add multi-line, Unicode/emoji, leading/trailing whitespace and near-20000-character content in `note-edit-delete-functions.test.ts` (update) and `create-note-function.test.ts` (create). Re-read with `getNote`. |
| 5.2 | Mention matching rule (word boundaries, case, Unicode, metacharacters) | `relation-detection.test.ts:118` (9 cases) | Fits |
| 5.3 | Create, edit, rename and delete add or remove the right relations | `relation-detection.test.ts:137-290`; `note-edit-delete-functions.test.ts:119,142,172,190,337`; `notes-service.test.ts:127,177` | Fits |
| 5.4 | One edit both adds and removes a relation (both lists non-empty) | none | **Extend** `note-edit-delete-functions.test.ts` (sibling of :119/:142) |
| 5.5 | **Relation-change notice wording**: the edit cases (added / removed / unchanged / type-only "Saved" only) and the delete cases (removed / "No relations touched.") | none (transport only: `src/lib/relation-notice.test.ts:27-107`) | **New** e2e spec with a literal `UI_BASELINE` approved by the user. Copy the pattern in `tests/e2e/auth-session.spec.ts:6-12`. Never import the expected text. |

#### Notes/campaign CRUD and memory map (roadmap S-02 outcome)

| # | Scenario | Existing test | Verdict |
|---|---|---|---|
| C.1 | Campaign create, duplicate, rename, list | `campaigns-service.test.ts:50-136` | Fits. Optionally extend :136 to assert B's campaigns are absent from A's list. |
| C.2 | Campaign delete | Not applicable. There is no delete feature: `src/pages/api/campaigns/**` exports only POST and PATCH, and there is no service function. | Not a scenario. Record it as "not applicable" rather than leave it a gap. |
| C.3 | Note create, view, edit, delete through the UI | none | **New** e2e. It shares setup with 5.5, because the UI save path is what produces the notice. |
| M.1 | Map shows only the campaign's own notes; a foreign campaign map gives 404 | Service level only: `relation-detection.test.ts:326,341` | Route part is covered by 1.13 (`/campaigns/{A}/map` as B). |
| M.2 | Clicking a node navigates to `/campaigns/{cid}/notes/{noteId}` | none. `MemoryMap.tsx:71-73` uses `window.location.assign`. | **New** e2e. `waitForHydration` (`tests/e2e/support/hydration.ts`) keys on a button name, but the map is `client:only` React Flow, so wait for `.react-flow__node` instead. |

### Tests that use forbidden or weak patterns

The full read found none that use the service role, import expected wording from `MESSAGES`, or snapshot whole responses.

The weak-but-correct tests are the "Extend" rows above (1.3, 1.7, 1.10), which check the result but not that no row was written. There are also own-ID-only list-order tests (`campaigns-service.test.ts:136`, `notes-service.test.ts:65`), which are acceptable because separate cross-user tests exist.

The sorted `removed` assertion at `note-edit-delete-functions.test.ts:337` deliberately depends on the RPC's ordering.

No test needs to be modified because it asserts the wrong thing.

### Out-of-scope defects found (log, don't pin)

The entry-point audit inferred the following from the code. None of them were run.
- **Image routes return 500 for an uppercase UUID.** `isUuid` is case-insensitive (`src/lib/utils.ts:8`). But `isOwnImagePath` (`src/lib/services/note-images.ts:82-88`) embeds the URL's ids verbatim, and the DB `note_images_path_shape_check` compares lowercase ids. So an uppercase `campaignId`/`noteId` on upload/commit is expected to return 500 instead of 400/404.
- **A replayed image commit returns 500** when a free slot exists (unique `path`, 23505, falls into "unexpected"). The existing test at `note-images.test.ts:404-436` asserts only `success: false`.

These fit the S-04 defect log in the same way as the four auth defects in `test-plan.md:165-169`. They are not isolation leaks.

## Code References

- `src/lib/supabase.ts:9`: the only Supabase client, built from the anon key plus the session cookie.
- `src/middleware.ts:28-46`: page guard. API routes check `locals.user` themselves.
- `src/pages/campaigns/[campaignId]/notes/[noteId].astro:30,37,40` and `.../edit.astro:27,34,37`: 404 for a foreign campaign and for a note-to-campaign mismatch.
- `src/pages/campaigns/[campaignId]/map.astro:23`: 404 for a foreign campaign.
- `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts`: PATCH and DELETE through the `update_note`/`delete_note` RPCs, with P0002 mapped to 404.
- `src/components/notes/RelationChangeNotice.tsx:63-78`: the unpinned notice wording.
- `src/lib/relation-notice.ts:4`: sessionStorage key `noteitdown:relation-notice`. It is written by `useSaveNote.ts:86` and `useDeleteNote.ts:34`.
- `src/components/memory-map/MemoryMap.tsx:71-73`: node click navigation.
- `supabase/migrations/20260922120000_campaign_notes_schema.sql:127-141`: `relations` policies (select, insert, delete; no update).
- `tests/support/test-user.ts`: `createTestUser()` returns `{client, userId, campaignId, email, password}` and signs up with the anon key. There is no cleanup.
- `tests/http/support/client.ts`: `createJar` and `send`, the cookie-jar HTTP client. Signin happens inline at `tests/http/session-revocation.test.ts:24-31`.
- `tests/e2e/auth-session.spec.ts:6-12`: the `UI_BASELINE` literal-wording pattern.
- `supabase/config.toml:190`: `sign_in_sign_ups = 30`.

## Architecture Insights

- **Authorization is entirely RLS plus URL-scoped filters.** There is no owner comparison in app code. The RPCs filter with `where id = p_note_id and campaign_id = p_campaign_id`, and the pages re-check the note's campaign. Therefore:
  - integration tests with two real users are the right layer for risk #3;
  - http tests are the right layer for risk #1 at the route boundary (404 mapping, no data rendered).
- **`getNote` and `listNoteTypes` take no campaign argument** (`src/lib/services/notes.ts:59,104`). They are safe only because the pages check afterwards. The http mismatch case (1.14) is the test that pins that page-level check.
- **Fit to the layer rule in `test-plan.md:55-59`:**
  - integration: the policy matrix plus extensions;
  - http: the forged-ID route matrix;
  - e2e, limited to: one forged-URL scenario, the notice wording with UI CRUD, and the map click.
- **No new harness is required.** Two helpers would be optional conveniences:
  - a `createTenantPair()` in `tests/integration/helpers.ts`;
  - a `signInJar(user)` in `tests/http/support/`, extracted from `session-revocation.test.ts`.
- New tests go into existing Vitest projects and the existing Playwright directory, so CI needs no change. `local-stack` already runs `test:integration`, `test:http` and `test:e2e`.

## Historical Context (from prior changes)

- `context/archive/2026-10-10-auth-risk-tests/plan.md:52` and `plan-brief.md:41`: cross-user isolation (risks #1 and #3) was explicitly deferred to S-02.
- `context/archive/2026-10-10-auth-risk-tests/research.md:194`: "Authorization (ownership) is delegated entirely to RLS". Supported by this research.
- `context/archive/2026-09-29-note-edit-delete-relation-refresh/plan.md:20-22`: the original notice copy.
  - The user later changed the no-relation delete copy to "No relations touched." (plan.md:22; `impl-review-phase-3.md:48-51`). The code matches the amended copy.
  - `plan-brief.md:16` ("none were removed") is **stale** against the code.
  - The plan's manual scenarios (plan.md:288-290, 352-353, 391-393) are a usable seed list for 5.5.
- `context/archive/2026-09-29-note-edit-delete-relation-refresh/impl-review-phase-3.md:62`: a fast double-submit can replace the notice with a `rechecked: false` one, showing "Saved" only. I did not check whether this was fixed. It matters only if the e2e double-clicks.
- `context/archive/2026-10-09-e2e-framework-spike/research.md:112`: a separate CI e2e job is justified only past a handful of scenarios. S-02 adds about 3 or 4.
- There is a PRD numbering shift. v1 numbers (FR-008 = relation notice, FR-010 = map navigation; `prd.md:79`) differ from v2 (FR-008 = tests, FR-011 = CRUD, FR-012 = relations + notice, FR-013 = map; `prd-v2.md:146-176`). The roadmap uses v2.

## Related Research

- `context/archive/2026-10-10-auth-risk-tests/research.md`: the route guard and the http harness.
- `context/archive/2026-10-09-e2e-framework-spike/research.md`: the e2e harness and the rate limit.

## Open Questions

1. **Notice wording baseline.** The PRD never quotes the copy. The user must approve the `UI_BASELINE` literals taken from the current UI (`RelationChangeNotice.tsx:63-78`), as was done for auth in `test-plan.md:163`. This includes whether the line layout (separate `<p>` lines, "Relations added:" with a colon) is pinned or only the phrases are. Owner: user, during `/10x-plan`.
2. **Rate-limit budget.** S-02 is expected to add about 8 to 10 auth calls to about 24 existing (estimated) against a cap of 30 per 5 minutes. Options:
   - consolidate integration files onto a shared tenant pair;
   - reuse one pair across the new http file;
   - raise `sign_in_sign_ups` in `supabase/config.toml` (local-only config).
   Owner: `/10x-plan`. Measure before deciding.
3. **Defects found out of scope** (uppercase-UUID 500 and replayed-commit 500 on image routes): log them for S-04 or as a follow-up, rather than pin them. Owner: user.
4. **Was the double-submit notice overwrite fixed?** Unverified. It only affects e2e test design. Owner: `/10x-plan`.
5. **Pin the image-route mismatch triples in http (1.13)?** The image routes are in scope for risk #1. Including them grows the http matrix by about 9 requests, with no extra auth calls. Owner: `/10x-plan`.
