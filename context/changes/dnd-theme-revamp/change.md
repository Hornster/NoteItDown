---
change_id: dnd-theme-revamp
title: D&D palette theme on every page with meaning-colored buttons
status: implemented
created: 2026-10-14
updated: 2026-10-15
archived_at: null
---

## Notes

Roadmap slice S-05 (`context/foundation/roadmap.md`), PRD refs FR-001, FR-002, FR-014, FR-015. Prerequisite S-04 (constants-sweep) is done.

Outcome: user sees the D&D palette on every page (dark background, parchment text, grey ornaments), with buttons colored by meaning — gold primary, red only for destructive actions with icon and label, a neutral Cancel that has default focus, green only for success — including the fixed alert-dialog and image-popup close button.

- Unknown (owner `/10x-plan`): does `context/foundation/materials/dnd-color-palette.md` define a value for every theme token in use, and do map node/edge colors meet WCAG AA on the dark background?
- Risk: largest blast radius; apply through shared palette tokens so a later mobile milestone changes layout only. Take before/after screenshots of header/footer and edit/new note layouts before editing.
