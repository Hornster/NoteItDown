---
change_id: constants-sweep
title: Apply the constants rule across src/ (status codes, Postgres codes, messages)
status: impl_reviewed
created: 2026-10-13
updated: 2026-10-13
archived_at: null
---

## Notes

Roadmap slice S-04 (`context/foundation/roadmap.md`). Prerequisites S-01 and S-02 are done.

Outcome: developer finds no hardcoded HTTP status codes, Postgres error codes or duplicated user-facing messages left in `src/` (comments and `.md` excluded), with identical runtime behavior and the rule recorded in `lessons.md`.

- PRD refs: FR-009, FR-010, FR-011, FR-012
- Open unknown (owner `/10x-plan`): which repeated strings in `.astro` / `.tsx` count as "duplicated user-facing messages" versus one-off copy?
- Inherited from S-01: four logged auth defects (`test-plan.md` §6.6: malformed-body 500, prefix over-match, raw Supabase message / enumeration, literal 401s), and `UI_BASELINE.signupDuplicateEmail` in `tests/e2e/auth-session.spec.ts` must change on purpose.
- Risk: touches auth routes and the relation-notice text (pinned by S-01/S-02 tests); land before S-05 so refactor and theming diffs don't mix.
