# Review fixes — dashboard-grouping-search

From `reviews/impl-review.md` (2026-10-16).

## F1 — Intermittent 500 on forged-id PATCH note (separate change, not S-06)

- **Where**: `tests/http/forged-id.test.ts:223` › "1.13 B's session on A's ids: APIs › A/A PATCH note is 404 JSON"; route `PATCH /api/campaigns/[campaignId]/notes/[noteId]`.
- **Seen**: 1 of 4 `npm run test:http` runs on 2026-10-16 returned 500 instead of 404; 3 re-runs were clean. S-06 changed no API or service code.
- **Next step**: open a new change (`/10x-new`) to reproduce it by looping the forged-id suite against the preview, capturing preview server logs, then deciding whether it's an app bug (handler/service error path), Supabase load, or test seeding order, and fixing the root cause.
