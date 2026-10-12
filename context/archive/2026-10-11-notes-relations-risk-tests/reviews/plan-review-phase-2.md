<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Notes, Relations & Isolation Risk Tests — Phase 2 (HTTP — forged-ID route matrix)

- **Plan**: context/changes/notes-relations-risk-tests/plan.md
- **Scope**: Phase 2 only
- **Mode**: Deep (claims verified inline against route handlers, services and the http harness)
- **Date**: 2026-10-12
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓ (`tests/http/support/client.ts`, `tests/http/session-revocation.test.ts`, `notes/[noteId].astro`, `images/uploads.ts`, `images.ts`, `notes/[id].ts`), 5/5 symbols ✓ (`createJar`/`send`, `found?.campaign_id === campaign.id` at :37, `resolveLandingCampaign`, `rememberCampaign`, `isOwnImagePath`), brief↔plan ✓, Progress↔Phase 2 ✓ (2.1–2.3), contract surfaces `campaigns`, `notes` touched read-only and reported accurately.

## Findings

### F1 — Commit-image row answers 400, not 404, unless the path uses B's own user id

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Forged-ID matrix, 1.13 API image rows and 1.14 mixed ids
- **Detail**: The plan asks for "schema-valid bodies". For `POST .../images`, `commitImage` checks `isOwnImagePath(path, userId, campaignId, noteId)` (`src/lib/services/note-images.ts:82-88, 302-310`) before `noteExists`. A path that passes the schema but is not `<B userId>/<campaignId>/<noteId>/<uuid>.(webp|jpg)` (for example A's real image path) returns `invalid_upload` → 400, so the row never reaches the ownership check. This is the "image rows returning 400" risk the brief names, and it is not handled for commit.
- **Fix**: State the commit body: `path = \`${b.userId}/${campaignId}/${noteId}/${crypto.randomUUID()}.webp\`` (the campaign/note ids under test), `thumb_path`/`thumb_width`/`thumb_height` null, `width`/`height` 1, `alt_text` null. Note that the `fail()` cleanup then removes only B's non-existent paths, so A's objects are safe.
- **Decision**: FIXED

### F2 — "Body lacks A's campaign name" fails on every page row: both auto campaigns are "My Campaign"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Forged-ID matrix, 1.13 pages
- **Detail**: `handle_new_user` creates every user's first campaign as `'My Campaign'` (`20260922120000_campaign_notes_schema.sql:195`). B's 404 page still renders the Topbar with B's `CampaignSwitcher` (`Topbar.astro:24,39`), so the body contains "My Campaign" and the "no A data" assertion fails for A's campaign 1 — or the implementer weakens it.
- **Fix**: In `beforeAll`, give both of A's campaigns distinctive unique names via A's client (rename the auto campaign, create the second with a unique name) and assert absence of those strings plus the note's distinctive name/content.
- **Decision**: FIXED

### F3 — The jar cannot carry a forged cookie, and B's jar picks up its own `last_campaign_id`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Signed-in jar helper and forged-cookie rows
- **Detail**: `Jar` only exposes `header/store/clone` and `send` takes no extra headers (`tests/http/support/client.ts:3-7, 31-36`), so there is no way to add `last_campaign_id={A}`. B's jar also receives `last_campaign_id={B}` from earlier mixed-id rows that render B's campaign (`rememberCampaign`). B has one campaign, so a cookie that silently fails to inject still redirects to B's campaign and the row passes without testing anything.
- **Fix**: Add `set(name, value)` to `Jar` (contract in Changes §1). Forged-cookie rows use a fresh clone of B's post-signin jar, set `last_campaign_id={A}`, and first assert `jar.header()` contains it.
- **Decision**: FIXED

### F4 — The manual break check only fails the A-jar row

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Manual Verification 2.3
- **Detail**: With the `:37` check removed, B's campaign + A's note still 404s because RLS hides A's note from `getNote`. Only "A's own note under A's other campaign (A jar)" turns to 200. Someone running the check could expect the B row to fail and think the check is broken.
- **Fix**: Name the expected failing row in 2.3: "the A-jar row (A's note under A's other campaign) fails".
- **Decision**: FIXED
