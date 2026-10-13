---
date: 2026-10-13T19:29:05+02:00
researcher: Hornster (with Claude Opus 5.5)
git_commit: 24248a62a894dacd6d29022093438f0180e0ddbb
branch: constants-sweep
repository: NoteItDown
topic: "Hardcoded HTTP statuses, SQLSTATE codes and duplicated message literals that can move to src/lib/constants/"
tags: [research, constants, http-status, pg-error, messages, api-routes, services, ui-copy]
status: complete
last_updated: 2026-10-13
last_updated_by: Hornster (with Claude Opus 5.5)
---

# Research: constants sweep candidates (S-04)

**Date**: 2026-10-13T19:29:05+02:00
**Researcher**: Hornster (with Claude Opus 5.5)
**Git Commit**: 24248a62a894dacd6d29022093438f0180e0ddbb (working tree clean except this change folder)
**Branch**: constants-sweep
**Repository**: NoteItDown

## Research Question

Find every place that can be converted to constants, and verify the ones already known: hardcoded or duplicated string literals (error and UI messages), HTTP status codes, Postgres error codes and similar. Pay particular attention to the older files created or touched in milestone M-1 (MVP). The established dictionaries live in `src/lib/constants/`.

## Summary

- **HTTP status literals:** the inspected `src/` code (`.ts`, `.tsx`, `.astro`, excluding comments, `*.test.ts` and Tailwind or pixel values) holds 61 numeric HTTP status literals in 17 files.
  - 40 are in 4 API route files.
  - 9 are in 5 redirect-endpoint files.
  - 8 are in 6 `.astro` pages.
  - 4 are in 2 client hooks.
- **Postgres error codes:** there are 12 SQLSTATE string literals in 2 service files (`campaigns.ts`, `notes.ts`). No constraint-name literals appear in executable `src/` code.
- **Where the old code sits:** every literal above is in M-1 code that commit `5bf36f1` ("Refactor of hardcoded values and string literals in new code") did not touch. Commit `5bf36f1` converted these, which are now clean:
  - the 3 image API routes
  - `note-images.ts`
  - `useSaveNote.ts`
  - `upload.ts`
  - the image components
- **Existing `MESSAGES` keys used as inline copies:** 4 keys are re-typed inline in 15+ places instead of being imported:
  - `SIGNED_IN_REQUIRED`
  - `SUPABASE_NOT_CONFIGURED`
  - `INVALID_JSON_BODY`
  - `NOTE_NOT_FOUND`
  - `NETWORK_ERROR` and `NOTICE_DISMISS_LABEL` are also inlined.
- **Duplicated messages with no key yet:** about 10 groups are duplicated across files and have no `MESSAGES` key. Examples:
  - `"This campaign doesn't exist or isn't yours."` (7 places)
  - `"No campaign found for this account."` (4)
  - the zod and client-form validation messages, mirrored between `src/lib/schemas/*` and the forms
- **Earlier claims checked:**
  - The roadmap baseline's "~17 literals across 7 files" is contradicted.
  - The test-plan's "4 API files with literal 401s" is supported; it is 5 occurrences.
  - The "literal 302 in `tests/http/`, no `HTTP_STATUS.FOUND`" claim is supported: 5 occurrences in 4 files.
- **Behavior changes in scope:** these items cannot be pure "identical behavior" refactors (PRD `prd-v2.md:189`). Each needs a deliberate decision in `/10x-plan`:
  - the auth routes' raw Supabase `?error=` messages, pinned by the e2e `UI_BASELINE`
  - the no-period `"Supabase is not configured"` variant
  - the `...` vs `…` ellipsis mismatch
  - the campaign "saving" vs "creating/renaming" error wording

## Detailed Findings

### 1. HTTP status literals in `src/` (61 in 17 files)

No file in this section imports `HTTP_STATUS`, except where noted.

**API routes: 40 literals in 4 files.** None of these files imports `HTTP_STATUS` or `MESSAGES`.

`jsonError` (`src/lib/api.ts:4`) is typed `status: number`, so the type system does not enforce the constants. Narrowing it to the `HTTP_STATUS` value union is an option.

| File                                                     | Lines                                                       | Values                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/pages/api/campaigns/index.ts`                       | 14, 19, 26, 37, 45, 54, 58                                  | 401, 500, 400, 400, 409, 500, 201                                         |
| `src/pages/api/campaigns/[campaignId]/index.ts`          | 15, 20, 25, 32, 43, 51, 54, 58, 62                          | 401, 500, 404, 400, 400, 409, 404, 500, 200                               |
| `src/pages/api/campaigns/[campaignId]/notes.ts`          | 15, 20, 26, 33, 44, 54, 58, 62, 66                          | 401, 500, 404, 400, 400, 409, 400, 500, 201                               |
| `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts` | 17, 22, 27, 32, 39, 50, 60, 64, 67, 71, 79, 84, 89, 96, 100 | 200, 401, 500, 404, 400, 400, 409, 400, 404, 500, 401, 500, 404, 404, 500 |

**Redirect endpoints: 9 literals in 5 files.** These return plain-text `new Response(...)` bodies:

- `src/pages/dashboard.ts:14,19` (500, 404)
- `src/pages/map.ts:14,19` (500, 404)
- `src/pages/campaigns/index.ts:14,19` (500, 404)
- `src/pages/notes/new.ts:15,20` (500, 404)
- `src/pages/notes/[id].ts:18` (404)

**`.astro` pages: 8 literals in 6 files.** Each is `Astro.response.status = 404`:

- `campaigns/[campaignId]/index.astro:21`
- `campaigns/[campaignId]/map.astro:23`
- `campaigns/[campaignId]/edit.astro:19`
- `campaigns/[campaignId]/notes/new.astro:21`
- `campaigns/[campaignId]/notes/[noteId].astro:30,40`
- `campaigns/[campaignId]/notes/[noteId]/edit.astro:27,37`

**Client hooks: 4 literals in 2 files.**

- `src/components/hooks/useDeleteNote.ts:32` has `200` and `:44` has `404`.
- `src/components/hooks/useSaveCampaign.ts:30` has `mode === "create" ? 201 : 200`.
- `useSaveNote.ts:66,82` already uses `HTTP_STATUS.CREATED` and `OK`.

**Already clean, for comparison:**

- `api/.../notes/[noteId]/images.ts`, `images/uploads.ts` and `images/[imageId].ts`
- `src/lib/images/upload.ts`
- `useSaveNote.ts`

**Implicit redirects:** `context.redirect(url)` and `Astro.redirect(url)` calls pass no status, so they use Astro's default 302. This covers:

- `middleware.ts`
- the 5 redirect endpoints
- `api/auth/*`

`HTTP_STATUS.FOUND` is therefore needed only by tests (section 5), unless the plan makes redirect statuses explicit.

**Missing dictionary entry:** none of the values found in `src/` is missing from `HTTP_STATUS`. No `503` exists anywhere in `src/` or `tests/`.

### 2. Postgres SQLSTATE literals (12 in 2 files)

Neither file imports `PG_ERROR`. All the values already exist in `PG_ERROR` (`src/lib/constants/db-error-codes.ts:2-9`), so no new entries are needed.

- `src/lib/services/campaigns.ts:91,123` has `"23505"`, for create and rename.
- `src/lib/services/notes.ts` has these:
  - `:146` and `:184`: `"23505"`
  - `:151` and `:187`: `"23503" || "42501" || "22023"`, three literals per line
  - `:181` and `:213`: `"P0002"`

`src/lib/services/note-images.ts` already uses `PG_ERROR`, at `:286` and `:378`.

### 3. Constraint names

- **Matched by code:** `src/` code matches exactly one constraint name, through the dictionary: `DB_CONSTRAINT.NOTE_IMAGES_NOTE_POSITION_KEY` at `note-images.ts:287`.
- **Defined but not used in `src/`:** `DB_CONSTRAINT.NOTE_IMAGES_NOTE_SAME_CAMPAIGN_FKEY` is unused in `src/`. Its only consumer is `tests/integration/note-images.test.ts:91`.
- **Comments only:** these constraint names appear only in comments:
  - `campaigns_owner_name_key`: `campaigns.ts:90,122`
  - `notes_campaign_name_key`: `notes.ts:145`
  - `*_check` names: `schemas/notes.ts:7,20` and `schemas/campaigns.ts:7`
- **No conversion needed:** the services classify a duplicate name by SQLSTATE `23505` alone.

### 4. Message literals

#### 4a. Inline copies of existing `MESSAGES` keys

| Key                                               | Inline at                                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGNED_IN_REQUIRED`                              | `api/campaigns/index.ts:14`; `[campaignId]/index.ts:15`; `[campaignId]/notes.ts:15`; `notes/[noteId].ts:22,79`                                                                                           |
| `SUPABASE_NOT_CONFIGURED`                         | `api/campaigns/index.ts:19`; `[campaignId]/index.ts:20`; `[campaignId]/notes.ts:20`; `notes/[noteId].ts:27,84`; plain-text in `dashboard.ts:14`, `map.ts:14`, `campaigns/index.ts:14`, `notes/new.ts:15` |
| `SUPABASE_NOT_CONFIGURED`, **no trailing period** | `api/auth/signin.ts:11`, `api/auth/signup.ts:11`. Shown to the user through `?error=`. Moving it changes the visible text by one character.                                                              |
| `INVALID_JSON_BODY`                               | `api/campaigns/index.ts:26`; `[campaignId]/index.ts:32`; `[campaignId]/notes.ts:33`; `notes/[noteId].ts:39`                                                                                              |
| `NOTE_NOT_FOUND`                                  | local `const NOT_FOUND` at `api/.../notes/[noteId].ts:14`, used at `:32,67,89,96`; `pages/notes/[id].ts:18`; `hooks/useDeleteNote.ts:7`; `notes/[noteId].astro:115`; `notes/[noteId]/edit.astro:79`      |
| `NETWORK_ERROR`                                   | `hooks/useDeleteNote.ts:6`, `hooks/useSaveCampaign.ts:5`. `useSaveNote.ts:10` already uses the key.                                                                                                      |
| `NOTICE_DISMISS_LABEL`                            | `RelationChangeNotice.tsx:86` (`aria-label="Dismiss"`)                                                                                                                                                   |
| `FOOTER_LICENSES_LINK` (same text)                | `pages/licenses.astro:33,37` (title and h1). The text is the same but the purpose differs: page title versus link. A neutral key name may fit better.                                                    |

#### 4b. Duplicated across files, no key yet

| Text                                                                       | Occurrences                                                                                                                                                       | Candidate key                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `This campaign doesn't exist or isn't yours.`                              | API `[campaignId]/notes.ts:26`, `[campaignId]/index.ts:25,54`; UI `campaigns/[campaignId]/index.astro:100`, `edit.astro:44`, `map.astro:75`, `notes/new.astro:41` | `CAMPAIGN_NOT_FOUND`                                   |
| `No campaign found for this account.`                                      | `dashboard.ts:19`, `map.ts:19`, `campaigns/index.ts:19`, `notes/new.ts:20`                                                                                        | `NO_CAMPAIGN_FOR_ACCOUNT`                              |
| `A campaign named "${name}" already exists.`                               | `api/campaigns/index.ts:45`, `[campaignId]/index.ts:51`                                                                                                           | helper `campaignNameTaken(name)`                       |
| `A note named "${name}" already exists in this campaign.`                  | `[campaignId]/notes.ts:53`, `notes/[noteId].ts:59`                                                                                                                | helper `noteNameTaken(name)`                           |
| `The selected type is not valid for this campaign.`                        | `[campaignId]/notes.ts:58`, `notes/[noteId].ts:64`                                                                                                                | `NOTE_TYPE_INVALID`                                    |
| `Something went wrong while saving the note. Please try again.`            | `api/.../notes/[noteId].ts:71`, `hooks/useSaveNote.ts:9`                                                                                                          | `NOTE_SAVE_FAILED`                                     |
| `Something went wrong while deleting the note. Please try again.`          | `api/.../notes/[noteId].ts:100`, `hooks/useDeleteNote.ts:5`                                                                                                       | `NOTE_DELETE_FAILED`                                   |
| `Name is required.`                                                        | zod `schemas/campaigns.ts:22`, `schemas/notes.ts:28`; forms `CampaignForm.tsx:33`, `NoteForm.tsx:67`                                                              | `NAME_REQUIRED`                                        |
| `Name must be at most ${N} characters.`                                    | `schemas/campaigns.ts:23`, `schemas/notes.ts:29`, `CampaignForm.tsx:36`, `NoteForm.tsx:69`                                                                        | helper `nameTooLong(max)`                              |
| `Content must be at most ${N} characters.`                                 | `schemas/notes.ts:33`, `NoteForm.tsx:73`                                                                                                                          | helper                                                 |
| `Type name is required.` and `Type name must be at most ${N} characters.`  | `schemas/notes.ts:48,49`, `NoteForm.tsx:79,81`                                                                                                                    | key plus helper                                        |
| `Email is required`, `Enter a valid email address`, `Password is required` | `SignInForm.tsx:21,23,26`, `SignUpForm.tsx:26,28,32`                                                                                                              | `EMAIL_REQUIRED`, `EMAIL_INVALID`, `PASSWORD_REQUIRED` |
| `No notes yet.` and `Create your first note`                               | `campaigns/[campaignId]/index.astro:73,78`, `map.astro:49,54`                                                                                                     | `NOTES_EMPTY`, `NOTES_EMPTY_CTA`                       |
| `Creating…` and `Saving…`                                                  | `CampaignForm.tsx:80`, `NoteForm.tsx:227`                                                                                                                         | `CREATING`, `SAVING`                                   |
| `Campaign not found` and `Note not found` (page title fallbacks)           | `campaigns/[campaignId]/index.astro:30`, `edit.astro:25`; `notes/[noteId].astro:55`, `notes/[noteId]/edit.astro:52`                                               | `*_NOT_FOUND_TITLE`                                    |

Notes on the table:

- The zod messages and the client-form messages are hand-mirrored. The comment at `CampaignForm.tsx:12` says the form mirrors the schema. Moving only one side keeps the drift risk, so the two sides should move together.
- The 5 "Something went wrong while …" 500 messages could be one parameterised helper or 5 keys:
  - `api/campaigns/index.ts:54`
  - `[campaignId]/index.ts:58`
  - `[campaignId]/notes.ts:62`
  - `notes/[noteId].ts:71,100`

#### 4c. Variants of the same meaning: unifying them changes visible text

- **Campaign error wording:** `useSaveCampaign.ts:4` says "while saving the campaign". The API says "while creating the campaign" (`api/campaigns/index.ts:54`) and "while renaming the campaign" (`[campaignId]/index.ts:58`).
- **Ellipsis:** two pending labels use ASCII `...`: `Signing in...` (`SignInForm.tsx:82`) and `Creating account...` (`SignUpForm.tsx:129`). Every other pending label uses `…`. That includes `map.astro`'s `&hellip;`.
- **Casing:** `Sign In` and `Sign Up` are title case in `Welcome.astro:33,39`. Everywhere else uses `Sign in` and `Sign up`. `Welcome.astro` is starter-template marketing copy.
- **Not-found phrasing:** `Image not found.` (`MESSAGES.IMAGE_NOT_FOUND`) does not follow the "doesn't exist or isn't yours" pattern used for notes and campaigns.
- **Error classes:** the default messages in `src/lib/images/errors.ts:5-37` overlap in meaning with the `MESSAGES.IMAGE_*` texts. They are developer-facing; the picker maps each class to a `MESSAGES` key. This is low impact and can be skipped.

#### 4d. One-off copy, probably left inline

From the inspected UI files:

- **Labels and controls:** button and page labels (`Create note`, `Save changes`, `Create campaign`, `Save name`, `Rename`, `Edit`, the `Delete "{name}"?` dialog copy), placeholders (`Bob the Blacksmith`, `The Sunken Spire`, `you@example.com`), and `Topbar.astro` navigation labels (`Dashboard`, `Map`, `Not signed in`).
- **Hint text:** `map.astro:43,61` has two hint texts that say nearly the same thing.
- **Delete dialog:** the relation summary in `DeleteNoteButton.tsx:22-24`.
- **Starter and licence copy:** `confirm-email.astro`, and `Welcome.astro` marketing copy.
- **Repeated navigation labels:** `Sign in`, `Sign up`, `New campaign`, `New note`, `Memory map` each appear about 3 times, as a link, a `<title>` and an h1. Whether that counts as "duplicated" is the S-04 unknown (`roadmap.md:142`).
- **Polish text:** `src/lib/config-status.ts:15,17` and `Layout.astro` (banner `Uwaga:`, `Dokumentacja`) hold Polish copy in an otherwise English UI. The default `<title>` `10x Astro Starter` (`Layout.astro:11`) also appears in the `Welcome.astro` h1. This is starter leftover, a policy decision more than a constants item.

### 5. Literals in tests: secondary scope, owned by S-04 through earlier hand-offs

**302 literals.** There are 5 literal `302` assertions in 4 files:

- `tests/http/support/assertions.ts:9`
- `tests/http/support/session.ts:13`
- `tests/http/session-revocation.test.ts:54`
- `tests/http/forged-id.test.ts:295,305`

`HTTP_STATUS` has no `FOUND` (`http-status.ts:2-13`). `route-guard.test.ts:54` mentions 302 only in a test-name string.

**Other literal statuses.** `tests/http/global-setup.ts:79` has `res.status === 200`.

**SQLSTATE literals.** Integration tests hold 19 SQLSTATE literals in 3 files, not counting the test-name strings in `rls-policy-matrix.test.ts`, whose assertions already use `PG_ERROR`:

- `campaigns-service.test.ts`: 3
- `create-note-function.test.ts`: 8
- `note-edit-delete-functions.test.ts`: 8

The PRD scope is `src/` (`prd-v2.md:74`), so these are optional, except the 302 hand-off.

**Smoke script.** `scripts/smoke.mjs` holds about 15 literal statuses. It is dependency-free by design, so leave it.

### 6. Auth routes: constants overlap with the logged S-01 defects

**Code** (`src/pages/api/auth/signin.ts`, `signup.ts`):

- Lines 5-7 call `formData()` and `form.get(...) as string` with no validation. A non-form body gives a 500.
- Line 11 redirects with the no-period "Supabase is not configured".
- Line 16 redirects with the raw `error.message`, URL-encoded.
- `signin.astro` and `signup.astro` read `?error=` and render it raw through `ServerError`, with no mapping and no fallback.
- `src/pages/api/auth/*` has no `export const prerender = false`, unlike the other API routes. This is a convention gap that CLAUDE.md requires; it is not a constants item.

**Tests pinning the current wording:**

- `tests/e2e/auth-session.spec.ts:8-12` `UI_BASELINE` pins `"Invalid login credentials"` and `"User already registered"`.
- The comment at `:5-7` says changing them is a deliberate S-04 decision.
- `signupDuplicateEmail` is labelled as expected to change, because it is the account-enumeration defect.

### 7. Relation-change notice wording

- **Where the wording lives:** `src/lib/relation-notice.ts` holds no wording, only the storage key, types and guards. All of the notice copy is inline JSX in `src/components/notes/RelationChangeNotice.tsx`:
  - `:64` `Saved "{name}".`
  - `:66` `Relations added`
  - `:69,77` `Relations removed`
  - `:71` `Relations unchanged.`
  - `:75` `Deleted "{name}".`
  - `:79` `No relations touched.`
  - `:86` `Dismiss`
- **What the e2e test pins:** `tests/e2e/notes-relations.spec.ts:13-19` `UI_BASELINE` pins these outputs. It also pins their DOM shape: the `<p>` elements inside `role="status"` and the links inside the added/removed lines.
- **The duplicate:** the only duplicate here is `Relations removed`, which appears twice in the same file. Moving this wording is optional by the duplication criterion. If it is moved, the rendered text must stay byte-identical.

### 8. Text the e2e tests match exactly

**Accessible names and labels.** E2e specs locate elements by these accessible names or labels, and `tests/e2e/support/hydration.ts:5` uses button names as hydration sentinels:

- `Sign in`
- `Sign out`
- `Create account`
- `Create note`
- `Save changes`
- `Delete`
- `Email`
- `Password`
- `Confirm password`
- `Name`
- `Content`
- `Type`

Moving them is safe only with identical text.

**Not pinned.** No test asserts any of these:

- the API JSON `error` texts
- the zod messages
- `No notes yet.`
- `Network error…`
- `Something went wrong…`
- the "doesn't exist or isn't yours" texts

`tests/http` checks statuses only, and smoke checks only the `?error=` prefix.

## Code References

- `src/lib/constants/{http-status,db-error-codes,messages,db-constraints}.ts`: the current dictionaries
- `src/lib/api.ts:4`: `jsonError(body, status: number)`, with an untyped status
- `src/pages/api/campaigns/**` (4 non-image route files): 40 status literals and most of the inline message copies
- `src/pages/{dashboard,map,campaigns/index,notes/new,notes/[id]}.ts`: plain-text 500/404 bodies
- `src/lib/services/{campaigns,notes}.ts`: 12 SQLSTATE literals
- `src/components/hooks/{useDeleteNote,useSaveCampaign,useSaveNote}.ts`: hook-level error constants that duplicate `MESSAGES` or API text
- `src/lib/schemas/{campaigns,notes}.ts` with `src/components/{campaigns/CampaignForm,notes/NoteForm}.tsx`: mirrored validation text
- `src/pages/api/auth/{signin,signup}.ts:5-16`, `src/pages/auth/{signin,signup}.astro`: raw `?error=` flow
- `src/components/notes/RelationChangeNotice.tsx:64-86`: notice wording
- `tests/e2e/auth-session.spec.ts:8-12`, `tests/e2e/notes-relations.spec.ts:13-19`: literal UI baselines, which must not import `MESSAGES`

## Architecture Insights

- **How the dictionaries are used:** they are plain `as const` objects plus small template helpers in `messages.ts:42-55`. The converted image code imports them directly. There is no per-domain split; `messages.ts` mixes API errors and UI labels.
- **Hook error shape:** the hooks keep `ApiError`-shaped module constants, `{ error: "…" }`. `useSaveNote.ts:10` already shows the target pattern, `{ error: MESSAGES.NETWORK_ERROR }`.
- **Duplicated failure reasons:** the services repeat `reason` unions (`"not_found" | "duplicate_name" | "unexpected" | …`):
  - `campaigns.ts:8-10`
  - `notes.ts:32-46`
  - `note-images.ts:28-52`

  The routes branch on the same literals. The `FIELDS` sets in the 4 routes duplicate the `ApiError["field"]` union (`types.ts:104`). These are typed discriminants, not magic values. Sharing them is optional and lies beyond the PRD's literal categories.

- **Test oracles:** the e2e oracles are deliberately literal, so moving copy into `MESSAGES` keeps those tests independent of the code they test.

## Historical Context (from prior changes)

- **Commit `5bf36f1` (2026-10-08):** it created `src/lib/constants/` and converted only the image-attachment code (23 files). This is the source of the "new code vs older code" split (`prd-v2.md:28`).
- **Roadmap baseline:** `context/foundation/roadmap.md:69` says "~17 hardcoded status/SQLSTATE literals remain across 7 files".
  - Verdict: **contradicted**. The current count is 61 HTTP + 12 SQLSTATE = 73 literals in 19 files.
  - Exactly 17 is the page-level subset (9 in redirect endpoints + 8 in `.astro`), but that subset spans 11 files, not 7.
- **Test-plan §6.6 (Phase 3), `context/foundation/test-plan.md:172`:** "4 API files use literal 401s".
  - Verdict: **supported**. It is 4 files with 5 occurrences, because `notes/[noteId].ts` has two.
  - Those same 4 files also hold every other API literal.
- **Test-plan §6.6 (Phase 3), the other three S-01 defects:** malformed-body 500, prefix over-match, and raw Supabase message.
  - Verdict on the malformed-body 500 and the raw message: **supported** (`signin.ts`/`signup.ts:5-16`).
  - The prefix over-match is in `middleware.ts` and was not re-inspected here.
- **Test-plan §6.6 (Phase 2), `test-plan.md:179-181`:**
  - The uppercase-UUID 500 and replayed-commit 500 defects are image-path behavior, not constants. They were not re-verified.
  - The 302 gap is **supported**: 5 occurrences in 4 files.
- **`context/archive/2026-10-10-auth-risk-tests/follow-ups/review-fixes.md:7`:** this lists the 302 literals at `route-guard.test.ts:42,59` and `session-revocation.test.ts:28,61,69,75`.
  - Verdict: **stale on locations**. Today `route-guard.test.ts` has none, apart from a test-name string. `session-revocation.test.ts` has one, at `:54`.
  - The requirement itself (add `FOUND`, replace the literals) still holds.
- **`docs/reference/contract-surfaces.md:80`:** says "New code uses them; existing routes still use literals". This is accurate today and needs updating once S-04 lands.
- **`context/foundation/lessons.md`, "Use the central error/status/message dictionaries in new code":** S-04 is expected to widen this rule from new code to all code (`prd-v2.md:152`).

## Related Research

- `context/archive/2026-10-10-auth-risk-tests/research.md`: auth defects that fed §6.6
- `context/archive/2026-10-11-notes-relations-risk-tests/research.md`: the scenario register and the relation-notice baseline

## Open Questions

These are for `/10x-plan` and the user.

1. **Where "duplicated" ends.** This is the roadmap S-04 unknown. Options include:
   - only API/server messages plus the mirrored validation text
   - also UI labels and titles that repeat (`Sign in`, `New note`, `Memory map`, `Cancel`, `Saving…`)

   Moving labels pinned by e2e accessible names is safe only with identical text.

2. **Behavior-changing items against PRD `prd-v2.md:189` ("identical in behavior").** Each needs an explicit include/exclude decision:
   - mapping the auth `?error=` raw Supabase messages to `MESSAGES` (the enumeration fix, which changes `UI_BASELINE.signupDuplicateEmail` on purpose)
   - the auth no-period variant
   - unifying the campaign "saving" vs "creating/renaming" wording
   - unifying `...` to `…`
   - the malformed-body 500 to 400, with zod on the auth routes
3. **Test-side scope.** The 302 replacement is required by the hand-off. Converting the 19 SQLSTATE literals in integration tests and `global-setup.ts:79` is optional.
4. **Shape of the new keys.** Options:
   - one parameterised helper, such as `somethingWentWrong(action)` or `notFound(kind)`
   - separate literal keys, matching the existing `NOTE_NOT_FOUND` style

   Also: whether to split `messages.ts` by domain as it grows.

5. **Narrowing `jsonError`.** Should `jsonError`'s `status` be narrowed to the `HTTP_STATUS` values so the type system enforces the rule? A lint rule (`no-restricted-syntax` on numeric `status`) is the other way to keep the rule from regressing.
6. **Polish starter copy.** Do the Polish starter strings (`config-status.ts`, `Layout.astro`) belong in this sweep or in S-05?
