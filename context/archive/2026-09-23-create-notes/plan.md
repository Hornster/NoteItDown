# Create Notes (S-01) Implementation Plan

## Overview

Roadmap slice S-01 (`create-notes`): a signed-in user can create a note in their campaign, with a name, plain-text content, and either a predefined type (NPC/Place/Quest/Observation) or a custom type. A custom type's name is unique within the campaign, ignoring case. The user can see the note in a list on the dashboard and open it on its own page. This is the minimal prerequisite for the north star S-02: exact-name matching can't be tested without notes to match against. There is no relation-detection logic in this slice.

The slice also adds Vitest (unit + integration suites). Integration tests run against the local Supabase that CI already starts in the `smoke` job.

## Current State Analysis

- **Schema is ready (F-01, archived):** `public.notes (campaign_id, type_id, name, content)`, `public.note_types (campaign_id, name, is_predefined)`. Every campaign gets the 4 predefined types from the seed trigger. RLS allows `authenticated` to insert custom (`is_predefined = false`) types and notes into campaigns they own. `supabase/migrations/20260922120000_campaign_notes_schema.sql:28-110`.
- **Constraints the app must surface as user-facing errors:**
  - `notes_campaign_name_key` on `(campaign_id, lower(name))`: duplicate note name, ignoring case.
  - `note_types_campaign_name_key` on `(campaign_id, lower(name))`: duplicate type name, ignoring case.
  - `name = btrim(name) and name <> ''` on both tables.
  - Composite FK `notes_type_same_campaign_fkey`: a note's type must belong to the same campaign.
- **No DELETE policy on `note_types`:** a custom type left behind by a half-finished create could never be removed by the user. This is why the create path must be atomic.
- **No domain code:** no API routes, pages or services beyond auth (`src/pages/api/auth/*`). `/dashboard` is a placeholder (`src/pages/dashboard.astro`). `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`). `src/components/hooks/` does not exist.
- **zod is not installed** even though CLAUDE.md requires zod validation for API routes.
- **The auth form pattern (native POST, then redirect with `?error=`) loses typed input** (`src/pages/api/auth/signin.ts:17-19`). That's unacceptable for long note content.
- **No test runner:** `scripts/smoke.mjs` is the only automated end-to-end check. The CI `smoke` job (`.github/workflows/ci.yml`) already starts a local Supabase and writes `API_URL`/`ANON_KEY` into `.env`. Local email confirmations are off: smoke signs in immediately after signup (`scripts/smoke.mjs`).
- **`src/lib/supabase.ts` imports `astro:env/server`,** so any module that imports it cannot run under plain Vitest.

## Desired End State

- `/dashboard` shows the active campaign's name, a "New note" link, and a list of its notes (name + type), newest first, with an empty state when there are none.
- `/notes/new` shows a form with fields for name, type and content. The type dropdown lists the predefined types, then existing custom types, then "New type…", which reveals a text field for the custom type name. Submitting creates the note (and the custom type, if one was entered) in one transaction and opens `/notes/[id]`. Errors appear inline and never clear what the user typed. A duplicate name shows an error on the name field.
- `/notes/[id]` shows the note's name, type and content (plain text, line breaks kept). A note that doesn't exist or isn't the user's returns 404.
- `POST /api/notes` is the single creation endpoint. It **takes no campaign id from the client**; the campaign comes from `getActiveCampaign` on the server.
- `npm run test:unit` and `npm run test:integration` exist and pass. CI runs them in the `ci` and `smoke` jobs respectively.

### Key Discoveries:

- Case-insensitive unique indexes can be used as the `ON CONFLICT` target through expression inference: `on conflict (campaign_id, lower(name))`. `supabase/migrations/20260922120000_campaign_notes_schema.sql:37-38`.
- Predefined types come only from the seed trigger. The insert policy rejects `is_predefined = true`. `supabase/migrations/20260922120000_campaign_notes_schema.sql:47-54`.
- Every new table/function added through a migration is load-bearing and must be registered in `docs/reference/contract-surfaces.md` (F-01 convention).
- Existing React form building blocks can be reused or mirrored: `src/components/auth/FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx`. The glass/`bg-cosmic` page styling is in `src/pages/auth/signin.astro`.

## What We're NOT Doing

- Relation detection or the memory map (S-02); nothing is written to `relations`.
- Editing or deleting notes (S-04), and renaming or deleting custom types (no UPDATE/DELETE policy on `note_types` is added).
- Multiple campaigns or a campaign switcher (S-03). `getActiveCampaign` returns the user's oldest campaign.
- Image attachments (S-05).
- Search, filtering, sorting options or pagination of the notes list.
- Markdown or rich text: content is plain text only.
- Generating Supabase DB types (`supabase gen types`); hand-written types in `src/types.ts` stay the contract.
- Changing `scripts/smoke.mjs`; it stays an auth-flow smoke check.

## Implementation Approach

Build the database side first, then the rest on top of it:

1. A `create_note` Postgres function (SECURITY INVOKER, so RLS still applies) does "resolve or create the type, then insert the note" in one transaction. This rules out leftover custom types by design.
2. Thin service functions in `src/lib/services/` take a `SupabaseClient` parameter and never import `astro:env`. That keeps them testable under plain Vitest.
3. A zod-validated JSON endpoint `POST /api/notes` resolves the campaign on the server and maps DB errors to HTTP statuses with the field that caused them.
4. A React island form posts with `fetch` so input survives errors. The list and detail pages are server-rendered Astro pages.

## Critical Implementation Details

### S-03 handoff: the campaign is resolved on the server, never supplied by the frontend

`POST /api/notes`, `/dashboard`, `/notes/new` and `/notes/[id]` all get the target campaign from `getActiveCampaign(supabase)`, which in this slice returns the caller's **oldest** campaign. The request body has **no** `campaign_id` field, and the zod schema must reject unknown keys (`.strict()`) so none can be passed in. This is deliberate and load-bearing:

- **Security:** there's no client-supplied campaign id to tamper with at the API layer. RLS and the composite FK remain the DB-level backstop.
- **S-03 impact:** when multiple campaigns arrive, S-03 must decide how the active campaign is chosen (for example a cookie, or a campaign id in the URL) and change `getActiveCampaign` or the endpoint contract accordingly. If S-03 moves the campaign id into the request, it must re-check ownership on the server before calling `create_note`.

Phase 3 records this in `docs/reference/contract-surfaces.md`, so S-03 planning reads it there rather than relying on this plan.

### `ON CONFLICT DO NOTHING` returns no row when the type already exists

`insert ... on conflict (campaign_id, lower(name)) do nothing returning id` yields NULL when the type already exists, so the function must then `select` the existing id with the same case-insensitive predicate. Use `DO NOTHING` rather than `DO UPDATE`: `DO UPDATE` would need an UPDATE RLS policy on `note_types`, which doesn't exist and shouldn't be added.

### Signup and seeding coupling is untouched

This slice adds no constraints to `campaigns` or `note_types`, so the signup trigger chain from contract-surfaces ("Signup coupling") is unaffected. Keep it that way. For example, do not add a length check to `note_types.name` in this migration; its 60-char limit is enforced in zod only (advisory, since a direct PostgREST insert can bypass it).

`notes` is **not** part of the signup chain, so its limits are enforced in the DB as well: the anon key is public, and RLS allows a direct `insert` into `notes` or an `rpc('create_note')` call that skips zod. The migration adds `notes_name_length_check (char_length(name) <= 120)` and `notes_content_length_check (char_length(content) <= 20000)`. The zod limits must match these values.

## Phase 1: DB function + test foundation

### Overview

Set up Vitest and add the atomic `create_note` function. Integration tests prove it is atomic, reuses types, and respects tenant isolation.

### Changes Required:

#### 1. Vitest setup

**File**: `package.json`, `vitest.config.ts` (new), `tsconfig.json` (only if needed to include `tests/`)

**Intent**: Add Vitest as the project's test runner with separate unit and integration suites. Unit tests run anywhere; integration tests need a running local Supabase.

**Contract**:
- devDependency `vitest` (^5, compatible with the installed Vite 8).
- Node environment and an `@` → `./src` alias.
- Two projects (or include globs): unit = `src/**/*.test.ts`; integration = `tests/integration/**/*.test.ts`. Integration tests run sequentially (no file parallelism) because they share one DB.
- Scripts:
  - `test:unit`: runs the unit suite.
  - `test:integration`: runs the integration suite.
  - `test`: runs both.
- Integration tests read `SUPABASE_URL` / `SUPABASE_KEY` from `process.env` (loaded from `.env` via Vite's `loadEnv` in the config). If either is missing they **fail with a clear message** rather than skipping, so CI can never pass by skipping them.
- Integration-only `globalSetup` (`tests/integration/global-setup.ts`; not attached to the unit project, so `test:unit` in the `ci` job needs no env) runs these preflight checks and throws with a clear message:
  - env vars present;
  - `SUPABASE_URL` host is `127.0.0.1` or `localhost`. Otherwise refuse: "integration tests only run against local Supabase". This keeps an `.env` pointed at production from creating throwaway users there;
  - `GET ${SUPABASE_URL}/auth/v1/health` (with the `apikey` header) succeeds. Otherwise: "Local Supabase not running — run `npx supabase start`".
- ESLint must lint the test files under the existing strict config. Test files must not import `@/lib/supabase` (it imports `astro:env`).

#### 2. Integration test helpers

**File**: `tests/integration/helpers.ts` (new)

**Intent**: Shared setup that creates throwaway signed-in users against local Supabase, so each test can act as tenant A or tenant B.

**Contract**: `createTestUser(): Promise<{ client: SupabaseClient; userId: string; campaignId: string }>`. It signs up `test-<random>@example.com` with the anon key, **uses the session `signUp` returns (no separate `signInWithPassword`)**, and reads the auto-created campaign. It relies on local email confirmations being off (same assumption as `scripts/smoke.mjs`); if `signUp` returns no session, throw a clear error.
- **Auth rate-limit budget:** local GoTrue allows `sign_in_sign_ups = 30` per 5 min per IP (`supabase/config.toml`), shared with the `smoke` step that runs right after the tests in the same CI job. Each test file creates the tenants it needs **once in `beforeAll`** and reuses them across its tests (unique note names per test). Don't create a user per test, and don't raise the limit in `config.toml`.

#### 3. `create_note` function migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_note_function.sql` (new; timestamp later than `20260923120000`)

**Intent**: Create an optional custom type and the note atomically, so a failed note insert (for example a duplicate name) can never leave behind a custom type the user can't delete.

**Contract**: `public.create_note(p_campaign_id uuid, p_name text, p_content text, p_type_id uuid default null, p_new_type_name text default null) returns public.notes`
- `language plpgsql`, `security invoker`, `set search_path = ''`, fully schema-qualified names.
- Exactly one of `p_type_id` / `p_new_type_name` must be non-null. Otherwise `raise exception` with SQLSTATE `22023` (invalid_parameter_value).
- With `p_new_type_name`: insert into `public.note_types (campaign_id, name)` with `on conflict (campaign_id, lower(name)) do nothing`. If no row is returned, select the existing type's id case-insensitively. A predefined type counts as a match: `'npc'` resolves to `NPC`.
- Inserts the note and returns the full row. Unique, check and FK violations propagate with their normal SQLSTATEs (`23505`, `23514`, `23503`) so the service can map them. RLS violations propagate as `42501`.
- `revoke execute ... from public, anon; grant execute ... to authenticated`.
- Same migration: `alter table public.notes add constraint notes_name_length_check check (char_length(name) <= 120)` and `add constraint notes_content_length_check check (char_length(content) <= 20000)` (see "Signup and seeding coupling"). Production `notes` has no rows yet (no creation path existed before this slice), so the constraints validate trivially.

#### 4. Integration tests for the function

**File**: `tests/integration/create-note-function.test.ts` (new)

**Intent**: Prove the DB contract that the API relies on.

**Contract**: covers the cases listed under Testing Strategy → Integration Tests (function level).

#### 5. CI wiring

**File**: `.github/workflows/ci.yml`

**Intent**: Run both suites in CI.

**Contract**:
- `ci` job: add `npm run test:unit` after lint.
- `smoke` job: after the `.env` is written, add `npm run test:integration` before the build/preview step. It uses the same `.env`, and `supabase start` has already applied migrations.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- Integration tests for `create_note` pass: `npm run test:integration`
- Unit suite runs (may be empty or contain a trivial check) and exits 0: `npm run test:unit`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio or psql, as `anon`, `create_note` is not executable. As `authenticated`, it is.
- Stopping local Supabase and running `npm run test:integration` fails with a clear "Supabase not configured/running" message, not a silent skip.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Services + API

### Overview

Server-side business logic and the `POST /api/notes` endpoint, with zod validation and mapping from DB errors to HTTP responses.

### Changes Required:

#### 1. zod dependency

**File**: `package.json`

**Intent**: Add `zod` to satisfy the CLAUDE.md "validate API input with zod" convention.

**Contract**: runtime dependency `zod` (current major).

#### 2. Shared DTOs

**File**: `src/types.ts`

**Intent**: Add request/response shapes shared by the API, services and the React form. Entity interfaces stay unchanged.

**Contract**:
- `CreateNoteCommand`: `{ name: string; content: string; type: { kind: "existing"; id: string } | { kind: "new"; name: string } }`. It has **no campaign id** (see S-03 handoff).
- `NoteListItem`: note fields needed for the list (`id`, `name`, `type_name`, `created_at`).
- `NoteDetail`: `Note` plus `type_name`.
- `ApiError`: `{ error: string; field?: "name" | "content" | "type" }`.

#### 3. Validation schema

**File**: `src/lib/schemas/notes.ts` (new)

**Intent**: The single zod schema for `CreateNoteCommand`, used by the API route.

**Contract**:
- `createNoteSchema` is `.strict()`.
- `name`: trimmed, 1–120 chars.
- `content`: string, at most 20,000 chars, default `""`. Content is not trimmed; the user's whitespace is kept.
- `type`: discriminated union on `kind`. `existing.id` is a uuid. `new.name` is trimmed, 1–60 chars.
- Its inferred type must stay assignable to `CreateNoteCommand`.

#### 4. Campaign service

**File**: `src/lib/services/campaigns.ts` (new)

**Intent**: The single place that decides which campaign the current request acts on (S-03 changes only this function).

**Contract**: `getActiveCampaign(supabase: SupabaseClient): Promise<Campaign | null>` returns the caller's oldest campaign (`order by created_at asc, id asc limit 1`), found through RLS. It returns `null` if the user has none. The JSDoc must name the S-03 handoff.

#### 5. Notes service

**File**: `src/lib/services/notes.ts` (new)

**Intent**: Queries and the create command, independent of Astro.

**Contract**:
- `listNoteTypes(supabase, campaignId): Promise<NoteType[]>`: predefined first, then custom, each alphabetical.
- `listNotes(supabase, campaignId): Promise<NoteListItem[]>`: newest first, joined with the type name.
- `getNote(supabase, id): Promise<NoteDetail | null>`: RLS makes other tenants' notes appear as null.
- `createNote(supabase, campaignId, command): Promise<CreateNoteResult>`: calls `supabase.rpc("create_note", …)` and returns either the created `Note` or a typed failure: `duplicate_name` (23505 on `notes_campaign_name_key`), `invalid_type` (23503 / 42501 / 22023, or a type id not in the campaign), or `unexpected` (anything else). Raw DB messages are never passed through.
- Results from the untyped supabase-js client are narrowed to `src/types.ts` interfaces, with no `any` leaking past the service (strict ESLint).

#### 6. Create note endpoint

**File**: `src/pages/api/notes/index.ts` (new)

**Intent**: The JSON endpoint the form island calls.

**Contract**:
- `export const prerender = false`; `POST`.
- 401 `ApiError` if `locals.user` is missing (JSON, not a redirect).
- 400 with `field` if the body is not JSON or fails zod.
- 404 if `getActiveCampaign` returns null.
- On success, 201 with `{ id }`.
- Failure mapping: `duplicate_name` → 409 `{ error: "A note named \"<name>\" already exists in this campaign.", field: "name" }`; `invalid_type` → 400 `field: "type"`; `unexpected` → 500 with a generic message, plus a `console.error` of the underlying error (a documented `no-console` exception).

#### 7. Tests

**Files**: `src/lib/schemas/notes.test.ts` (new), `tests/integration/notes-service.test.ts` (new)

**Intent**: Unit-test the schema's boundaries and integration-test the service's error mapping against the real DB.

**Contract**: the cases under Testing Strategy (unit + service level).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With `npm run dev` and a signed-in session cookie, `curl -X POST /api/notes` with a valid body returns 201. Repeating it returns 409 with `field: "name"`. Adding a `campaign_id` key returns 400.
- Without a session, `POST /api/notes` returns 401 JSON, not a redirect.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI + docs

### Overview

The user-visible slice: notes list on the dashboard, the create form, and the detail page. The documentation is updated to record the new contracts (including the S-03 handoff) and the fact that a test runner now exists.

### Changes Required:

#### 1. Route protection

**File**: `src/middleware.ts`

**Intent**: Make note pages require a signed-in user.

**Contract**: `PROTECTED_ROUTES` gains `"/notes"`. `/api/notes` is not added: it returns its own 401 JSON.

**Addendum (impl-review F1)**: `src/pages/api/auth/signin.ts` now redirects to `/dashboard` (was `/`) after a successful sign-in, so users land on the notes list. Implemented in 36b9f18; not in the original plan.

#### 2. Dashboard as notes list

**File**: `src/pages/dashboard.astro`, optional `src/components/notes/NoteList.astro` (new)

**Intent**: Turn the placeholder into the campaign's notes list.

**Contract**:
- Server-rendered with `getActiveCampaign` + `listNotes`.
- Shows the campaign name, a "New note" link to `/notes/new`, and rows linking to `/notes/[id]` with the name and a type badge.
- The empty state includes a call to action to create the first note.
- The existing sign-out control is kept (or replaced by `Topbar.astro`).
- Follows the existing `bg-cosmic` glass styling.

#### 3. Create note page + form island + hook

**Files**: `src/pages/notes/new.astro` (new), `src/components/notes/CreateNoteForm.tsx` (new), `src/components/hooks/useCreateNote.ts` (new), shadcn `input`/`textarea`/`label` via `npx shadcn@latest add` as needed

**Intent**: The creation form. It keeps all input on error and navigates to the new note on success.

**Contract**:
- The page loads `listNoteTypes` for the active campaign and passes it as a prop to `<CreateNoteForm client:load />`.
- Form fields:
  - name: required.
  - type: a `<select>` with predefined types, then custom types, then a "New type…" option. Choosing "New type…" shows a required custom-type text input.
  - content: a multi-line textarea.
- Client-side checks mirror the zod limits.
- `useCreateNote` POSTs a `CreateNoteCommand` as JSON to `/api/notes` and exposes `{ submit, pending, error }`. On 201 the form navigates to `/notes/<id>`. On an `ApiError` with `field`, the error shows under that field; without one, it goes in `ServerError`. The textarea and other inputs are never reset on error.
- The submit button is disabled while pending, to prevent double submission.

#### 4. Note detail page

**File**: `src/pages/notes/[id].astro` (new)

**Intent**: Read-only view of one note. It's the target S-02's map navigation (FR-010) will link to.

**Contract**:
- Server-rendered with `getNote`. Returns a 404 response when the note is null (includes other tenants' notes and non-uuid ids; validate the id format before querying).
- Shows the name, type badge, and content in a `whitespace-pre-wrap` block, rendered as escaped text only (no `set:html`).
- Has a "Back to notes" link to `/dashboard`.

#### 5. Documentation sync

**Files**: `docs/reference/contract-surfaces.md`, `README.md`, `CLAUDE.md`

**Intent**: Register the new load-bearing names and the S-03 handoff; stop documenting "no test framework".

**Contract**:
- contract-surfaces gets new sections:
  - `create_note` function: signature, SECURITY INVOKER, grants, type-reuse semantics, SQLSTATEs.
  - `POST /api/notes`: request/response contract, and the rule that **no campaign id is accepted**.
  - **Active campaign resolution**: `getActiveCampaign` is the single resolver and returns the oldest campaign. **S-03 must revisit it**, and must re-check ownership on the server if a campaign id ever comes from the client.
  - Routes `/dashboard`, `/notes/new`, `/notes/[id]` (the FR-010 navigation target).
- contract-surfaces existing sections updated:
  - `notes`: add `notes_name_length_check` (≤ 120) and `notes_content_length_check` (≤ 20,000), which must stay in sync with `createNoteSchema`.
  - `Migration file`: append the `create_note` migration entry (function, grants, `notes` length checks; applied manually via `db push`).
  - `Shared TypeScript types`: state that `src/types.ts` also holds the non-table DTOs (`CreateNoteCommand`, `NoteListItem`, `NoteDetail`, `ApiError`); only the entity interfaces mirror tables field for field.
- README: a Testing section (`test:unit`, `test:integration` needs `npx supabase start`).
- CLAUDE.md "Commands": add the test scripts and replace the "No unit/integration/e2e test framework is configured" paragraph (e2e still absent).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- All tests pass: `npm test`
- Existing smoke check still passes against the preview: `npm run smoke`

#### Manual Verification:

- A fresh signup lands on an empty dashboard showing "My Campaign" and a create call to action.
- Creating an NPC note named "Bob the Blacksmith" navigates to its detail page. The note appears on the dashboard with an "NPC" badge.
- Creating a note with a new type "Faction" works. The next time the form opens, "Faction" is in the dropdown. Entering new type "faction" or "npc" reuses the existing type, and no duplicate appears in the dropdown.
- Submitting a second note named "bob the blacksmith" shows the duplicate-name error on the name field. The long content typed in the textarea is still there.
- Multi-line content keeps its line breaks on the detail page. Content like `<script>` renders as literal text.
- Opening another user's note URL (second account) returns 404. `/notes/new` while signed out redirects to sign-in.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `createNoteSchema`:
  - Trims the name.
  - Rejects an empty or whitespace-only name, a name over 120 chars, and content over 20,000 chars.
  - Rejects a `new` type name that is empty or over 60 chars.
  - Rejects a non-uuid `existing.id`.
  - **Rejects an unknown `campaign_id` key** (strict).
  - Keeps leading/trailing whitespace in content.

### Integration Tests:

- **Function level (Phase 1):**
  - Creates a note with a predefined type.
  - Creates a note with a new custom type, and the `note_types` row exists with `is_predefined = false`.
  - A new type `"npc"` reuses the predefined `NPC` id, and no new type row appears.
  - Duplicate note name, ignoring case → `23505`, and **no new custom type remains** (atomicity).
  - Both or neither type argument → `22023`.
  - Tenant B calling `create_note` with tenant A's campaign id → `42501`, in **both** variants: (a) `p_type_id` = A's `NPC` id (fails on the note insert), and (b) `p_new_type_name` = `"Faction"` (fails on the `note_types` insert, the `ON CONFLICT` path). After each, A's `notes` and `note_types` counts, read with A's client, are unchanged.
  - Tenant B using tenant A's `type_id` in B's own campaign → FK failure.
  - A name of 121 chars or content of 20,001 chars passed straight to `create_note` → `23514` (DB length checks hold without zod).
- **Service level (Phase 2):**
  - `createNote` maps duplicate name → `duplicate_name` and a foreign type → `invalid_type`.
  - `listNotes` is newest-first with type names.
  - `getNote` returns null for another tenant's note.
  - `getActiveCampaign` returns the signup default campaign.

### Manual Testing Steps:

See Phase 3 Manual Verification. It is the end-to-end user-acceptance pass.

## Performance Considerations

Campaign sizes are small (PRD `target_scale: small`). The list query is a single RLS-scoped select using the existing `notes_campaign_id_idx`, with no pagination. Creating a note is a single RPC round-trip.

## Migration Notes

One additive migration: a new function plus two length check constraints on `notes` (none on `campaigns`/`note_types`). Production rollout follows the F-01 precedent: a manual, human-approved `npx supabase db push` before (or together with) deploying the app code. CI does not run migrations, and deployed code calling a missing `create_note` would return 500. Rollback: `drop function public.create_note(...)` and `alter table public.notes drop constraint notes_name_length_check, drop constraint notes_content_length_check`. No data is affected.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-003; FR-010 motivates the detail page)
- Prior change: `context/archive/2026-09-22-campaign-notes-schema/` (plan, brief, reviews)
- Schema: `supabase/migrations/20260922120000_campaign_notes_schema.sql`, `supabase/migrations/20260923120000_restrict_update_columns.sql`
- Contract registry: `docs/reference/contract-surfaces.md`
- Patterns: `src/components/auth/SignInForm.tsx`, `src/components/auth/ServerError.tsx`, `src/pages/auth/signin.astro`, `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB function + test foundation

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB: `npx supabase db reset` — 7a36060
- [x] 1.2 Integration tests for `create_note` pass: `npm run test:integration` — 7a36060
- [x] 1.3 Unit suite runs (may be empty or contain a trivial check) and exits 0: `npm run test:unit` — 7a36060
- [x] 1.4 Lint passes: `npm run lint` — 7a36060

#### Manual

- [x] 1.5 In Supabase Studio or psql, as `anon`, `create_note` is not executable; as `authenticated`, it is — 7a36060
- [x] 1.6 Stopping local Supabase and running `npm run test:integration` fails with a clear message, not a silent skip — 7a36060

### Phase 2: Services + API

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:unit` — d45517c
- [x] 2.2 Integration tests pass: `npm run test:integration` — d45517c
- [x] 2.3 Lint passes: `npm run lint` — d45517c
- [x] 2.4 Type check passes: `npx astro check` — d45517c
- [x] 2.5 Production build succeeds: `npm run build` — d45517c

#### Manual

- [x] 2.6 curl `POST /api/notes`: valid body returns 201, repeat returns 409 with `field: "name"`, a `campaign_id` key returns 400 — d45517c
- [x] 2.7 Without a session, `POST /api/notes` returns 401 JSON, not a redirect — d45517c

### Phase 3: UI + docs

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 36b9f18
- [x] 3.2 Type check passes: `npx astro check` — 36b9f18
- [x] 3.3 Production build succeeds: `npm run build` — 36b9f18
- [x] 3.4 All tests pass: `npm test` — 36b9f18
- [x] 3.5 Existing smoke check still passes against the preview: `npm run smoke` — 36b9f18

#### Manual

- [x] 3.6 Fresh signup lands on an empty dashboard showing "My Campaign" and a create call to action — 36b9f18
- [x] 3.7 Creating NPC note "Bob the Blacksmith" navigates to its detail page and appears on the dashboard with an "NPC" badge — 36b9f18
- [x] 3.8 New type "Faction" is created and offered next time; new type "faction"/"npc" reuses the existing type with no duplicate — 36b9f18
- [x] 3.9 Duplicate name "bob the blacksmith" shows the name-field error and the typed content is kept — 36b9f18
- [x] 3.10 Multi-line content keeps line breaks; `<script>` content renders as literal text — 36b9f18
- [x] 3.11 Another user's note URL returns 404; `/notes/new` while signed out redirects to sign-in — 36b9f18
