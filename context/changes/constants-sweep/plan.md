# Constants Sweep (S-04) Implementation Plan

## Overview

Finish the constants refactor across the older M-1 code. Every HTTP status, Postgres SQLSTATE, error/validation message and repeated UI string in `src/` moves into the dictionaries in `src/lib/constants/`. The four auth defects inherited from S-01 get fixed, and the rule is locked in with a narrowed type, an ESLint rule and a lesson. Roadmap slice S-04; PRD FR-009 (with FR-010 to FR-012 as preserved flows).

## Current State Analysis

- **Dictionaries:** `HTTP_STATUS`, `PG_ERROR`, `DB_CONSTRAINT` and `MESSAGES` exist in `src/lib/constants/` (created by commit `5bf36f1`, which converted only the image code). Every status and SQLSTATE value in `src/` already exists in them. Only `HTTP_STATUS.FOUND` (302) is missing, and only tests need it, because redirects use Astro's implicit 302.
- **Status literals:** 61 numeric statuses in 17 files (research §1):
  - 40 in the 4 non-image API route files
  - 9 in 5 redirect endpoints
  - 8 `Astro.response.status = 404` in 6 `.astro` pages
  - 4 in 2 hooks: `useDeleteNote.ts:32,44`, and `useSaveCampaign.ts:30`, which has 2 hidden in a ternary
- **SQLSTATE literals:** 12, in `src/lib/services/campaigns.ts:91,123` and `src/lib/services/notes.ts:146,151,181,184,187,213`.
- **`jsonError`:** `jsonError(body, status: number)` at `src/lib/api.ts:4` does not enforce the constants. Every caller passes a literal or an `HTTP_STATUS.X`; none passes a variable.
- **Messages:** existing keys are re-typed inline in about 25 places (research §4a). About 15 duplicated message groups and about 15 repeated UI-label groups have no key yet. The zod schemas and the client forms mirror their validation text by hand.
- **Auth routes** (`src/pages/api/auth/{signin,signup}.ts`):
  - They call `formData()` with no guard (a non-form body gives a 500).
  - The "Supabase is not configured" text has no trailing period.
  - The raw Supabase `error.message` is passed through `?error=`; a duplicate signup shows "User already registered", which allows account enumeration.
  - There is no `export const prerender = false`.
- **Middleware:** `src/middleware.ts:18` uses `pathname.startsWith(route)`, so `/mapping` is gated by `/map`. It is not unit-testable, because it imports `astro:middleware` and `@/lib/supabase`.
- **Pinned tests:**
  - `tests/e2e/auth-session.spec.ts:8-12` `UI_BASELINE` pins `Invalid login credentials` and `User already registered`.
  - `tests/e2e/notes-relations.spec.ts:13-19` pins the relation-notice wording and DOM shape.
  - The e2e specs locate elements by accessible names (`Sign in`, `Create account`, `Create note`, `Save changes`, `Delete`, `Email`, `Password`, `Confirm password`, `Name`, `Content`, `Type`).
  - No test asserts API JSON error texts, zod messages or empty-state copy.
- **Test literals:**
  - `tests/http` has 5 literal `302`s in 4 files (`support/assertions.ts:9`, `support/session.ts:13`, `session-revocation.test.ts:54`, `forged-id.test.ts:295,305`) and one `200` in `global-setup.ts:79`.
  - `tests/integration` has 19 SQLSTATE literals in 3 files (`create-note-function.test.ts`, `note-edit-delete-functions.test.ts`, `campaigns-service.test.ts`).

## Desired End State

- **`src/` literals:** no numeric HTTP status literal and no SQLSTATE literal remains in `src/` code (comments excluded). `npm run lint` enforces the status rule through `no-restricted-syntax`, and `jsonError` accepts only `HttpStatus`.
- **Messages in `MESSAGES`:** every user-facing message lives there (API JSON errors, plain-text response bodies, hook errors, zod and client validation, auth `?error=` text, the relation notice), and so does every UI string used 2+ times in `src/`.
- **Output unchanged, with 2 accepted exceptions:** rendered text and API responses are byte-identical to today except for:
  1. auth "Supabase is not configured" gains a trailing period;
  2. `Signing in...` and `Creating account...` use `…`.
- **The four S-01 auth defects are fixed:**
  - A malformed or non-form body redirects back with `?error=` (302), not a 500.
  - Supabase errors map by `error.code` to `MESSAGES`, with a generic fallback. A duplicate-email signup redirects to `/auth/confirm-email`, exactly like a new signup.
  - Protected routes match the exact path or path + `/`.
  - The auth routes export `prerender = false`.
- **Test-side constants:** `tests/http` uses `HTTP_STATUS.FOUND`/`OK`, and the integration tests use `PG_ERROR`. The e2e `UI_BASELINE` oracles stay literal.
- **Rule recorded:** `lessons.md` records the rule for all code with the duplication boundary, and `contract-surfaces.md` describes the dictionaries, the auth error flow and the matcher.

Verify with `npm run lint`, `npm test`, `npx astro check`, `npm run build`, `npm run test:http` and `npm run test:e2e`, all green, plus the grep checks named per phase.

### Key Discoveries:

- `HTTP_STATUS` has no exported value type. Add `HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS]` (`src/lib/constants/http-status.ts:2-13`).
- ESLint has no existing `no-restricted-syntax` (`eslint.config.js:14-91`). `.astro` frontmatter is linted through `astro-eslint-parser`, so `Astro.response.status = 404` is reachable. The tested selectors flag all current literals with zero false positives. Non-HTTP `status` fields in `src/` are strings (`"ready"`, `"processing"`) or `role="status"`.
- supabase-js `AuthError.code` is `ErrorCode | (string & {}) | undefined`. It is `undefined` for 5xx and network failures (`@supabase/auth-js` `errors.d.ts:20`, `fetch.js:35-88`).
- `SignUpForm` also posts `confirmPassword` (`SignUpForm.tsx:106`). Smoke, `tests/http/support/session.ts:8-12` and e2e send only email and password, so the server schema must not require it and must not be `.strict()`.
- `confirm-email.astro:4` shows different copy in dev and in a production build. Either version is acceptable for the duplicate-email redirect.
- `tests/http/support/route-inventory.ts:34-41` derives protected routes from the filesystem, not from `PROTECTED_ROUTES`, so it is an independent oracle for the matcher change. Its `EXPORT_PATTERN` (`:6`) ignores `prerender`.
- The established pattern for pure, testable logic is `src/lib/campaign-paths.ts` plus a colocated `.test.ts`. Schemas live in `src/lib/schemas/<name>.ts`, use zod 4 `import { z } from "zod"`, and have colocated tests.
- `useSaveNote.ts:10` already shows the hook target shape, `{ error: MESSAGES.NETWORK_ERROR }`.

## What We're NOT Doing

- **Image-path defects:** not fixing the uppercase-UUID 500 or the replayed-commit 500 (test-plan §6.6, Phase 2). They are recorded in a follow-up note for a new change.
- **Starter and Polish copy:** not touching it (`Layout.astro` banner `Uwaga:`/`Dokumentacja`, `config-status.ts:15,17`, default title `10x Astro Starter`, `Welcome.astro` copy and its `Sign In`/`Sign Up` casing). This is deferred to S-05.
- **Campaign error wording:** not unifying it. Create, rename and save stay 3 distinct keys.
- **Single-use UI strings:** not moving them (`Create note`, `Save changes`, `Create campaign`, `Save name`, `Dashboard`, `Map`, `Sign out`, the `Rename` link, `Edit`, placeholders other than the repeated email one, the delete-dialog body, the map hints, `confirm-email.astro` copy, `Signing in…`, `Creating account…`). Their text is fixed only where an accepted exception applies (the ellipsis).
- **`src/components/ui/`:** not touching it (shadcn boilerplate such as `Close`).
- **Error-class defaults:** not touching `src/lib/images/errors.ts` (developer-facing).
- **Service `reason` unions and the routes' `FIELDS` sets:** not sharing them (typed discriminants, not magic values).
- **`scripts/smoke.mjs`:** not converting it (dependency-free by design).
- **`?error=` spoofing:** not changing how `?error=` is rendered. Arbitrary query text is still shown, escaped by React. Mapping the query to codes is a separate concern.
- **Explicit redirect statuses:** not making them explicit in `src/`; redirects keep Astro's implicit 302.
- **`messages.ts`:** not splitting it into per-domain files. It stays one `MESSAGES` object, grouped by section comments.

## Implementation Approach

1. Phases 1–2 are behavior-preserving moves. Their oracle is the existing suite, which stays green without edits (the e2e oracles included).
2. Phase 3 is the only phase that changes behavior on purpose. Each change gets its own test, and the one e2e oracle that encodes the defect is rewritten deliberately.
3. Phase 4 moves the test-side literals, then turns the rule into tooling (an ESLint rule) and documentation, so it lands after the sweep and `npm run lint` is green the moment it is enabled.

**Duplication boundary**, the answer to the S-04 unknown, recorded in the lesson:

- **Always a key:** any error, validation, notice or response-body message, even if it is used once.
- **A key when repeated:** any other UI string (label, title, h1, link, button, aria-label, placeholder) whose exact text appears 2+ times in `src/`, counting repeats within the same file. An interpolated string counts by its rendered template (e.g. `Rename ${name}` as both title and h1) and gets a helper.
- **Inline:** strings used once, `src/components/ui/`, and starter copy.

**Key naming:** literal keys in `SCREAMING_SNAKE_CASE`, matching the existing `NOTE_NOT_FOUND` style. Interpolated texts get small helper functions next to `imageLabel()`. Labels use a `_LABEL` suffix and page-title fallbacks use `_TITLE`.

## Critical Implementation Details

- **Byte-identical text:** every moved string must match today's output exactly, including straight vs curly quotes, trailing periods, `…` vs `...`, and the `: ` and `, ` separators in `RelationChangeNotice`. JSX `&quot;` and `&hellip;` render as `"` and `…`, so a helper returning those characters renders identically.
- **Accessible names and label collisions:** the button labels that `tests/e2e/support/hydration.ts` uses as hydration sentinels must stay identical. `Name` must stay exact, because `New type name` is a second label in the same form.
- **Literal oracles:** e2e and http oracles never import `MESSAGES` (`auth-session.spec.ts:6-7`).
- **Malformed auth bodies:** treat an unparseable body as an empty form, then let the zod schema produce the message. One code path then covers both "not a form" and "missing field", and neither reaches Supabase, so no GoTrue rate-limit budget is spent.

## Phase 1: Dictionaries + server-side sweep

### Overview

Add the dictionary entries and the narrowed type, then convert the server side: API routes, redirect endpoints, services and zod schemas. Output stays byte-identical.

### Changes Required:

#### 1. HTTP status dictionary and `jsonError`

**File**: `src/lib/constants/http-status.ts`, `src/lib/api.ts`

**Intent**: Add the redirect status the tests need, and make the type system reject statuses outside the dictionary (and `number`-typed values) passed to `jsonError`. `HttpStatus` is a union of the dictionary values, so an in-dictionary literal such as `jsonError(body, 404)` still type-checks; literal enforcement is phase 4's ESLint rule, and phase 1 checks its own sweep with the status grep below.

**Contract**:
- `HTTP_STATUS.FOUND: 302`.
- New export `type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS]`.
- New signature `jsonError(body: ApiError, status: HttpStatus): Response`.
- Update the doc comment on `HTTP_STATUS`, which currently says "New code uses these", to cover all code.

#### 2. `MESSAGES`: server, API and validation entries

**File**: `src/lib/constants/messages.ts`

**Intent**: Add the keys and helpers for every server, API and validation message found in research §4b and in the inventory, grouped by section comments (API errors, validation, auth, UI labels, relation notice, images). Phase 1 adds the server and validation keys below (`CAMPAIGN_SAVE_FAILED` is included for phase 2's `useSaveCampaign` hook); phase 2 adds the UI keys, and phase 3 adds its own auth keys.

**Contract**: new keys, with values byte-identical to the current literals:

| Key / helper | Value |
| --- | --- |
| `CAMPAIGN_NOT_FOUND` | `This campaign doesn't exist or isn't yours.` |
| `NO_CAMPAIGN_FOR_ACCOUNT` | `No campaign found for this account.` |
| `NOTE_TYPE_INVALID` | `The selected type is not valid for this campaign.` |
| `CAMPAIGN_CREATE_FAILED` | `Something went wrong while creating the campaign. Please try again.` |
| `CAMPAIGN_RENAME_FAILED` | `Something went wrong while renaming the campaign. Please try again.` |
| `CAMPAIGN_SAVE_FAILED` | `Something went wrong while saving the campaign. Please try again.` |
| `NOTE_CREATE_FAILED` | `Something went wrong while creating the note. Please try again.` |
| `NOTE_SAVE_FAILED` | `Something went wrong while saving the note. Please try again.` |
| `NOTE_DELETE_FAILED` | `Something went wrong while deleting the note. Please try again.` |
| `NAME_REQUIRED` | `Name is required.` |
| `TYPE_NAME_REQUIRED` | `Type name is required.` |
| `TYPE_ID_INVALID` | `Type id must be a valid uuid.` |
| `campaignNameTaken(name)` | `A campaign named "${name}" already exists.` |
| `noteNameTaken(name)` | `A note named "${name}" already exists in this campaign.` |
| `nameTooLong(max)` | `Name must be at most ${max} characters.` |
| `contentTooLong(max)` | `Content must be at most ${max} characters.` |
| `typeNameTooLong(max)` | `Type name must be at most ${max} characters.` |

Any other zod message in `src/lib/schemas/{campaigns,notes}.ts` gets a key in the same style.

Rename `FOOTER_LICENSES_LINK` to `LICENSES_LABEL` (the text is used as the footer link, the page title and the h1) and update `src/layouts/Layout.astro:40`.

#### 3. API routes

**File**: `src/pages/api/campaigns/index.ts`, `src/pages/api/campaigns/[campaignId]/index.ts`, `src/pages/api/campaigns/[campaignId]/notes.ts`, `src/pages/api/campaigns/[campaignId]/notes/[noteId].ts`

**Intent**: Replace all 40 status literals with `HTTP_STATUS.*` and every inline message with the matching `MESSAGES` key or helper. This includes the local `const NOT_FOUND` in `notes/[noteId].ts:14`, which becomes `MESSAGES.NOTE_NOT_FOUND`.

**Contract**: response statuses and JSON bodies unchanged, including the `field` values.

#### 4. Redirect endpoints

**File**: `src/pages/dashboard.ts`, `src/pages/map.ts`, `src/pages/campaigns/index.ts`, `src/pages/notes/new.ts`, `src/pages/notes/[id].ts`

**Intent**: Plain-text `new Response(...)` bodies and statuses come from `MESSAGES` (`SUPABASE_NOT_CONFIGURED`, `NO_CAMPAIGN_FOR_ACCOUNT`, `NOTE_NOT_FOUND`) and `HTTP_STATUS`.

**Contract**: same status and same body bytes.

#### 5. Services

**File**: `src/lib/services/campaigns.ts`, `src/lib/services/notes.ts`

**Intent**: Replace the 12 SQLSTATE literals with `PG_ERROR.*`, following `note-images.ts:286,378`. The comments that name constraints stay as they are.

**Contract**: the typed result mapping is unchanged.

#### 6. Zod schemas

**File**: `src/lib/schemas/campaigns.ts`, `src/lib/schemas/notes.ts`, `src/lib/schemas/campaigns.test.ts`, `src/lib/schemas/notes.test.ts`

**Intent**: The validation messages come from the new keys and helpers, so phase 2's forms can share them. First, before any message moves, pin today's text: the existing tests assert only `result.success`, and nothing else in the repo asserts these messages.

**Contract**:
- Step 1, done before the move and run green against today's code: add a literal `issues[0].message` assertion to the existing reject cases.
  - `campaigns.test.ts`: empty name → `Name is required.`; 81 chars → `Name must be at most 80 characters.`
  - `notes.test.ts`: empty name → `Name is required.`; 121 chars → `Name must be at most 120 characters.`; content over the limit → `Content must be at most 20000 characters.`; non-uuid `existing.id` → `Type id must be a valid uuid.`; empty new type name → `Type name is required.`; 61 chars → `Type name must be at most 60 characters.`
  - The expected values stay literals, not `MESSAGES` imports.
- Step 2: move the messages to the keys and helpers. `.safeParse` issue messages are byte-identical, and the step-1 assertions pass unedited.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- Integration tests pass against local Supabase: `npm run test:integration`
- Route-guard and forged-id matrices pass on a fresh build: `npm run build && npm run test:http`
- No SQLSTATE literal is left in `src/` code: `grep -rnE '"(23505|23503|23514|42501|22023|P0002)"' src --include=*.ts | grep -v 'src/lib/constants/'` prints nothing
- No status literal is left in the converted routes and endpoints: `grep -rnE '\b[1-5][0-9]{2}\b' src/pages/api/campaigns src/pages/dashboard.ts src/pages/map.ts src/pages/campaigns/index.ts src/pages/notes | grep -v '/images'` prints nothing (49 hits before the change, all statuses)
- No moved server message is left inline: `grep -rnE "doesn't exist or isn't yours|No campaign found for this account|Supabase is not configured\.|You must be signed in|Request body must be valid JSON" src/pages src/lib/services --include=*.ts` prints nothing (the `.astro` not-found `<p>`s are phase 2, checked by 2.6)

#### Manual Verification:

- Spot-check against the preview: a 404 for a foreign campaign id and a 409 for a duplicate campaign name return the same JSON body text as before the change.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: UI sweep

### Overview

Convert pages, hooks, forms and components to the dictionaries. Every repeated UI string gets a key. Rendered output is byte-identical except the accepted ellipsis fix.

### Changes Required:

#### 1. `MESSAGES`: UI entries

**File**: `src/lib/constants/messages.ts`

**Intent**: Add the keys for repeated UI copy and client validation.

**Contract**:

| Group | Key | Value |
| --- | --- | --- |
| Labels | `SIGN_IN_LABEL` | `Sign in` |
| | `SIGN_UP_LABEL` | `Sign up` |
| | `NEW_CAMPAIGN_LABEL` | `New campaign` |
| | `NEW_NOTE_LABEL` | `New note` |
| | `MEMORY_MAP_LABEL` | `Memory map` |
| | `CANCEL_LABEL` | `Cancel` |
| | `DELETE_LABEL` | `Delete` |
| | `EMAIL_LABEL` | `Email` |
| | `PASSWORD_LABEL` | `Password` |
| | `NAME_LABEL` | `Name` |
| | `EMAIL_PLACEHOLDER` | `you@example.com` |
| Pending states | `CREATING` | `Creating…` |
| | `SAVING` | `Saving…` |
| Empty state | `NOTES_EMPTY` | `No notes yet.` |
| | `NOTES_EMPTY_CTA` | `Create your first note` |
| Title fallbacks | `CAMPAIGN_NOT_FOUND_TITLE` | `Campaign not found` |
| | `NOTE_NOT_FOUND_TITLE` | `Note not found` |
| Page titles | `renameCampaignTitle(name)` | `Rename ${name}` |
| Client validation (no trailing periods, as today) | `EMAIL_REQUIRED` | `Email is required` |
| | `EMAIL_INVALID` | `Enter a valid email address` |
| | `PASSWORD_REQUIRED` | `Password is required` |
| | `passwordTooShort(min)` | `Password must be at least ${min} characters` |
| | `CONFIRM_PASSWORD_REQUIRED` | `Please confirm your password` |
| | `PASSWORDS_DO_NOT_MATCH` | `Passwords do not match` |
| | `TYPE_REQUIRED` | `Choose a type.` |
| Relation notice | `noteSavedNotice(name)` | `Saved "${name}".` |
| | `noteDeletedNotice(name)` | `Deleted "${name}".` |
| | `RELATIONS_ADDED_LABEL` | `Relations added` |
| | `RELATIONS_REMOVED_LABEL` | `Relations removed` |
| | `RELATIONS_UNCHANGED` | `Relations unchanged.` |
| | `NO_RELATIONS_TOUCHED` | `No relations touched.` |

#### 2. `.astro` pages

**File**: `src/pages/campaigns/[campaignId]/{index,map,edit}.astro`, `src/pages/campaigns/[campaignId]/notes/new.astro`, `src/pages/campaigns/[campaignId]/notes/[noteId].astro`, `src/pages/campaigns/[campaignId]/notes/[noteId]/edit.astro`, `src/pages/campaigns/new.astro`, `src/pages/auth/{signin,signup}.astro`, `src/pages/licenses.astro`, `src/components/Topbar.astro`

**Intent**:
- The 8 `Astro.response.status = 404` become `HTTP_STATUS.NOT_FOUND`.
- Repeated titles, h1s, links, empty states and not-found `<p>`s use the keys above, plus `CAMPAIGN_NOT_FOUND` and `NOTE_NOT_FOUND`.
- The map h1 `{campaign.name} &mdash; Memory map` may compose `MEMORY_MAP_LABEL` while keeping the em dash.
- The rename page's title and h1 (`edit.astro:25,33`) use `renameCampaignTitle(campaign.name)`.
- The `licenses.astro` title and h1 use `LICENSES_LABEL` (renamed in phase 1).

**Contract**: rendered HTML text unchanged; `Loading map&hellip;` (single-use) stays inline.

#### 3. Client hooks

**File**: `src/components/hooks/useDeleteNote.ts`, `src/components/hooks/useSaveCampaign.ts`

**Intent**: Status comparisons and `successStatus` use `HTTP_STATUS`. The module error constants become `{ error: MESSAGES.X }` (`NOTE_DELETE_FAILED`, `NETWORK_ERROR`, `NOTE_NOT_FOUND`, `CAMPAIGN_SAVE_FAILED`), the same shape as `useSaveNote.ts:10`. `useSaveNote.ts:9` switches to `NOTE_SAVE_FAILED`.

**Contract**: hook behavior unchanged.

#### 4. Forms

**File**: `src/components/campaigns/CampaignForm.tsx`, `src/components/notes/NoteForm.tsx`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Client validation uses the same keys and helpers as the zod schemas (so the schema/form mirror can no longer drift), and the repeated labels, placeholders and pending states use keys.

**Contract**:
- Accessible names stay identical.
- `Signing in...` becomes `Signing in…` and `Creating account...` becomes `Creating account…` (accepted exception 2). They stay inline, because each is used once.

#### 5. Notice and dialog

**File**: `src/components/notes/RelationChangeNotice.tsx`, `src/components/notes/DeleteNoteButton.tsx` (`Layout.astro` was already updated in phase 1)

**Intent**:
- The notice wording comes from the relation-notice keys and helpers, and `aria-label` uses `NOTICE_DISMISS_LABEL`.
- `DeleteNoteButton` uses `DELETE_LABEL` and `CANCEL_LABEL`; its dialog body and `Deleting…` stay inline (single-use).

**Contract**:
- The notice output is byte-identical and keeps the same DOM shape: `<p>` lines inside `role="status"`, links inside the added and removed lines, `: ` and `, ` separators.
- `tests/e2e/notes-relations.spec.ts` passes unedited.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- The http matrices (all 8 page 404s, `forged-id.test.ts`) and the e2e suite pass with no test file edited, on a fresh build: `npm run build && npm run test:http && npm run test:e2e`
- No `.astro` page assigns a literal status: `grep -rnE "response\.status = [0-9]" src` prints nothing
- No repeated copy is left inline: `grep -rnE "No notes yet|Name is required|Something went wrong while|Network error\. Please|doesn't exist or isn't yours" src --include=*.tsx --include=*.astro --include=*.ts | grep -v 'src/lib/constants/'` prints nothing
- No ASCII ellipsis is left in UI labels: `grep -rn '\.\.\."' src/components` prints nothing (spread syntax is excluded by the quote)
- No repeated label or client-validation text is left inline: `grep -rnE '^\s*(Sign in|Sign up|Cancel|Delete|New campaign|New note|Memory map|Create your first note|Third-party licences)\s*$|>(Cancel|Delete)<|"(Sign in|Sign up|Cancel|Delete|Email|Password|Name|Dismiss|New campaign|New note|Memory map|Campaign not found|Note not found|you@example\.com|Third-party licences|Relations (added|removed)|Creating…|Saving…)"|&mdash; Memory map|Rename \$?\{campaign|Relations unchanged|No relations touched|Email is required|Enter a valid email|Password is required|Password must be at least|Please confirm your password|Passwords do not match|Choose a type|(Saved|Deleted) &quot;' src --include=*.tsx --include=*.astro --include=*.ts | grep -v -e src/lib/constants/ -e src/components/ui/` prints nothing (60 hits before the change, all in phase 2 files)

#### Manual Verification:

- Click through signin, signup, dashboard, campaign view, memory map, new and edit note, rename campaign, licences, and a foreign or unknown note URL (404). All text reads as before; the only differences are `Signing in…` and `Creating account…`.
- Edit and delete a note and check that the relation-change notice wording is unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auth defects and route matching

### Overview

Fix the four inherited S-01 auth defects as deliberate, tested behavior changes. All new wording goes through `MESSAGES`.

### Changes Required:

#### 1. Auth form schema

**File**: `src/lib/schemas/auth.ts` (new), `src/lib/schemas/auth.test.ts` (new), `src/components/auth/SignUpForm.tsx`

**Intent**: Validate the signin and signup form bodies on the server, so missing, non-string or malformed fields never reach Supabase or crash the route.

**Contract**:
- `export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`. This is the regex at `SignUpForm.tsx:27`, which now imports it instead of keeping its own copy. It follows the same pattern as the note limits that `schemas/notes.ts` shares with `NoteForm`.
- `authFormSchema = z.object({ email: z.string({ error: MESSAGES.EMAIL_REQUIRED }).trim().min(1, MESSAGES.EMAIL_REQUIRED).regex(EMAIL_PATTERN, MESSAGES.EMAIL_INVALID), password: z.string({ error: MESSAGES.PASSWORD_REQUIRED }).min(1, MESSAGES.PASSWORD_REQUIRED) })`.
- The type-level `error` is required: an absent form field reaches zod as `undefined` (and a file as a `Blob`), which fails the type check before `.min` runs. Without it, zod's default `Invalid input: expected string, received undefined` would reach `?error=`.
- It is not `.strict()`, because `SignUpForm` also posts `confirmPassword`.
- The email format is checked here, because GoTrue reports a malformed address as `validation_failed`, which §2 cannot map to an email message. Password strength stays with Supabase. A malformed email at signin now shows `Enter a valid email address` instead of GoTrue's answer (accepted; it reveals nothing about accounts).
- Tests cover: a valid pair, extra `confirmPassword` accepted, and these rejects, each asserting the literal `issues[0].message`: missing email → `Email is required`; missing password → `Password is required`; whitespace-only email → `Email is required`; a non-string email → `Email is required`; `foo` as email → `Enter a valid email address`.

#### 2. Supabase auth error mapping

**File**: `src/lib/auth-errors.ts` (new), `src/lib/auth-errors.test.ts` (new), `src/lib/constants/messages.ts`

**Intent**: Turn a Supabase `AuthError.code` into a dictionary message, so raw Supabase text never reaches `?error=`. Recognize the duplicate-account codes so signup can follow the success path.

**Contract**:
- `authErrorMessage(code: string | undefined): string` and `isExistingAccountError(code: string | undefined): boolean`.
- New keys:

  | Key | Value |
  | --- | --- |
  | `AUTH_INVALID_CREDENTIALS` | `Invalid login credentials` (byte-identical to today, so `UI_BASELINE.signinInvalidCredentials` stays) |
  | `AUTH_WEAK_PASSWORD` | `Password is too weak. Please choose a stronger one.` |
  | `AUTH_RATE_LIMITED` | `Too many attempts. Please wait a moment and try again.` |
  | `AUTH_EMAIL_NOT_CONFIRMED` | `Please confirm your email address before signing in.` |
  | `AUTH_FAILED` | `Something went wrong. Please try again.` |

- Mapping:

  | Code | Result |
  | --- | --- |
  | `invalid_credentials` | `AUTH_INVALID_CREDENTIALS` |
  | `weak_password` | `AUTH_WEAK_PASSWORD` |
  | `over_request_rate_limit`, `over_email_send_rate_limit` | `AUTH_RATE_LIMITED` |
  | `email_address_invalid` | `EMAIL_INVALID` |
  | `email_not_confirmed` | `AUTH_EMAIL_NOT_CONFIRMED` |
  | anything else, including `undefined` | `AUTH_FAILED` |

- `isExistingAccountError` is true for `user_already_exists` and `email_exists` only.
- Unit tests cover every mapped code, the fallback and `undefined`.

#### 3. Signin and signup routes

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signout.ts`

**Intent**:
- Add `export const prerender = false` to all three routes.
- Parse the body defensively: a `formData()` failure is treated as an empty form. Validate it with `authFormSchema`; on failure, redirect back with `?error=<first issue message>`.
- Use `MESSAGES.SUPABASE_NOT_CONFIGURED`, which adds the period (accepted exception 1).
- Map Supabase errors through `authErrorMessage`.
- In signup, when `isExistingAccountError(error.code)`, redirect to `/auth/confirm-email` exactly like a successful signup.

**Contract**:
- Every response stays an implicit 302 redirect.
- The success targets are unchanged (`/dashboard`, `/auth/confirm-email`, `/`).
- `?error=` always carries a `MESSAGES` value.

#### 4. Protected-route matcher

**File**: `src/lib/protected-routes.ts` (new), `src/lib/protected-routes.test.ts` (new), `src/middleware.ts`

**Intent**: Move `PROTECTED_ROUTES` and the matching into a pure, testable helper, and fix the prefix over-match.

**Contract**:
- `PROTECTED_ROUTES` moves here unchanged.
- `isProtectedPath(pathname: string): boolean` returns true when the pathname equals a route or starts with `route + "/"`. The middleware uses it.
- Unit tests:
  - `/map`, `/map/`, `/campaigns/<uuid>/notes/<uuid>` and `/notes/new` are protected.
  - `/mapping`, `/notesX`, `/campaigns-x`, `/`, `/auth/signin` and `/licenses` are not.

#### 5. HTTP-level auth and matcher tests

**File**: `tests/http/auth-routes.test.ts` (new), `tests/http/route-guard.test.ts`

**Intent**: Prove the new route behavior against the production preview.

**Contract**:
- For both signin and signup:
  - a JSON body redirects (302, `HTTP_STATUS.FOUND`) to `/auth/<route>?error=` with the literal `Email is required`;
  - a form without a password redirects with the literal `Password is required`.
- None of these calls reaches GoTrue.
- `route-guard.test.ts` adds an anonymous probe: `GET /mapping` returns 404 (not a sign-in redirect).
- Oracles are literals, not `MESSAGES` imports.

#### 6. e2e duplicate-signup scenario

**File**: `tests/e2e/auth-session.spec.ts`

**Intent**: Rewrite the defect-characterizing test into the fixed behavior: signing up with the seeded user's email lands on `/auth/confirm-email` with no `?error=`.

**Contract**:
- Remove `UI_BASELINE.signupDuplicateEmail` and its "expected to change in S-04" comment.
- Update the baseline comment to record the decision: on 2026-10-13, in S-04 `/10x-plan`, a duplicate signup was made indistinguishable from success.
- The wrong-password test and its literal baseline stay unchanged.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- New unit tests pass (`auth.test.ts`, `auth-errors.test.ts`, `protected-routes.test.ts`): `npm run test:unit`
- HTTP suite passes, including the new auth-route tests and the `/mapping` probe: `npm run build && npm run test:http`
- e2e passes, with duplicate signup landing on `/auth/confirm-email` and the wrong-password baseline unchanged: `npm run test:e2e`
- Smoke passes against the preview: `npm run smoke`
- No raw Supabase message is passed through: `grep -n "error.message" src/pages/api/auth/*.ts` prints nothing

#### Manual Verification:

- In the browser against the preview:
  - Signing up with an existing email shows the confirm-email page.
  - A wrong password shows "Invalid login credentials".
  - Submitting signup with JS disabled and an empty password shows "Password is required" on the form.
- `curl -i -X POST -H 'Content-Type: application/json' -d '{}' <preview>/api/auth/signin` returns 302 with a `Location` of `/auth/signin?error=Email%20is%20required`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Test literals, regression guard and docs

### Overview

Move the test-side literals and lock the rule in with an ESLint rule, the lesson and the reference docs.

### Changes Required:

#### 1. HTTP test literals

**File**: `tests/http/support/assertions.ts`, `tests/http/support/session.ts`, `tests/http/session-revocation.test.ts`, `tests/http/forged-id.test.ts`, `tests/http/global-setup.ts`

**Intent**: Replace the 5 literal `302`s with `HTTP_STATUS.FOUND` and `res.status === 200` with `HTTP_STATUS.OK`. Test-name strings and comments that mention numbers stay as text.

**Contract**: the assertions are unchanged.

#### 2. Integration test SQLSTATEs

**File**: `tests/integration/create-note-function.test.ts`, `tests/integration/note-edit-delete-functions.test.ts`, `tests/integration/campaigns-service.test.ts`

**Intent**: Replace the 19 SQLSTATE assertion literals with `PG_ERROR.*`, as `rls-policy-matrix.test.ts` already does. Test names stay as they are.

**Contract**: the assertions are unchanged.

#### 3. ESLint guard

**File**: `eslint.config.js`

**Intent**: Add a `no-restricted-syntax` block that rejects numeric HTTP status literals in `src/`, so the per-edit lint hook catches a regression immediately. It goes after `astroConfig` and before `eslintPluginPrettier`.

**Contract**:
- The block has `files: ["src/**/*.{ts,tsx,astro}"]` and `ignores: ["src/**/*.test.ts"]`, plus one message: "Use HTTP_STATUS from @/lib/constants/http-status instead of a numeric status literal."
- Use `[0-9]`, not `\d`, inside `raw=`. The selectors (verified against the current tree: 59 + 2 hits, no false positives) are:

```
Property[key.name='status'] > Literal[raw=/^[1-5][0-9]{2}$/]
Property[key.name='status'] > ConditionalExpression > Literal[raw=/^[1-5][0-9]{2}$/]
AssignmentExpression[left.type='MemberExpression'][left.property.name='status'] > Literal.right[raw=/^[1-5][0-9]{2}$/]
CallExpression[callee.name='jsonError'] > Literal.arguments:nth-child(2)[raw=/^[1-5][0-9]{2}$/]
BinaryExpression[operator=/^[!=]==?$/]:has(MemberExpression[property.name='status']) > Literal[raw=/^[1-5][0-9]{2}$/]
VariableDeclarator[id.name=/[sS]tatus/] Literal[raw=/^[1-5][0-9]{2}$/]
CallExpression[callee.property.name='redirect'] > Literal.arguments:nth-child(2)[raw=/^[1-5][0-9]{2}$/]
```

- The last selector catches an explicit status in `Astro.redirect`, `context.redirect` or `Response.redirect` (0 hits today, since redirects stay implicit; verified to fire on `c.redirect("/x", 301)` and `Response.redirect(url, 307)`).
- Known gap: `switch (res.status) { case 404: }` is not covered. The lesson names it.

#### 4. Lesson

**File**: `context/foundation/lessons.md` (via `/10x-lesson`, append-only)

**Intent**: Record that the constants rule now applies to all code (superseding "in new code"), together with the duplication boundary from this plan and the enforcement points (`HttpStatus`-typed `jsonError`, the ESLint rule) and the rule's known gap (a status in a `switch`/`case` is not caught, so review covers it). Also record that e2e and http oracles stay literal.

**Contract**: a new entry with Context, Problem, Rule and Applies to (`plan`, `implement`, `impl-review`).

#### 5. Reference docs and follow-up

**File**: `docs/reference/contract-surfaces.md`, `README.md`, `context/foundation/test-plan.md`, `context/changes/constants-sweep/follow-ups/deferred-image-defects.md` (new)

**Intent**:
- `contract-surfaces.md:78-80`: drop "existing routes still use literals", and add `HTTP_STATUS.FOUND`, `HttpStatus`, the narrowed `jsonError` and the ESLint rule.
- `contract-surfaces.md`, new auth/middleware entry: `authFormSchema`, `authErrorMessage` / `isExistingAccountError`, the duplicate-signup success path, the `?error=` contract, and `isProtectedPath` exact-or-slash matching in `src/lib/protected-routes.ts`.
- `README.md:161`: `PROTECTED_ROUTES` now lives in `src/lib/protected-routes.ts` and matches the exact path or path + `/`.
- The same location and matching change in `contract-surfaces.md:167` (Routes: "Protected (`PROTECTED_ROUTES` in `src/middleware.ts`)") and in `test-plan.md:148` ("Register the prefix in `PROTECTED_ROUTES` (`src/middleware.ts`)").
- The follow-up note records the two deferred image-path 500s with their test-plan §6.6 references.
- `test-plan.md` §6.6: append an S-04 note (do not edit the earlier phase notes). It marks the four Phase 3 auth defects and the Phase 2 `HTTP_STATUS.FOUND` gap as resolved in S-04, and says the two image-path 500s are deferred, pointing to `follow-ups/deferred-image-defects.md` of change `constants-sweep` (the folder moves to `context/archive/` on archive, so name the change id, not only the current path).

**Contract**: docs only.

### Success Criteria:

#### Automated Verification:

- Lint passes with the new rule enabled: `npm run lint`
- The rule fires on a probe: `printf 'export const r = new Response("", { status: 500 });\n' | npx eslint --stdin --stdin-filename src/lib/api.ts` exits non-zero and its output contains `no-restricted-syntax` (an existing path is required, because a non-existent one fails earlier with a project-service parse error; stdin replaces the file's contents and nothing is written)
- Hook proof still passes: `npm run test:hooks`
- Full suite passes: `npm test`, then `npm run build && npm run test:http && npm run test:e2e`
- No literal 302 is left in tests/http assertions: `grep -rnE "toBe\(302\)|=== 200" tests/http` prints nothing
- No SQLSTATE literal is left in the integration assertions: `grep -rnE '"(23505|23503|23514|42501|22023|P0002)"' tests/integration --include=*.ts` prints nothing (all 19 hits today are assertions; test names mention codes unquoted, so the pattern never matches them)

#### Manual Verification:

- Add `jsonError({ error: "x" }, 404)` to a route file; the per-edit lint hook reports `no-restricted-syntax` back to the agent. Then revert the edit.
- Read the new lesson and the `contract-surfaces.md` entries for accuracy against the final code.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `src/lib/schemas/auth.test.ts`: required fields, extra `confirmPassword`, non-string values.
- `src/lib/auth-errors.test.ts`: every mapped code, the `undefined` and unknown fallback, and `isExistingAccountError` true only for the two duplicate codes.
- `src/lib/protected-routes.test.ts`: exact, trailing-slash and nested matches; the lookalikes `/mapping`, `/notesX` and `/campaigns-x` not matched.
- The existing `schemas/{campaigns,notes}.test.ts` gain literal message assertions before the move (phase 1 §6) and stay green, unedited, after it.

### Integration Tests:

- The existing integration suite is the oracle for the service SQLSTATE mapping (phase 1) and runs unchanged until phase 4 swaps its literals.
- `tests/http`:
  - the existing route-guard and forged-id matrices prove statuses are unchanged (phases 1–2);
  - the new `auth-routes.test.ts` and the `/mapping` probe cover phase 3.
- e2e:
  - `notes-relations.spec.ts` (unedited) proves the notice wording is byte-identical;
  - `auth-session.spec.ts` proves the wrong-password wording and the new duplicate-signup path.

### Manual Testing Steps:

1. Before any test run, check whether an `astro dev` server is already running and ask before stopping it (lessons.md). Run HTTP and e2e checks against the production preview, not `astro dev`.
2. Click through every page touched in phase 2 and compare the text; only the two ellipsis labels differ.
3. Try the phase 3 auth scenarios in the browser (existing-email signup, wrong password, JS-disabled empty submit) and the `curl` JSON-body probe.

## Performance Considerations

None. These are constant lookups and one zod parse per auth request.

## Migration Notes

There is no schema or data change. Rolling back is a git revert. The one user-visible behavior change that matters is the duplicate signup: it lands on confirm-email. In a hosted project with email confirmations on, Supabase already behaves this way.

## References

- Research: `context/changes/constants-sweep/research.md`
- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd-v2.md:74,152,189`
- Inherited defects: `context/foundation/test-plan.md` §6.6 (Phase 3 auth defects, Phase 2 302 gap and image defects)
- Pattern already converted: `src/pages/api/campaigns/[campaignId]/notes/[noteId]/images.ts`, `src/components/hooks/useSaveNote.ts:10`, `src/lib/services/note-images.ts:286`
- Testable-helper pattern: `src/lib/campaign-paths.ts`
- Literal oracles: `tests/e2e/auth-session.spec.ts:6-12`, `tests/e2e/notes-relations.spec.ts:13-19`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dictionaries + server-side sweep

#### Automated

- [x] 1.1 Type check passes: `npx astro check` — e7c0bb3
- [x] 1.2 Lint passes: `npm run lint` — e7c0bb3
- [x] 1.3 Unit tests pass: `npm run test:unit` — e7c0bb3
- [x] 1.4 Integration tests pass against local Supabase: `npm run test:integration` — e7c0bb3
- [x] 1.5 Route-guard and forged-id matrices pass on a fresh build: `npm run build && npm run test:http` — e7c0bb3
- [x] 1.6 No SQLSTATE literal is left in `src/` code (grep prints nothing) — e7c0bb3
- [x] 1.7 No status literal is left in the converted routes and endpoints (grep prints nothing) — e7c0bb3
- [x] 1.8 No moved server message is left inline (grep prints nothing) — e7c0bb3

#### Manual

- [x] 1.9 Spot-check foreign-campaign 404 and duplicate-name 409 JSON bodies match pre-change text — e7c0bb3

### Phase 2: UI sweep

#### Automated

- [x] 2.1 Type check passes: `npx astro check` — e81ec39
- [x] 2.2 Lint passes: `npm run lint` — e81ec39
- [x] 2.3 Unit tests pass: `npm run test:unit` — e81ec39
- [x] 2.4 The http matrices and the e2e suite pass with no test file edited, on a fresh build: `npm run build && npm run test:http && npm run test:e2e` — e81ec39
- [x] 2.5 No `.astro` page assigns a literal status (grep prints nothing) — e81ec39
- [x] 2.6 No repeated copy is left inline (grep prints nothing) (note: the only hits are the literal `Name is required.` oracles in `src/lib/schemas/{campaigns,notes}.test.ts`, kept literal by design per phase 1 §6; the grep with `*.test.ts` excluded prints nothing, decided in /10x-implement phase 2) — e81ec39
- [x] 2.7 No ASCII ellipsis is left in UI labels (grep prints nothing) — e81ec39
- [x] 2.8 No repeated label or client-validation text is left inline (grep prints nothing) — e81ec39

#### Manual

- [x] 2.9 Click-through of all touched pages shows unchanged text except the two ellipsis labels — e81ec39
- [x] 2.10 Relation-change notice wording unchanged after edit and delete — e81ec39

### Phase 3: Auth defects and route matching

#### Automated

- [x] 3.1 Type check passes: `npx astro check`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 New unit tests pass (`auth.test.ts`, `auth-errors.test.ts`, `protected-routes.test.ts`): `npm run test:unit`
- [x] 3.4 HTTP suite passes, including new auth-route tests and the `/mapping` probe: `npm run build && npm run test:http`
- [x] 3.5 e2e passes with duplicate signup landing on confirm-email and wrong-password baseline unchanged: `npm run test:e2e`
- [x] 3.6 Smoke passes against the preview: `npm run smoke`
- [x] 3.7 No raw Supabase message is passed through (grep prints nothing)

#### Manual

- [x] 3.8 Browser check: existing-email signup, wrong password, JS-disabled empty password
- [x] 3.9 curl JSON-body probe to signin returns 302 with `?error=Email%20is%20required`

### Phase 4: Test literals, regression guard and docs

#### Automated

- [ ] 4.1 Lint passes with the new rule enabled: `npm run lint`
- [ ] 4.2 The rule fires on a probe via `eslint --stdin` (output contains `no-restricted-syntax`)
- [ ] 4.3 Hook proof still passes: `npm run test:hooks`
- [ ] 4.4 Full suite passes: `npm test`, then `npm run build && npm run test:http && npm run test:e2e`
- [ ] 4.5 No literal 302 is left in tests/http assertions (grep prints nothing)
- [ ] 4.6 No SQLSTATE literal is left in the integration assertions (grep prints nothing)

#### Manual

- [ ] 4.7 Per-edit lint hook reports a deliberately added literal status, then revert
- [ ] 4.8 New lesson and contract-surfaces entries read accurately against the final code
