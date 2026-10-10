---
change_id: per-file-check-hook
title: Per-file hook that runs lint and related unit tests on a modified file
status: implemented
created: 2026-10-10
updated: 2026-10-10
archived_at: null
---

## Notes

Roadmap slice S-03 (`context/foundation/roadmap.md`), PRD ref FR-006.

- Outcome: developer gets lint and the related unit tests run automatically for a modified file, finishing within ~10 s; integration tests stay on push/CI.
- Prerequisites: none (standalone, Stream C).
- Open unknown (owner: user): which hook surface triggers it (editor/agent file-edit hook, git hook, or watcher) and how "related tests" are resolved for a file.
- Risk: the ~10 s budget is the failure mode — a slow hook gets disabled.
