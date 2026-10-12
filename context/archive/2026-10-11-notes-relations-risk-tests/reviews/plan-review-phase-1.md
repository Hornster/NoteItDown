<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Notes, Relations & Isolation Risk Tests — Phase 1 (Integration — rate cap, policy matrix and extensions)

- **Plan**: context/changes/notes-relations-risk-tests/plan.md
- **Scope**: Phase 1 only
- **Mode**: Deep (claims verified inline against migrations and tests)
- **Date**: 2026-10-12
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

7/7 paths ✓ (config.toml, test-user.ts, 5 integration files), 7/7 symbols ✓ (`sign_in_sign_ups`, `getImageUrls`, `listNoteImages`, `toImageViews`, `getNote`, `PG_ERROR.INSUFFICIENT_PRIVILEGE`, column grants in `20260923120000_restrict_update_columns.sql`), line refs `campaigns-service:119`, `notes-service:144`, `note-images:167`, `note-edit-delete-functions:119/:142` ✓, brief↔plan ✓, Progress↔Phase 1 ✓ (1.1–1.5), contract surfaces (campaigns, note_types, notes, relations, note_images) reported accurately, read-only.

## Findings

### F1 — Shared matrix fixture is broken by destructive and self-healing rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 RLS policy matrix — `beforeAll` seeding + `it.each` tables
- **Detail**: One `beforeAll` seeds a campaign, two related notes and a type, and all rows run against them. (a) The owner `delete` on `campaigns` cascades every note, relation and image; (b) the owner `delete` on `notes` cascades the relation; (c) the owner `insert` on `relations` for the seeded pair hits `relations_unique_pair`, because detection already wrote it; (d) a hand-inserted relation is removed by re-detection on the next note write (contract-surfaces "self-heal"), so the owner `update` on `notes` row can silently undo the `relations` insert row. B rows that run after an owner delete get "zero rows" because the row is gone, not because of RLS. The plan doesn't say which rows own which fixtures.
- **Fix A ⭐ Recommended**: Split fixtures: shared read-only rows for select/B/owner-denied cells, and a per-row disposable fixture for every destructive or insert cell (a throwaway campaign to delete, a third note to delete, an unrelated note pair for relation insert/delete). Every "unchanged" re-read asserts the row still exists.
  - Strength: Order-independent; each cell proves exactly one thing; a B "zero rows" result can't come from a missing row.
  - Tradeoff: A few more owner RPC calls (no auth calls).
  - Confidence: HIGH — cascades and the unique pair come straight from `20260922120000_campaign_notes_schema.sql`.
  - Blind spot: None significant.
- **Fix B**: Keep one fixture but fix the order: B rows → owner-denied → owner select/update/insert → owner deletes last, campaign delete very last.
  - Strength: Fewest seeded rows.
  - Tradeoff: Order coupling; `it.only`/reordering silently changes what each row proves.
  - Confidence: MEDIUM — Vitest keeps declaration order, but this is easy to break.
  - Blind spot: The self-heal interaction (d) still needs a dedicated pair.
- **Decision**: FIXED (Fix A): per-row disposable fixtures; shared fixture never mutated; re-reads assert existence

### F2 — Research 3.3 "storage UPDATE stays denied" dropped without a note

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §2 — "Owner denied (3.3)" list
- **Detail**: research.md:102 lists storage UPDATE among the owner-denied operations. `storage.objects` has only insert/select/delete policies (`20261003120000_note_images.sql:93-112`), and no test tries an update or upsert (`note-images.test.ts` has none). The plan's 3.3 row lists only the column grants, `relations` and `note_types`. Phase 4 requires every research scenario in the register, so this cell would be missing or wrongly marked as covered.
- **Fix**: Add a 3.3 row: the owner's `upload(path, …, { upsert: true })` (or `update`) on an existing own object is denied and the object is unchanged. Or drop it explicitly with a reason that Phase 4 records.
- **Decision**: FIXED: storage upsert-over-own-object row added to 3.3

### F3 — 1.12 can pass vacuously without a real object and an owner control

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 — 1.12 (`note-images.test.ts`, new `it`)
- **Detail**: B's `listNoteImages` returns `[]`, and `getImageUrls` returns `not_found` for any unknown row. `toImageViews` gives `thumb_url: null` whenever signing fails, including for a row whose storage object was never uploaded, even for the owner. If the image is seeded as a bare `note_images` row (the `rowFor` pattern), B's "no signed URL" proves nothing.
- **Fix**: Seed through `prepareUpload` → upload → `commitImage` (like the test at `note-images.test.ts:340`), assert the same three calls as A return data or URLs (positive control), then assert B gets `[]`, `not_found` and `thumb_url: null` when passed A's `NoteImage` objects.
- **Decision**: FIXED: 1.12 seeds a real committed image with an owner positive control

### F4 — 5.1 "near the 20000-char limit" doesn't decide the boundary or the unit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 — 5.1
- **Detail**: "Near" is undefined. The DB `char_length` counts code points, while zod `.max` counts UTF-16 units, so emoji content at the limit behaves differently at the two layers. These tests call the RPC directly and bypass zod.
- **Fix**: Specify exactly 20000 ASCII characters (including leading/trailing whitespace and newlines) as the limit case, and keep Unicode/emoji in a separate short string.
- **Decision**: FIXED differently: limit case uses 20000 multibyte UTF-8 BMP chars (1 code point = 1 UTF-16 unit, both layers agree); emoji kept short. UTF-8 bytes as the unit isn't possible tests-only (DB counts code points, zod UTF-16 units)

### F5 — Local Supabase restart and reset steps not stated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 rate cap; Manual Verification 1.5
- **Detail**: Running GoTrue only picks up `sign_in_sign_ups = 50` after `npx supabase stop && npx supabase start`. Until then, local runs stay at 30, while criterion 1.4 (grep the file) passes. For the manual policy break, a policy's `using` clause can't be dropped in place: it has to be dropped and recreated (e.g. `using (true)`) and reverted with `npx supabase db reset` after deleting the scratch file.
- **Fix**: Add a one-line restart note to §1 and spell out the drop/recreate + `db reset` revert in 1.5.
- **Decision**: FIXED: restart note in §1; drop/recreate + db reset revert in manual 1.5

### F6 — Matrix contract uses the literal 42501 instead of PG_ERROR

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §2 — owner-denied and B insert rows
- **Detail**: lessons.md "Use the central error/status/message dictionaries" applies, and `note-images.test.ts` already asserts `PG_ERROR.INSUFFICIENT_PRIVILEGE`. "denied (RLS error)" also leaves the expected code implicit (RLS WITH CHECK fails with 42501 before FK checks).
- **Fix**: State `PG_ERROR.INSUFFICIENT_PRIVILEGE` for the column-grant and B-insert cells.
- **Decision**: FIXED: PG_ERROR.INSUFFICIENT_PRIVILEGE named in the matrix contract
