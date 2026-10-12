# Notes, Relations & Isolation Risk Tests Implementation Plan

## Overview

Roadmap slice S-02 / test-plan §3 Phase 2 ("Access control & isolation", Risks #1, #3, #5). We give every named S-02 risk scenario — notes & campaigns CRUD, automatic relation management with the **pinned relation-change notice wording**, memory-map navigation, and per-user/per-campaign isolation — at least one test that runs in CI, **before** S-04 moves the notice text (prd-v2 FR-008, FR-011–FR-013). This change is tests-only plus one local config value; no `src/` edits.

## Current State Analysis

From `research.md` (scenario catalogue, verdicts fits / extend / new):

- **Isolation at the service/RPC layer is well covered**: all 6 integration files use two real anon-key users (`createTestUser`), no `service_role` anywhere. Fitting tests: 1.1, 1.2, 1.4, 1.5, 1.6, 1.8, 1.9, 1.11, 3.4, 5.2, 5.3 (see research tables).
- **Weak-but-correct tests** check the result, not that no row was written: 1.3 (`campaigns-service.test.ts:119`), 1.7 (`notes-service.test.ts:144`), 1.10 (`note-images.test.ts:167`).
- **No route-level isolation test**: `tests/http` covers anonymous/signed-out only (`tests/http/session-revocation.test.ts:20`).
- **No RLS matrix**: direct-table writes by user B on `notes`, `campaigns`, `relations` are untested; owner CRUD on existing rows is implicit; owner-denied operations are covered only for the image path column (`note-images.test.ts:146`).
- **Notice wording pinned nowhere**: inline JSX at `src/components/notes/RelationChangeNotice.tsx:63-78`; `src/lib/relation-notice.test.ts` covers only transport. No jsdom/RTL setup, so e2e through the UI save path is the cheapest real pin (`test-plan.md:59`).
- **Memory map / UI CRUD**: no tests beyond layout math (`src/lib/memory-map-layout.test.ts`).
- **Rate limit**: local GoTrue `sign_in_sign_ups = 30` per 5 min (`supabase/config.toml:190`); counted usage today is 24 (integration 12, http 2, e2e 7, smoke 3). S-02 adds ~10.

## Desired End State

- Every scenario in the S-02 register (test-plan §6.6 Phase 2 notes, written in Phase 4) maps to a named test in `tests/integration`, `tests/http` or `tests/e2e`, all running in the CI `local-stack` job.
- User B gets 404 / empty / denied, with no A data in the body and A's rows unchanged, for every page, campaign/note API and image API route that takes an A id.
- The owner keeps full CRUD on existing rows; owner-denied operations stay denied; B gets nothing, per table × operation.
- The relation-change notice wording is pinned line-by-line in an e2e `UI_BASELINE` that S-04 must change deliberately.
- Verify: `npm test`, `npm run build && npm run test:http`, `npm run test:e2e` all green locally against local Supabase; CI green.

### Key Discoveries:

- Double-submit notice overwrite (archived impl-review-phase-3:62) is fixed: `useSaveNote.ts:113-114` keeps `pending` true until navigation. The e2e need not guard against it.
- Notice copy (approved baseline, see Phase 3): `RelationChangeNotice.tsx:63-78`; type-only edit returns `rechecked: false` and shows only the "Saved" line.
- Landing redirects `/dashboard`, `/map`, `/notes/new`, `/campaigns` all go through `resolveLandingCampaign(readRememberedCampaign(cookies))` (`src/pages/dashboard.ts:17`); `/notes/[id]` 404s a foreign note (`src/pages/notes/[id].ts:16-19`).
- Image API routes: `POST .../notes/{noteId}/images/uploads`, `POST .../notes/{noteId}/images`, `GET|PATCH|DELETE .../notes/{noteId}/images/{imageId}`. Uploads/commit check the note before parsing the body for malformed ids (`uploads.ts:25`) but parse and validate the body **before** the ownership lookup (`uploads.ts:32-44`, `images.ts:32-47`).
- Column grants: `campaigns` UPDATE only `name`; `notes` UPDATE only `name, content, type_id` (`20260923120000_restrict_update_columns.sql:6-10`); `note_images` UPDATE only `alt_text` (`20261003120000_note_images.sql:85-86`). `relations` and `note_types` have no UPDATE policy; `note_types` has no DELETE policy.
- HTTP harness: `createJar`/`send` (`tests/http/support/client.ts`); inline signin pattern at `tests/http/session-revocation.test.ts:24-31`. E2E literal-wording pattern: `tests/e2e/auth-session.spec.ts:6-12`. Map is `client:only="react"` (`map.astro:65`), so `waitForHydration` does not apply there.

## What We're NOT Doing

- No `src/` changes, no wording changes, no fixes to the two defects research found (uppercase-UUID 500 on image routes; replayed image commit 500) — they are **logged for S-04** in test-plan §6.6, not pinned and not fixed.
- No campaign-delete scenario: the feature does not exist (C.2) — recorded as not applicable.
- No consolidation of existing integration tenant pairs; no new jsdom/RTL component-test setup.
- No duplication of tests marked "Fits" in research; they are mapped into the register, not rewritten.
- No image compression/HEIC/Safari tests (test-plan §7).
- No separate CI e2e job; new tests ride the existing `local-stack` steps.

## Implementation Approach

One test layer per phase, each independently green, following the layer rule in `test-plan.md:55-59`: integration for the policy matrix and service extensions, http for the route-boundary 404 mapping, e2e only for the forged-URL scenario, the UI save path (notice wording) and the map click. Phase 1 raises the local auth cap first so the later phases cannot flake on 429s. Phase 4 writes the named scenario register and cookbook patterns into the test plan.

## Critical Implementation Details

- **Row-level denial is silent in PostgREST.** A B-side `update`/`delete` that RLS filters out returns no error and zero rows; only a column-grant violation errors (42501). Matrix rows must assert outcomes (`.select()` returns `[]`, then re-read as the owner and compare), never "an error was thrown", except for column-grant cases where 42501 is the contract.
- **Image route rows must reach the ownership check.** Send a schema-valid body (and lowercase ids) on `uploads`/`images` POSTs and on image `PATCH`, otherwise the route answers 400 from body validation and the row proves nothing about isolation. Uppercase ids hit a known S-04 defect (500) — don't use them.
- **Seed only through the owner's anon-key client** (`createTestUser().client`, RPCs or the app routes), never the service role (`test-plan.md:57`).

## Phase 1: Integration — rate cap, policy matrix and extensions

### Overview

Raise the local auth cap, add one RLS policy-matrix file (Risk #3 and the direct-table side of Risk #1), and extend the "Extend" rows from research.

### Changes Required:

#### 1. Local auth rate cap

**File**: `supabase/config.toml`, `tests/support/test-user.ts`

**Intent**: Give CI headroom for S-02's ~10 new auth calls (24 → ~34) without flaky 429s; the user chose 50 and will raise it further if needed.

**Contract**: `[auth.rate_limit] sign_in_sign_ups = 50` with a one-line comment naming the shared local-stack budget. Update the `createTestUser` JSDoc budget sentence from 30 to 50; keep the "create the minimum users" guidance. A running local GoTrue only picks the new value up after `npx supabase stop && npx supabase start` (CI starts fresh); restart before running the suites, otherwise local runs still cap at 30.

#### 2. RLS policy matrix

**File**: `tests/integration/rls-policy-matrix.test.ts` (new)

**Intent**: Prove per table × operation that the owner keeps CRUD on existing rows, owner-denied operations stay denied, and user B gets nothing — reusing existing tests where they already fit (1.1–1.11 remain where they are; the matrix covers only the untested cells).

**Contract**: One tenant pair in `beforeAll` (2 auth calls). Fixtures are split so no row depends on another's order:
- **Shared, never mutated**: A's rows seeded via A's client (campaign, two related notes, a custom note type), used only by select, owner-denied and B cells.
- **Per-row disposable**: every owner `delete`/`insert`/`update` cell creates its own target inside the row (a throwaway campaign to delete, a third note to update/delete, an unrelated note pair without mentions for the `relations` insert/delete — never the auto-detected pair, which `relations_unique_pair` already holds and re-detection rewrites on any note write).
- Every "unchanged" owner re-read first asserts the row still exists, so a B "zero rows" result can't come from an already-deleted row.

`it.each` tables:
- Owner on existing rows (3.2): select / insert / update granted columns / delete on `campaigns`, `notes`, `relations`, `note_types` (select + insert only), `note_images` (alt_text update).
- Owner denied (3.3): `campaigns.owner_id` update and `notes.campaign_id` update → `PG_ERROR.INSUFFICIENT_PRIVILEGE`; `relations` update and `note_types` update/delete → zero rows affected and the owner re-read unchanged; storage `upload(path, …, { upsert: true })` over the owner's own existing object in the note-images bucket → denied (no `storage.objects` UPDATE policy) and the object unchanged (same `expectRlsDenied` shape as `note-images.test.ts`).
- B direct-table (3.1): B `insert` into A's campaign for `notes`/`relations`/`note_types` → `PG_ERROR.INSUFFICIENT_PRIVILEGE` (RLS WITH CHECK fires before FK checks), B `update`/`delete` on A's `campaigns`/`notes`/`relations` rows → zero rows, then A re-reads and the row is unchanged.

#### 3. Extensions to existing tests

**File**: `tests/integration/campaigns-service.test.ts`, `notes-service.test.ts`, `note-images.test.ts`, `note-edit-delete-functions.test.ts`, `create-note-function.test.ts`

**Intent**: Turn result-only checks into "no row written" checks and fill the remaining Extend/New rows.

**Contract**:
- 1.3 (`campaigns-service.test.ts:119`): after B's rename returns `not_found`, A re-reads the campaign name unchanged.
- C.1 (`campaigns-service.test.ts:136`): A's list contains none of B's campaign ids.
- 1.7 (`notes-service.test.ts:144`): add the case with **A's campaign id** and B's client; A re-reads name/content unchanged.
- 1.10 (`note-images.test.ts:167`): A re-reads its `note_images` row after B's delete; B insert into `note_images` for A's note is denied; B `alt_text` update on A's row affects zero rows and A's value is unchanged.
- 1.12 (`note-images.test.ts`, new `it`): seed a real image via `prepareUpload` → storage upload → `commitImage` (pattern at `note-images.test.ts:340`). Positive control first: A's `listNoteImages`, `getImageUrls` and `toImageViews` return the row and non-null URLs. Then B: `listNoteImages` → `[]`, `getImageUrls` → `not_found`, `toImageViews` with A's `NoteImage` objects → `thumb_url: null`.
- 5.1: content round-trip on create (`create-note-function.test.ts`) and update (`note-edit-delete-functions.test.ts`) for multi-line text, Unicode/emoji, leading/trailing whitespace and a limit case; re-read via `getNote` and compare exactly. Limit case: exactly 20000 characters built from multibyte UTF-8 BMP characters (e.g. `ż`, `ł`, `é`) mixed with spaces/newlines, including leading/trailing whitespace — each is 1 code point (DB `char_length`) and 1 UTF-16 unit (zod `.max`), so both layers agree at the boundary. Emoji (astral, 1 code point but 2 UTF-16 units) stay in a separate short string. UTF-8 bytes can't be the unit tests-only: neither the DB nor zod counts bytes.
- 5.4 (`note-edit-delete-functions.test.ts`, sibling of :119/:142): one edit both adds and removes a relation; both `added` and `removed` are non-empty and correct.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes, including `rls-policy-matrix.test.ts` and the extended files
- `npm run lint` passes
- `grep -rn "service_role\|SERVICE_ROLE" tests/` returns no hits
- `supabase/config.toml` has `sign_in_sign_ups = 50`

#### Manual Verification:

- Temporarily weakening one policy locally makes a matrix row fail; revert afterwards (e.g. an uncommitted scratch migration that drops `notes_update_own_campaign` and recreates it with `using (true)`, applied via `npx supabase db reset`; revert by deleting the scratch file and running `npx supabase db reset` again)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: HTTP — forged-ID route matrix

### Overview

Pin the route-boundary isolation (Risk #1): B's signed-in session on A's ids across every page, campaign/note API and image API route, plus mixed-ID cases and the forged `last_campaign_id` cookie.

### Changes Required:

#### 1. Signed-in jar helper

**File**: `tests/http/support/client.ts` (or a sibling `tests/http/support/session.ts`)

**Intent**: Extract the inline signin from `session-revocation.test.ts:24-31` so both files share it.

**Contract**: `signInJar(user: { email; password }): Promise<Jar>` — POSTs `/api/auth/signin` with `Origin`, asserts 302 to `/dashboard` and an `sb-` cookie. `session-revocation.test.ts` switches to it with unchanged behaviour. Add `set(name, value)` to `Jar` in `client.ts` so a test can plant a cookie (the jar otherwise only stores `Set-Cookie` from responses).

#### 2. Forged-ID matrix

**File**: `tests/http/forged-id.test.ts` (new)

**Intent**: For every route taking a campaign or note id, B gets 404 with none of A's identifying data in the body, and A's data is unchanged afterwards (`test-plan.md:55`).

**Contract**: `beforeAll`: two `createTestUser` + two `signInJar` (4 auth calls). A seeds through its client: renames its auto-created campaign to a distinctive unique name (every user's first campaign is `'My Campaign'`, which B's own Topbar also renders), a second campaign with a distinctive unique name, a note with distinctive name/content in campaign 1, a note in campaign 2, and one committed image on A's note (upload via storage + commit, same pattern as `note-images.test.ts`). Rows:
- 1.13 pages (B jar, GET → 404, body lacks A's distinctive campaign names and note name/content): `/campaigns/{A}`, `/campaigns/{A}/edit`, `/campaigns/{A}/map`, `/campaigns/{A}/notes/new`, `/campaigns/{A}/notes/{noteA}`, `/campaigns/{A}/notes/{noteA}/edit`, `/notes/{noteA}`.
- 1.13 API (B jar, JSON 404): `PATCH /api/campaigns/{A}`, `POST /api/campaigns/{A}/notes`, `PATCH` and `DELETE /api/campaigns/{A}/notes/{noteA}`, and the image routes `POST .../images/uploads`, `POST .../images`, `GET|PATCH|DELETE .../images/{imageA}` — with schema-valid bodies. The commit (`POST .../images`) body must also pass `isOwnImagePath` for the caller, or it answers 400 before the ownership check: `path` = `` `${b.userId}/${campaignId}/${noteId}/${crypto.randomUUID()}.webp` `` (the ids under test), `thumb_path`/`thumb_width`/`thumb_height` null, `width`/`height` 1, `alt_text` null.
- 1.14 mixed ids: B's own `campaignId` with A's `noteId` on the note pages and note/image APIs → 404; A's own note under A's **other** campaign (A jar) → 404.
- Forged cookie (1.2 route level): a fresh clone of B's post-signin jar (earlier rows plant `last_campaign_id={B}` via `rememberCampaign`) with `jar.set("last_campaign_id", A)`, first asserting `jar.header()` contains it, on `/dashboard`, `/map`, `/notes/new`, `/campaigns` → 302 to B's own campaign path (with `/map`, `/notes/new` suffixes).
- After all writes: A's client re-reads campaign name, note name/content and image row — unchanged.
- Positive control: A's jar on its own note page → 200, so a 404 can't come from a broken setup.

### Success Criteria:

#### Automated Verification:

- `npm run build && npm run test:http` passes (route-guard, session-revocation and forged-id)
- `npm run lint` passes

#### Manual Verification:

- Temporarily removing the note-to-campaign check in `notes/[noteId].astro` makes a 1.14 row fail; revert afterwards (the `found?.campaign_id === campaign.id` check at :37). Expected failure: the A-jar row (A's note under A's other campaign); the B-campaign + A-note row stays 404 because RLS hides A's note

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: E2E — forged URL, note CRUD with pinned notice, map click

### Overview

Three browser scenarios: one forged-URL isolation check (Risk #1), note create/edit/delete through the UI with every notice variant pinned (Risk #5, C.3), and memory-map node navigation (M.2).

### Changes Required:

#### 1. Approved notice baseline and CRUD scenarios

**File**: `tests/e2e/notes-relations.spec.ts` (new)

**Intent**: Pin the relation-change notice wording through the real UI save path, exactly per line, before S-04 moves the text; this also covers note create/view/edit/delete in the browser.

**Contract**: A literal `UI_BASELINE` object (comment: approved by the user 2026-10-11 in `/10x-plan`; never import from `MESSAGES`; changing it is a deliberate S-04 decision), with builder functions for the per-note lines:
- `saved(name)` → `Saved "<name>".`
- `relationsAdded(names)` → `Relations added: <A>, <B>`
- `relationsRemoved(names)` → `Relations removed: <C>`
- `relationsUnchanged` → `Relations unchanged.`
- `deleted(name)` → `Deleted "<name>".`
- `noRelationsTouched` → `No relations touched.`

Each `<p>` inside the `role="status"` notice is asserted with exact full text (`toHaveText` per line, line count asserted), and relation links' `href`s point to `/campaigns/{cid}/notes/{id}`. Scenarios run as **one `test()` with a `test.step` per scenario** (Playwright gives each `test()` a fresh context, so separate tests would each cost a UI sign-in): one seeded user (`createTestUser`, 1 auth call), signed in once through the UI (1 auth call); notes created via the UI form:
- create a note → lands on its page with the entered content;
- edit adding a mention → saved + added line;
- edit removing it → saved + removed line;
- edit that adds one and removes another → saved + added + removed lines;
- content-only edit with no relation change → saved + unchanged;
- type-only edit → saved line only;
- delete a note with relations → deleted + removed line;
- delete a note without relations → deleted + "No relations touched.".

Fixture (relation matching is bidirectional, case-insensitive, whole-word — `note_mentions`, `20260926120000_relation_detection.sql:10-60`; so names share no word with each other or with any content, and only the edited note's content ever mentions another note). Notes created via the UI: `Brasswick`, `Quillmoor`, `Zephyr Harbor`, `Larkspur Vale`, each with content `Plain text.`. All edits are to `Brasswick`:

| Step | Brasswick content / action | Expected notice lines | Relations after |
| --- | --- | --- | --- |
| add (two names) | `Meets Quillmoor and Zephyr Harbor.` | Saved; `Relations added: Quillmoor, Zephyr Harbor` | B–Q, B–Z |
| remove | `Meets Zephyr Harbor.` | Saved; `Relations removed: Quillmoor` | B–Z |
| add + remove | `Meets Larkspur Vale.` | Saved; `Relations added: Larkspur Vale`; `Relations removed: Zephyr Harbor` | B–L |
| content-only | `Meets Larkspur Vale again.` | Saved; `Relations unchanged.` | B–L |
| type-only | another predefined type | Saved only | B–L |
| map (M.2, §2) | open map, click `Larkspur Vale` | — | B–L |
| delete with relations | delete `Brasswick` | `Deleted "Brasswick".`; `Relations removed: Larkspur Vale` | none |
| delete without relations | delete `Quillmoor` | `Deleted "Quillmoor".`; `No relations touched.` | none |

Builders take names in the server's order, `lower(name)` then id (`20260930120000_note_edit_delete_functions.sql`, `update_note`/`delete_note`). The delete confirmation has a second "Delete" button; scope the confirm click to `getByRole("alertdialog")`.

#### 2. Forged URL and map scenarios

**File**: `tests/e2e/notes-relations.spec.ts` (forged URL as a separate `test()`; map as a step of the CRUD `test()`)

**Intent**: One UI-level forged-URL proof and one map navigation proof.

**Contract**:
- Forged URL (1.15), its own `test()` (3 auth calls): A seeded via `createTestUser` with a distinctive note (via A's client RPC); B seeded and signed in through the UI; `page.goto(A's note URL)` → response status 404 and A's note name/content not visible. Assert a session-only outcome first (B's own campaign URL + "Sign out" visible), per test-plan §6.3.
- Map click (M.2): a `test.step` inside the CRUD `test()` (no extra auth call), run while two of its notes are still related (before the delete steps); open `/campaigns/{cid}/map`, wait for `.react-flow__node` (not `waitForHydration` — the map is `client:only`), click the node by note name → URL is `/campaigns/{cid}/notes/{noteId}`.
- Auth calls total for the new specs = 5 (CRUD + map 2, forged URL 3); state the count in a comment, like `auth-session.spec.ts:19`.

### Success Criteria:

#### Automated Verification:

- `npm run build && npm run test:e2e` passes (existing auth/signin specs + new ones)
- `npm run lint` passes
- `grep -n "MESSAGES" tests/e2e/notes-relations.spec.ts` returns no hits

#### Manual Verification:

- Temporarily changing one notice phrase makes the wording scenario fail with a readable diff; revert afterwards (e.g. drop the colon after "Relations added"; stop any preview on 4322 — Playwright reuses it locally — then `npm run build && npm run test:e2e` must fail; revert, rebuild, rerun → green)
- The `UI_BASELINE` literals match the copy approved during planning (see Key Decisions in `plan-brief.md`)

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Docs and scenario register

### Overview

Record the named scenario register, cookbook patterns and logged defects so S-04 and future slices can rely on them.

### Changes Required:

#### 0. Formatting baseline

**File**: `context/foundation/test-plan.md`, `TESTING.md`, `CLAUDE.md`

**Intent**: `prettier --check` already fails on `test-plan.md` (~85 lines: §2 table padding, `*emph*` → `_emph_`) and `CLAUDE.md` (6 lines) before any Phase 4 edit; lint-staged would otherwise mix that reformat into the register diff.

**Contract**: First step of the phase: `npx prettier --write` on the three files, committed alone as a formatting-only commit (no content changes). The content edits below follow in separate commits.

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Close §3 Phase 2 and fill the TBD cookbook sections this phase owns.

**Contract**:
- §3 Phase 2 row: status `implemented`, change folder `context/changes/notes-relations-risk-tests/`, Test types `integration (policy matrix) + http forged-ID + targeted e2e`.
- §6.3: the rate-limit sentence (`test-plan.md:137`, "30 / 5 min / IP") → 50.
- §6.2: two-user cross-ownership pattern (`createTestUser` pair, assert "no row written" by owner re-read; RLS denial is silent).
- §6.4: replace "(TBD)" with the forged-ID pattern (`signInJar`, B jar on A ids → 404, no A data, owner re-read; valid bodies on image routes).
- §6.5: existing-rows owner-access / other-user-denial pattern pointing at `rls-policy-matrix.test.ts`.
- §6.6 Phase 2 notes: the **named scenario register** (scenario id from research → test file/name, including "Fits" rows and C.2 not applicable), the `UI_BASELINE` approval date, and the two **known defects left for S-04** (uppercase-UUID 500 on image upload/commit; replayed image commit 500 via 23505).
- §4 Stack: the test-base profile sentence adds the http forged-ID matrix (signed-in B on A's ids) and the UI note CRUD / notice / map e2e; the http row note mentions `forged-id.test.ts`.
- §8: "Strategy (§1–§5) last reviewed" set to the date the phase lands.

#### 2. Testing docs

**File**: `TESTING.md`, `CLAUDE.md` (suite-coverage lines only; neither states the rate-limit number)

**Intent**: Keep the coverage claims accurate.

**Contract**: Where suites are described — `CLAUDE.md` `npm run test:http` line ("route-guard matrix (anonymous and signed-out …)"), `TESTING.md:17` — mention the forged-ID http file; mention the new e2e specs where e2e coverage is described.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check context/foundation/test-plan.md TESTING.md CLAUDE.md` passes
- `grep -nE "TBD — see §3 Phase 2|Phase 2 \(TBD\)" context/foundation/test-plan.md` returns no hits
- `grep -n "30 / 5 min" context/foundation/test-plan.md` returns no hits

#### Manual Verification:

- Every research scenario id appears in the §6.6 register with a test reference or "not applicable" (1.1–1.15, 3.1–3.4, 5.1–5.5, C.1–C.3, M.1–M.2)
- CI run on the branch is green across `ci` and `local-stack`: after the user approves pushing the branch, `gh workflow run ci.yml --ref notes-relations-risk-tests`, and the run's `headSha` (`gh run list --branch notes-relations-risk-tests --json headSha`) equals `git rev-parse HEAD`

**Implementation Note**: Final phase; hand over to `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- None added; notice transport stays covered by `src/lib/relation-notice.test.ts`.

### Integration Tests:

- RLS policy matrix (owner / owner-denied / B) and the 1.3, 1.7, 1.10, 1.12, 5.1, 5.4, C.1 extensions.
- HTTP forged-ID matrix (pages, campaign/note API, image API, mixed ids, forged cookie).

### Manual Testing Steps:

1. Break one RLS policy locally → a matrix row fails.
2. Break the page-level note/campaign check → a mixed-id http row fails.
3. Change one notice phrase → the e2e wording scenario fails with a readable diff.

## Performance Considerations

New auth calls: integration +2, http +4, e2e ≤5 → ~35 of 50 per 5 min in `local-stack`. E2E stays at `workers: 1`; the CRUD scenario reuses one user across steps to keep the run short.

## References

- Research: `context/changes/notes-relations-risk-tests/research.md`
- Roadmap S-02: `context/foundation/roadmap.md:107-118`; test plan Phase 2: `context/foundation/test-plan.md:55-59,71`
- Prior pattern: `context/archive/2026-10-10-auth-risk-tests/plan.md`; `tests/e2e/auth-session.spec.ts:6-12`; `tests/http/session-revocation.test.ts:20-31`
- Notice copy origin: `context/archive/2026-09-29-note-edit-delete-relation-refresh/plan.md:20-22`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration — rate cap, policy matrix and extensions

#### Automated

- [ ] 1.1 `npm run test:integration` passes, including `rls-policy-matrix.test.ts` and the extended files
- [ ] 1.2 `npm run lint` passes
- [ ] 1.3 `grep -rn "service_role\|SERVICE_ROLE" tests/` returns no hits
- [ ] 1.4 `supabase/config.toml` has `sign_in_sign_ups = 50`

#### Manual

- [ ] 1.5 Temporarily weakening one policy locally makes a matrix row fail; revert afterwards

### Phase 2: HTTP — forged-ID route matrix

#### Automated

- [ ] 2.1 `npm run build && npm run test:http` passes (route-guard, session-revocation and forged-id)
- [ ] 2.2 `npm run lint` passes

#### Manual

- [ ] 2.3 Temporarily removing the note-to-campaign check in `notes/[noteId].astro` makes a 1.14 row fail; revert afterwards

### Phase 3: E2E — forged URL, note CRUD with pinned notice, map click

#### Automated

- [ ] 3.1 `npm run build && npm run test:e2e` passes (existing auth/signin specs + new ones)
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `grep -n "MESSAGES" tests/e2e/notes-relations.spec.ts` returns no hits

#### Manual

- [ ] 3.4 Temporarily changing one notice phrase makes the wording scenario fail with a readable diff; revert afterwards
- [ ] 3.5 The `UI_BASELINE` literals match the copy approved during planning

### Phase 4: Docs and scenario register

#### Automated

- [ ] 4.1 `npx prettier --check context/foundation/test-plan.md TESTING.md CLAUDE.md` passes
- [ ] 4.2 `grep -nE "TBD — see §3 Phase 2|Phase 2 \(TBD\)" context/foundation/test-plan.md` returns no hits
- [ ] 4.3 `grep -n "30 / 5 min" context/foundation/test-plan.md` returns no hits

#### Manual

- [ ] 4.4 Every research scenario id appears in the §6.6 register with a test reference or "not applicable"
- [ ] 4.5 CI run on the branch is green across `ci` and `local-stack`
