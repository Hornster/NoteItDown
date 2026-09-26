---
change_id: auto-relations-memory-map
title: User can see notes auto-connected on a memory map and navigate between them
status: implemented
created: 2026-09-26
updated: 2026-09-26
archived_at: null
---

## Notes

Roadmap slice S-02 (`context/foundation/roadmap.md`) — the milestone's north star. Outcome: the app automatically detects relations between notes in the same campaign via exact-name matching and renders them as connections on a memory map; the user can click a connection to navigate directly to the connected note. PRD refs: FR-007, FR-009, FR-010, FR-011, US-01. Prerequisite: S-01 (`create-notes`, archived). FR-011 constraint: the map UI must never expose a way to hand-create or edit a relation.

## Research

- [Memory map libraries](research-memory-map-libraries.md) — options compatible with the stack; recommends React Flow + d3-force (fallback: react-force-graph-2d).
- [React Flow docs (Context7)](research-react-flow-docs.md) — confirmed API for setup, click navigation, read-only lock-down (FR-011) and dagre/d3-force layout; open questions for `/10x-plan`.
- [Codebase compatibility review](research.md) — React Flow docs vs. current codebase: compatible with 6 corrections; FR-007 detection is an open gap.
