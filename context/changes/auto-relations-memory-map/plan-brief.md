# Auto-Detected Relations & Memory Map — Plan Brief

> Full plan: `context/changes/auto-relations-memory-map/plan.md`
> Research: `context/changes/auto-relations-memory-map/research.md`

## What & Why

This is roadmap slice S-02, the milestone's north star. It makes the app detect relations between notes automatically, when one note's text mentions another note's exact name, and show them on a memory map the user can navigate. It is the smallest end-to-end flow that tests the core hypothesis: that exact-name matching alone keeps a campaign's web of notes navigable.

## Starting Point

S-01 ships note creation (the `create_note` RPC, `/dashboard`, `/notes/[id]`). The `relations` table exists already: undirected, sorted pair, RLS, no UPDATE policy. Nothing writes to it yet, and there's no map.

## Desired End State

Any note write, whether through the RPC, a direct insert or a direct update, recomputes that note's relations atomically in Postgres, and existing notes are backfilled. A protected `/map` page shows every note of the active campaign as a node, with a line with no arrow for each relation. Clicking a node opens the note. Nodes can be dragged (positions aren't saved), and the map offers no way to edit a relation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where detection runs | Postgres (Option A) | Atomic with the note write and covers every write path, so FR-011 holds everywhere. | Research |
| Match rule | Case-insensitive, non-word guards on both sides, regex-escaped name, both directions | Matches case-insensitive name uniqueness and kills the PRD's "Inn in Winnie" false positive. | Plan |
| Wiring | `AFTER INSERT OR UPDATE OF name, content` trigger plus a backfill in the migration | Direct inserts and updates can't bypass it; S-04 edits re-detect for free. | Plan |
| Map location | New protected `/map` page, linked from the dashboard and Topbar | The graph needs more room than the dashboard's `max-w-2xl` card. | Plan |
| Click behaviour | Node click navigates; edges are visual only | An undirected edge has no "other end" to open. | Plan |
| Layout | Pure one-shot d3-force function, fixed node size | Suits a non-tree web, is deterministic and avoids React Compiler lint errors. | Plan / Research |
| Interactivity | Nodes draggable but not saved; everything else locked | Lets users untangle crowded areas without touching relations. | Plan |
| React Flow setup | CSS in `global.css` `@layer base`, `colorMode="dark"`, no React Flow types in `src/types.ts` | These are research corrections, confirmed against the docs via Context7. | Research |

## Scope

**In scope:**

- the matcher, detection, recompute and trigger functions, plus the backfill;
- the `listRelations` service and the `MemoryMapData` DTO;
- the layout function;
- the `/map` page and island, route protection, links and smoke rows;
- tests and contract-surfaces updates.

**Out of scope:**

- the S-04 added/removed-relations notice and its RPC, and the note edit/delete UI;
- manual relations, aliases and fuzzy matching;
- saved positions, edge-click behaviour, a related-notes list and a MiniMap;
- a light theme;
- handling the concurrent-create race (accepted risk; recompute is the repair path).

## Architecture / Approach

`notes` write → trigger → `detect_note_relations(id)`, which uses the `note_mentions` matcher to compute the desired sorted pairs in a CTE, then deletes stale rows and inserts missing ones → `relations`. `/map` frontmatter → `getActiveCampaign` + `listNotes` + `listRelations` → `MemoryMap` island (`client:only`) → `layoutMemoryMap` once → React Flow, with a custom note node, a straight centre-to-centre edge, and `onNodeClick` → `/notes/<id>`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Relation detection in the DB | Migration (matcher, detect, recompute, trigger, backfill) plus integration tests | Regex escaping and word guards in plpgsql; missing EXECUTE grants break every note insert |
| 2. Map data and layout (enabler) | `listRelations`, `MemoryMapData`, the pure `layoutMemoryMap` and its tests | `forceLink` throws on unknown ids (handled by filtering) |
| 3. Memory map UI | `/map` page and React Flow island, lock-down, links, smoke rows, docs | React Compiler lint rules; hidden handles / custom edge rendering |

**Prerequisites:** S-01 archived (done); local Supabase (Docker) for integration tests; read access to the hosted DB to check its ctype before `db push`.
**Estimated effort:** about 3 sessions, one per phase.

## Open Risks & Assumptions

- How the hosted DB classifies non-ASCII letters is unverified. If `'Ł' ~ '[[:alnum:]]'` or `'ŁÓDŹ' ~* 'łódź'` is false there, non-ASCII word boundaries degrade. There is a documented fallback (`collate "und-x-icu"`) and a manual behaviour probe before the production push.
- Detection cost is about 2N sequential regex checks per note write. That is fine at the PRD's small scale but grows linearly.
- Two notes committed at the same instant can miss each other. This is accepted; `recompute_campaign_relations` repairs it.

## Success Criteria (Summary)

- Writing a note that mentions another note's exact name (under the agreed rule) creates a connection automatically, with no manual step.
- `/map` shows the campaign's notes and connections, and clicking a note opens it.
- Nothing on the map lets the user create, delete or edit a relation.
