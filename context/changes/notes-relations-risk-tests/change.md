---
change_id: notes-relations-risk-tests
title: Risk-first tests for notes CRUD, relations and data isolation
status: implemented
created: 2026-10-11
updated: 2026-10-12
archived_at: null
---

## Notes

Roadmap slice S-02 (`context/foundation/roadmap.md`), prerequisite F-01 (done). PRD refs: FR-008, FR-011, FR-012, FR-013.

Outcome: developer can rely on an explicit list of named risk scenarios for notes & campaigns CRUD, automatic relation management (including pinned relation-change notice wording), memory-map navigation and per-user/per-campaign data isolation — each with at least one test running in CI.

- Unknown (owner `/10x-plan`): which scenarios need e2e versus the existing integration suite — extend, don't duplicate.
- Risk: relation-notice wording must be pinned by tests before S-04 (constants-sweep) moves the text; the gap is in isolation and end-to-end coverage, since relation unit/integration tests already exist.
