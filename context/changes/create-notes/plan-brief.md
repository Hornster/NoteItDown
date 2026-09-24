# Create Notes (S-01) — Plan Brief

> Full plan: `context/changes/create-notes/plan.md`

## What & Why

Roadmap slice S-01: a signed-in user can create a note (name, plain-text content, and a predefined or custom type) in their campaign, see it listed on the dashboard, and open it. This is the minimal prerequisite for the north star S-02: exact-name relation matching can't be tested without real notes. The slice also introduces Vitest, the project's first test runner.

## Starting Point

F-01 already shipped the `notes`/`note_types` schema, RLS, and per-campaign case-insensitive uniqueness, and signup seeds a default campaign with 4 predefined types. No domain code exists yet: `/dashboard` is a placeholder, there are no domain API routes, zod isn't installed, and there are no tests beyond `scripts/smoke.mjs`.

## Desired End State

The dashboard lists the campaign's notes. `/notes/new` creates a note whose type can be picked from a dropdown or entered as a new custom type inline. Errors (such as a duplicate name) show inline and never clear the typed text. `/notes/[id]` shows the note and is ready as S-02's navigation target. Unit and integration test suites run in CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Slice surface | List (dashboard) + create page + read-only detail page | A note you can't see isn't a verifiable outcome, and S-02's map navigation (FR-010) needs a target page. | Plan |
| Custom type UX | Inline "New type…" option in the note form | One step, no type-management screen; matches FR-003's wording. | Plan |
| Type name clash (ignoring case) | Reuse the existing type (`npc` → `NPC`) | The unique index already treats them as the same type; never blocks the user. | Plan |
| Atomicity | `create_note` Postgres function (SECURITY INVOKER, one transaction) | No leftover custom types; `note_types` has no DELETE policy, so they couldn't be removed later. | Plan |
| Form submission | React island + JSON `POST /api/notes` (zod) | Long note content survives errors; errors attach to the field that caused them. | Plan |
| **Campaign resolution** | **Server-side `getActiveCampaign` (oldest campaign); the API accepts no `campaign_id` from the frontend (strict schema)** | **Nothing for a client to tamper with; S-03 changes one helper. Explicit S-03 handoff recorded in contract-surfaces.** | Plan (user-flagged for S-03) |
| Verification | Vitest: unit suite in the `ci` job, integration suite against local Supabase in the `smoke` job | Real regression coverage for RPC/RLS/atomicity; `smoke.mjs` stays auth-only. | Plan |
| Input limits | Name ≤ 120, content ≤ 20,000 chars (zod + DB checks on `notes`); custom type ≤ 60 (zod only) | Sensible bounds that direct PostgREST calls can't bypass on `notes`; `note_types` stays constraint-free because a constraint there could break signup. | Plan (plan-review F3) |

## Scope

**In scope:**
- `create_note` migration + grants
- `getActiveCampaign`, notes service, zod schema, DTOs in `src/types.ts`
- `POST /api/notes`
- Dashboard list, `/notes/new` (form island + `useCreateNote`), `/notes/[id]`
- `/notes` added to protected routes
- Vitest setup, unit + integration tests, CI wiring
- Updates to contract-surfaces, README and CLAUDE.md

**Out of scope:**
- Relation detection and the memory map (S-02)
- Edit/delete (S-04)
- Multiple campaigns (S-03)
- Images (S-05)
- Renaming/deleting custom types
- Search, pagination, markdown
- Generated Supabase types
- Changes to `smoke.mjs`

## Architecture / Approach

```
CreateNoteForm (React island) ──fetch JSON──▶ POST /api/notes
    zod (.strict, no campaign_id) → getActiveCampaign(supabase) → createNote()
        → rpc create_note(campaign, name, content, type_id | new_type_name)
            [one txn: resolve/insert note_type ON CONFLICT DO NOTHING → insert note; RLS applies]
    ← 201 {id} | 409 {field:"name"} | 400 {field} | 401 | 500
Dashboard / /notes/[id]: server-rendered Astro pages → services (listNotes / getNote)
```

Services take a `SupabaseClient` parameter and never import `astro:env`, which lets Vitest exercise them in plain Node against local Supabase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB function + test foundation | Vitest, `create_note` migration, function-level integration tests, CI wiring | `ON CONFLICT` expression inference and RLS interplay; test users depend on local confirmations being off |
| 2. Services + API | zod, services, DTOs, `POST /api/notes`, unit + service tests | Correct SQLSTATE → HTTP mapping; strict-ESLint typing of untyped supabase-js results |
| 3. UI + docs | Dashboard list, create form, detail page, route protection, contract-surfaces (incl. S-03 handoff) | Form state kept on error; plain-text rendering safety |

**Prerequisites:** F-01 done (it is). Docker + `npx supabase start` for local verification. Production needs a manual, approved `npx supabase db push` of the new migration before or together with the deploy.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **Assumed until S-03:** every user has exactly one campaign, and "oldest campaign" is the active one. S-03 must revisit `getActiveCampaign` and the `POST /api/notes` contract. If a campaign id ever comes from the client, ownership must be re-checked on the server.
- A production deploy without the migration pushed would return 500 on note creation (CI doesn't run migrations).
- Integration tests assume local email confirmations stay disabled (`supabase/config.toml`), the same assumption `smoke.mjs` already makes.

## Success Criteria (Summary)

- A new user can create NPC/Place/Quest/Observation or custom-type notes and see them listed and on their own page.
- Duplicate names are rejected with a clear inline error without losing the typed content, and a failed create never leaves a stray custom type.
- No user can create or read notes in another user's campaign, and this is proven by integration tests in CI.
