<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Image Attachment (S-05) — Phase 2: Image API and note-delete cleanup

- **Plan**: context/changes/note-image-attachment/plan.md
- **Scope**: Phase 2 of 5
- **Reviewed phases**: 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated checks re-run on 2026-10-06 at HEAD fdbdd98: `npm run lint` (0 errors), `npx astro check` (0 errors/warnings/hints), `npm test` (17 files, 173 tests passed), `npm run build` (complete). All four planned files and the contract-surfaces edit are in commit 2509af4. No unplanned files. Manual items 2.6–2.8 are ticked; they cannot be checked from the diff, and nothing contradicts them.

## Findings

### F1 — New routes add an inline "Request body must be valid JSON." literal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/uploads.ts:32, src/pages/api/campaigns/[campaignId]/notes/[noteId]/images.ts:32, src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/[imageId].ts:77
- **Detail**: The lessons.md rule "Use the central error/status/message dictionaries in new code" says to add missing entries to `MESSAGES` and not to introduce new inline literals. All three new routes use `HTTP_STATUS` and `MESSAGES` everywhere else, but each one hard-codes the bad-JSON string. The four existing routes keep their own copies; the plan says not to migrate those.
- **Fix**: Add `INVALID_JSON_BODY: "Request body must be valid JSON."` to `MESSAGES` and use it in the three new routes.
- **Decision**: FIXED (MESSAGES.INVALID_JSON_BODY added; three new routes use it)

### F2 — `guard()` returns a failure without the `ok: false` discriminant

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/campaigns/[campaignId]/notes/[noteId]/images/[imageId].ts:31
- **Detail**: When Supabase is not configured, the branch returns `{ response }` with no `ok: false as const`. It works for two reasons: `!g.ok` is true for `undefined`, and TypeScript widens that member to `ok?: undefined`. But it is the only branch without the discriminant, and it would stop working if someone checks `g.ok === false`.
- **Fix**: Add `ok: false as const` to that return.
- **Decision**: FIXED

### F3 — Cross-account commit returns 400, not 404, when the body carries the victim's paths

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/note-images.ts:305-311 (reached via images.ts POST)
- **Detail**: Manual criterion 2.7 says commit against another account's note returns 404. `commitImage` checks `isOwnImagePath` against the **caller's** uid before it checks note ownership. So a body with the victim's `{A-uid}/...` paths gets 400 `invalid_upload`. A body with caller-prefixed paths gets 404. The status depends only on the caller's uid and the URL, never on whether the note exists, so this is not an existence oracle and is safe as written. It is just not described in the plan or in contract-surfaces.
- **Fix**: Add one line to the Image API section of contract-surfaces: "commit checks path ownership before note ownership; foreign-prefix paths give 400 `invalid_upload` regardless of the note".
- **Decision**: FIXED (documented in contract-surfaces Image API commit line)
