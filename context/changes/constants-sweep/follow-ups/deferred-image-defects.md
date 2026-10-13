# Deferred image-path defects

Two 500s found in `notes-relations-risk-tests` Phase 2 (test-plan §6.6, "Phase 2 - Access control & isolation") were not fixed in `constants-sweep` (S-04). Neither leaks data; both return 500 where a 4xx or a success is expected.

## 1. Uppercase UUID in `campaignId` / `noteId` on image upload and commit returns 500

- `isUuid` is case-insensitive, `isOwnImagePath` embeds the URL ids verbatim, and the DB path-shape check is lowercase, so the uppercase id passes validation and fails at the database.
- Reference: `context/foundation/test-plan.md` §6.6, Phase 2 notes, first deferred defect.
- Likely fix direction: normalise ids to lowercase before building paths, or reject uppercase at the route.

## 2. Replayed image commit returns 500 when a free slot exists

- The unique `path` constraint raises 23505, which falls into the "unexpected" branch instead of a typed result. `note-images.test.ts` asserts only that the replay fails and the objects survive.
- Reference: `context/foundation/test-plan.md` §6.6, Phase 2 notes, second deferred defect.
- Likely fix direction: map `PG_ERROR.UNIQUE_VIOLATION` on `note_images.path` (via `DB_CONSTRAINT`) to a conflict result and tighten the test to assert it.
