# Auto-Detected Relations & Memory Map Implementation Plan

## Overview

Roadmap slice S-02 (FR-007, FR-009, FR-010, FR-011, US-01): the app detects relations between notes in the same campaign by exact-name matching, and renders all notes and their relations on a memory map. Clicking a note on the map opens it. Detection runs in Postgres, fired by a trigger on `notes`. The map is a React Flow island on a new protected `/map` page, laid out with a deterministic one-shot d3-force layout.

## Current State Analysis

- The `relations` table exists but nothing writes to it. It is undirected, with canonical `note_a_id < note_b_id` order, composite same-campaign FKs, cascade delete, SELECT/INSERT/DELETE RLS policies and **no UPDATE policy** (`supabase/migrations/20260922120000_campaign_notes_schema.sql:104-141`).
- There are three write paths into `notes`:
  - the `create_note` RPC (`supabase/migrations/20260924120000_create_note_function.sql:8-51`);
  - a direct `insert`, allowed by `notes_insert_own_campaign`;
  - a direct `update` of `name`, `content` and `type_id` (`20260923120000_restrict_update_columns.sql`).

  All three are reachable because the anon key is public.
- Note names are unique case-insensitively per campaign (`notes_campaign_name_key` on `lower(name)`), at most 120 chars; content is at most 20,000 chars.
- `listNotes` already returns `{id, name, created_at, type_name}` per note (`src/lib/services/notes.ts:48-69`). `getActiveCampaign` is the single campaign resolver (`src/lib/services/campaigns.ts`).
- `/notes/[id]` is the navigation target. It validates the UUID and returns a 404 for a foreign or missing note (`src/pages/notes/[id].astro:10-21`).
- `PROTECTED_ROUTES = ["/dashboard", "/notes"]` uses a prefix match (`src/middleware.ts:4,18`).
- The project has no graph libraries. React 19.2 is compatible with `@xyflow/react@12` (research.md).
- The integration suite runs RPCs against local Supabase through `createTestUser()`. Its budget is 30 signups per 5 min, shared with smoke, so create one user per tenant per file (`tests/integration/helpers.ts`).

## Desired End State

- Creating or editing a note by any path (RPC, direct insert, direct update of name or content) atomically recomputes that note's relations inside the same transaction.
- Two notes A and B in one campaign are related iff A's name occurs in B's content, or B's name occurs in A's content, under the agreed matching rule. The rule is case-insensitive and needs a non-word character (or the start or end of the text) on both sides of the name.
- The migration backfills relations for notes created before S-02.
- `/map` is protected. It shows every note of the active campaign as a node (name plus type badge), with a straight line with no arrow for each relation, on a dark theme.
- Clicking a node opens `/notes/<id>`. Nodes can be dragged; positions are not saved and reset on reload. The map offers no way to create, delete, reconnect or edit an edge.
- Verify with `npm test` (unit plus integration), `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`, and the manual checks below.

### Key Discoveries:

- Postgres `\m…\M` fails for names ending in punctuation, and JS `\b` is ASCII-only. Use explicit `(^|[^[:alnum:]_])` / `($|[^[:alnum:]_])` guards plus metacharacter escaping. This was tested on local PG 17.6 with ctype `en_US.UTF-8` (research.md "Matching mechanics").
- Postgres will not parallelize this detection work, and the cost is about 2N regex checks per note write. That is acceptable at the PRD's small data volume (research.md Follow-ups 2-3).
- React Flow with Tailwind 4 must import its CSS in `global.css`, after `tw-animate-css`, inside `@layer base` (Context7, reactflow.dev/components). This repo's `global.css:1-2` already has the matching imports.
- React Compiler lint rules (`set-state-in-effect`, `immutability`, `purity`, …) are errors (`eslint.config.js:44`). The d3-force rAF/effect pattern from the React Flow docs would trip them, so the layout is a pure function called once.
- `forceLink` throws when an edge references an id that isn't among the nodes. The layout must drop such relations defensively.
- Hidden React Flow handles must use `opacity: 0`, not `display: none`, or edges stop rendering (research.md Correction 3).
- Astro frontmatter must not `return` early, because it crashes ESLint. Use conditional rendering (`src/pages/notes/[id].astro:7-9`).

## What We're NOT Doing

- **No S-04 change-set API.** The trigger returns nothing to the caller. The FR-008 "relations added/removed" notice, and the RPC that snapshots before/after, belong to S-04.
- **No edit or delete UI for notes** (S-04). The trigger already re-detects on `UPDATE OF name, content`, so S-04 inherits that.
- **No manual relation creation, deletion or dismissal**, and no aliases (FR-011, PRD Non-Goals).
- **No fuzzy or NLP matching.** No stemming, plurals or partial names: "Bob" matches "Bob's" (`'` is a non-word character) but never "Bobby".
- **No persisted node positions** and no live physics animation.
- **No edge-click behaviour**, no related-notes list on `/notes/[id]`, and no neighbourhood map.
- **No MiniMap**, and no light theme (`colorMode="dark"` to match the always-dark app).
- **No keyboard navigation of the graph beyond React Flow defaults.** The dashboard list stays the keyboard-accessible path to every note.
- **No match positions or highlighting** stored in the DB.
- **No handling of the concurrent-create race** (two notes committed at the same instant each miss the other's uncommitted row). This is accepted as a risk for a single-user tool; `recompute_campaign_relations` is the repair path.

## Implementation Approach

Detection comes first and stands alone in the DB. It is verifiable through the integration suite before any UI exists. Next, a small enabler phase adds the read service, the DTO and the pure layout function, all unit- or integration-tested. Finally, the UI phase wires the island and page onto those tested pieces. All matching logic lives in one SQL function (`note_mentions`), so S-04 reuses the exact same engine and no TS copy can drift from it.

## Critical Implementation Details

- **Function EXECUTE grants cascade.** `security invoker` functions called from the trigger run as the calling `authenticated` user, and Postgres checks EXECUTE on every nested function. So `note_mentions` and `detect_note_relations` must be granted to `authenticated`, not only revoked from `anon`. Otherwise every note insert fails.
- **Hosted locale behaviour.** How `[:alnum:]` and `~*` classify non-ASCII letters (Ł, é) depends on the database's default locale provider: ICU/builtin or libc `datctype`. Local uses ICU (`datlocprovider = 'i'`, `en_US.UTF-8`), so `datctype` alone is not a reliable proxy. Before the production push (Phase 1 manual step), probe the behaviour on the hosted DB: `select 'Ł' ~ '[[:alnum:]]' as alnum_ok, 'ŁÓDŹ' ~* 'łódź' as icase_ok;`. If either is false, add an explicit `collate "und-x-icu"` to the content operand in `note_mentions` before pushing, and re-run the Łódź test. ASCII behaviour is unaffected either way.

## Phase 1: Relation detection in the database

### Overview

A new migration adds the matcher, per-note detection, per-campaign recompute and the trigger, then backfills existing campaigns. Integration tests pin down every matching rule and write path.

### Changes Required:

#### 1. Detection migration

**File**: `supabase/migrations/20260926120000_relation_detection.sql`

**Intent**: Make relations the automatic, atomic output of every note write, per FR-007 and FR-011. Keep the matching rule in a single function so S-04 reuses it.

**Contract**:

- `public.note_mentions(p_content text, p_name text) returns boolean`. It is `language sql immutable strict`, with `set search_path = ''`. It returns true when `p_name` occurs in `p_content` case-insensitively, with a non-word character (anything but `[[:alnum:]_]`) or the start or end of the text on each side. Regex metacharacters in `p_name` are escaped, so it matches literally. Snippet (the escaping is the non-obvious part; the tests are authoritative):
  ```sql
  select p_content ~* (
    '(^|[^[:alnum:]_])'
    || regexp_replace(p_name, '([\\.^$*+?()\[\]{}|])', '\\\1', 'g')
    || '($|[^[:alnum:]_])'
  );
  ```
- `public.detect_note_relations(p_note_id uuid) returns void`. It is `plpgsql`, `security invoker`, with `set search_path = ''`. It loads the note (and returns quietly if RLS hides it or it's missing). It then computes the full desired pair set in a CTE: every other note `o` in the same campaign with `o.id <> note.id` where `note_mentions(o.content, note.name) or note_mentions(note.content, o.name)`, stored as `(least(ids), greatest(ids))`. It deletes this note's existing relations that aren't in the set, and inserts the missing ones with `on conflict (note_a_id, note_b_id) do nothing`.
- `public.recompute_campaign_relations(p_campaign_id uuid) returns void`. It is `plpgsql`, `security invoker`, with `set search_path = ''`. Afterwards the campaign's `relations` rows equal exactly the matched set for all its notes. It is idempotent and serves both as the backfill and as the repair path.
- `public.notes_detect_relations() returns trigger`. It is `plpgsql`, `security invoker`, with `set search_path = ''`. It calls `detect_note_relations(new.id)`, and skips on `UPDATE` when both `name` and `content` are unchanged. Returns `null`.
- The trigger is `notes_detect_relations`: `after insert or update of name, content on public.notes for each row`.
- Grants: `revoke execute … from public, anon` and `grant execute … to authenticated` on `note_mentions`, `detect_note_relations` and `recompute_campaign_relations`. Revoke only (no grant) on the trigger function.
- Backfill at the end of the migration: `select public.recompute_campaign_relations(id) from public.campaigns;`.

#### 2. Integration tests

**File**: `tests/integration/relation-detection.test.ts`

**Intent**: Pin down the matching rule and every write path against the real DB.

**Contract**: One `createTestUser()` per tenant (A and B) in `beforeAll`. Notes are created via `rpc("create_note", { …, p_new_type_name: "NPC" })` unless the test is about another path. Use distinct names per test so notes don't cross-match. Cases:

- A table of `rpc("note_mentions")` cases:
  - `"the Inn." / "Inn"` → true;
  - `"Winnie" / "Inn"` → false;
  - `"w Łódź." / "Łódź"` → true;
  - `"Mr. (Bob) came" / "Mr. (Bob)"` → true;
  - `"xMr. (Bob)y" / "Mr. (Bob)"` → false;
  - `"abc" / "a.c"` → false;
  - `"INN" / "inn"` → true;
  - `"Bobby" / "Bob"` → false;
  - `"Bob's" / "Bob"` → true.
- The new note's content mentions an existing note: one relation, `note_a_id < note_b_id`, correct `campaign_id`.
- An existing note's content mentions the new note's name: a relation is created (the reverse direction).
- Both notes mention each other: exactly one relation.
- A note whose own content contains its own name: no self-relation.
- A direct `from("notes").insert(...)` also creates relations.
- A direct `update` of content that removes the mention deletes the relation. An update that adds a mention creates one. A rename re-detects.
- Tenant B's note naming tenant A's note creates no relation in either tenant.
- Deleting a note removes its relations (cascade).
- `rpc("recompute_campaign_relations")` restores a relation row deleted directly, and is idempotent (two calls give the same set).

#### 3. Contract surfaces

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the new load-bearing DB names and the matching semantics S-04 depends on.

**Contract**: Add a "Relation detection" section:

- the four functions, with signatures, security mode and grants;
- the trigger name and the columns it fires on;
- the matching rule (case-insensitive, non-word guards, literal escaping, both directions, no self-relation);
- the ctype dependency;
- that the concurrent-create race is accepted.

Also update the `relations` section to say rows are written **only** by `detect_note_relations` and `recompute_campaign_relations`. Add `public.notes_detect_relations()` (security invoker, `after insert or update of name, content` on `public.notes` via `notes_detect_relations`) to "Trigger functions". Add the new migration to "Migration file".

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- Relation detection integration tests pass: `npm run test:integration`
- Existing integration tests still pass (create_note, notes service) under the new trigger: `npm run test:integration`
- Lint passes: `npm run lint`

#### Manual Verification:

- Hosted DB locale behaviour checked with `select 'Ł' ~ '[[:alnum:]]' as alnum_ok, 'ŁÓDŹ' ~* 'łódź' as icase_ok;`, and the result recorded in the PR (both true means no change; either false means apply the ICU-collation fallback from Critical Implementation Details). Progress row 1.5 keeps its original "ctype" title, but this probe is the check.
- In local Supabase Studio, creating two notes where one mentions the other shows exactly one `relations` row with sorted ids

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Map data and layout (enabler for Phase 3's `/map`)

### Overview

This phase adds the read side and the pure layout function that the map island will consume. Nothing is visible to users yet; it exists only to unlock Phase 3.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add the force-layout engine and its types for the strict TS config.

**Contract**: `d3-force` (dependency) and `@types/d3-force` (devDependency), installed via npm.

#### 2. Map DTO

**File**: `src/types.ts`

**Intent**: A domain-level payload for the map that is free of React Flow types (research.md Correction 5).

**Contract**: `MemoryMapRelation = Pick<Relation, "id" | "note_a_id" | "note_b_id">` and `MemoryMapData { notes: NoteListItem[]; relations: MemoryMapRelation[] }`, placed in the DTO block with a one-line doc comment.

#### 3. Relations read service

**File**: `src/lib/services/relations.ts`

**Intent**: Load a campaign's relations for the map, following the `listNotes` conventions (untyped client, explicit row type, throw on error).

**Contract**: `listRelations(supabase: SupabaseClient, campaignId: string): Promise<MemoryMapRelation[]>` selects `id, note_a_id, note_b_id` filtered by `campaign_id`. On error it throws `listRelations: query failed: <message>`.

#### 4. Layout function

**File**: `src/lib/memory-map-layout.ts`

**Intent**: A deterministic, pure one-shot force layout. It is lint-safe, runs once at mount and needs no `ReactFlowProvider`.

**Contract**:

- Exports `MAP_NODE_WIDTH` and `MAP_NODE_HEIGHT`, the fixed node box shared with the node component.
- Exports `layoutMemoryMap(noteIds: readonly string[], relations: readonly { note_a_id: string; note_b_id: string }[]): Map<string, { x: number; y: number }>`, returning **top-left** positions (centre minus half the box).
- It builds plain-object copies and drops relations whose endpoints aren't both in `noteIds`. It runs `forceSimulation(...).stop()` with `forceManyBody`, `forceLink(...).id(d => d.id)`, a `forceCollide` sized from the node box, and weak `forceX`/`forceY` towards 0, then applies a fixed number of `tick()` calls.
- It never mutates its inputs. d3-force's default fixed-seed random source plus the input order make the output deterministic.

#### 5. Tests

**Files**: `src/lib/memory-map-layout.test.ts` (unit), `tests/integration/relation-detection.test.ts` (extend)

**Intent**: Lock in layout determinism and robustness, and the service's RLS scoping.

**Contract**:

- Unit tests for the layout:
  - empty input → empty map;
  - every id gets finite `x`/`y`;
  - the same input twice gives equal output;
  - inputs are not mutated;
  - a relation referencing an unknown id doesn't throw;
  - isolated notes (no relations) still get positions.
- Integration test for `listRelations`: it returns tenant A's relation for A's campaign, and an empty list when tenant A queries tenant B's campaign id.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass: `npm run test:integration`
- Lint passes (strict + React Compiler rules): `npm run lint`
- Types check: `npx astro check`

**Implementation Note**: No manual verification; proceed to Phase 3 once automated checks pass.

---

## Phase 3: Memory map UI

### Overview

Render the map on `/map` with React Flow, wire node-click navigation, lock down every relation-editing affordance, and link the page from the dashboard and Topbar.

### Changes Required:

#### 1. React Flow dependency and CSS

**Files**: `package.json`, `src/styles/global.css`

**Intent**: Install React Flow and load its base styles where Tailwind utilities can override them.

**Contract**: Add the `@xyflow/react` dependency. In `global.css`, right after `@import "tw-animate-css";`, add `@layer base { @import "@xyflow/react/dist/style.css"; }`. The CSS is never imported from a component.

#### 2. Map island

**Files**: `src/components/memory-map/MemoryMap.tsx`, `src/components/memory-map/NoteNode.tsx`, `src/components/memory-map/StraightEdge.tsx`

**Intent**: A read-only graph of the campaign. Nodes are draggable but not saved; clicking a node navigates to it; nothing can edit a relation (FR-011).

**Contract**:

- `MemoryMap` props are `MemoryMapData`. It maps notes to `Node<{ name: string; typeName: string }, "note">` with positions from `layoutMemoryMap` (computed once, from the initial props), and relations to `Edge` with `type: "straight"`, no `markerEnd`, source `note_a_id` and target `note_b_id`. `nodeTypes`/`edgeTypes` are defined at module scope.
- `ReactFlow` props:
  - nodes via `useNodesState` + `onNodesChange` (for dragging only), with static `edges` and no `onEdgesChange`;
  - `nodesConnectable={false}`, `elementsSelectable={false}`, `deleteKeyCode={null}`, `edgesFocusable={false}`, `edgesReconnectable={false}` (it defaults to true even with no `onReconnect`);
  - no `onConnect`, `onReconnect`, `onDelete`, `onNodesDelete` or `onEdgesDelete`;
  - `colorMode="dark"`, `fitView`;
  - `onNodeClick` → `window.location.assign(\`/notes/${node.id}\`)`;
  - children `<Background />` and `<Controls showInteractive={false} />`.
- `NoteNode` is a fixed `MAP_NODE_WIDTH` × `MAP_NODE_HEIGHT` box with a truncated name and a type badge, styled like the dashboard's list items (use `cn()`), `cursor-pointer`. It has one hidden source `Handle` and one hidden target `Handle` (`opacity: 0`, `isConnectable={false}`).
- `StraightEdge` is a custom edge that draws a straight line between the two nodes' centres (React Flow "simple floating edges" approach: `useInternalNode` for both endpoints, then `getStraightPath` and `BaseEdge`). This means the handle placement doesn't route the edges.

#### 3. `/map` page

**File**: `src/pages/map.astro`

**Intent**: The protected page that loads the active campaign's notes and relations and mounts the island.

**Contract**:

- Loads data like `dashboard.astro`: `getActiveCampaign`, then `listNotes` + `listRelations`.
- Layout: `bg-cosmic` + `Topbar`, in a wider container than the dashboard card (for example `max-w-6xl`). The heading is the campaign name plus "Memory map", with a one-line hint: "Click a note to open it. Connections are detected automatically when a note's text mentions another note's exact name."
- When there are no notes, it shows an empty state with a "Create your first note" CTA (`/notes/new`) and doesn't mount the island. When there are notes but no relations, it mounts the island and adds a hint explaining how connections appear.
- The island sits in a wrapper with an explicit height (for example `h-[70vh]`), rendered as `<MemoryMap client:only="react" … />` with a `slot="fallback"` loading placeholder of the same height.
- With no campaign, it shows the same "No campaign found" text as the dashboard. No top-level `return` in the frontmatter.

#### 4. Route protection and links

**Files**: `src/middleware.ts`, `src/pages/dashboard.astro`, `src/components/Topbar.astro`

**Intent**: Protect `/map` and make it reachable.

**Contract**:

- Add `"/map"` to `PROTECTED_ROUTES`.
- Dashboard header: add a "Memory map" link next to "New note", as a secondary style.
- Topbar (signed-in branch): add a "Map" link next to "Dashboard".

#### 5. Smoke checks

**File**: `scripts/smoke.mjs`

**Intent**: Catch regressions in the new route's auth gating after dependency upgrades.

**Contract**: Add two rows mirroring the dashboard ones: `/map` returns 302 to `/auth/signin` for an anonymous user, and 200 for a signed-in user.

#### 6. Docs

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the new route and read service.

**Contract**:

- Add `/map` to "Routes": notes plus relations for the active campaign, read-only, with node-click navigating to `/notes/[id]`.
- Add `/map` to "Active campaign resolution → Callers".
- Add `listRelations` next to the note services.
- Add `MemoryMapData` / `MemoryMapRelation` to "Shared TypeScript types".

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Production build succeeds: `npm run build`
- All tests pass: `npm test`
- Smoke passes against a local preview, including the new `/map` rows: `npm run smoke`

#### Manual Verification:

- On `/map` with notes whose text mentions other notes' names, connected notes show straight lines with no arrows, and isolated notes appear too
- Clicking a node opens that note's page; dragging a node moves it without navigating
- There is no way on the map to create, delete, reconnect or select an edge (dragging from a node's edge area, Backspace and Delete do nothing to edges)
- The map renders dark on a light-mode OS, and the empty state appears for an account with no notes
- After creating a new note that mentions an existing one, `/map` shows the new connection on reload
- The migration was pushed to production (`npx supabase db push`) before or with the deploy, and the backfilled relations of existing notes show on the production `/map`

**Implementation Note**: After automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `layoutMemoryMap`: determinism, finiteness, purity, unknown-id tolerance, isolated nodes, empty input.

### Integration Tests:

- The `note_mentions` rule table: case, word boundaries, non-ASCII, trailing punctuation, metacharacter escaping.
- The trigger through the RPC, direct insert and direct update (content change, rename).
- Relation shape (sorted ids, correct campaign, one row per pair, no self-relation).
- Tenant isolation, cascade on delete, and recompute idempotence and repair.
- `listRelations` RLS scoping.

### Manual Testing Steps:

1. Create "Inn" and "Winnie": no connection. Create "Tavern notes" with content "We slept at the inn.": it connects to "Inn".
2. Create a note "Łódź" and one mentioning "w Łódź.": they connect.
3. Open `/map`, drag nodes, click one, and confirm navigation. Press Backspace/Delete and confirm nothing disappears.
4. Sign out and visit `/map`: you are redirected to sign-in.

## Performance Considerations

Each note write runs about 2N regex checks over content of at most 20k chars, sequentially in one backend. That is a few ms at 50 notes and about 30 ms at 500 (research.md Follow-ups 2-3), which is acceptable for `data_volume: small`. The map read is an indexed select (`relations_campaign_id_idx`). The layout's cost is O(ticks × (N + E)) in the browser, once per page load.

## Migration Notes

- The migration backfills via `recompute_campaign_relations` for every campaign. Re-running the function is safe (it is idempotent).
- Production: apply with `npx supabase db push` (CI does not run migrations), after the hosted ctype check.
- Rollback: drop the trigger and the four functions, then `delete from public.relations;`. No note data is touched.

## References

- Research: `context/changes/auto-relations-memory-map/research.md` (codebase compatibility, detection options A–D, matching tests, parallelism follow-ups)
- `context/changes/auto-relations-memory-map/research-react-flow-docs.md`, `research-memory-map-libraries.md`
- PRD: `context/foundation/prd.md` FR-007, FR-009–FR-011 and NFR (perceptible delay)
- Roadmap: `context/foundation/roadmap.md` S-02
- Patterns: `src/lib/services/notes.ts:48-69` (service), `src/pages/dashboard.astro:9-11` (page loading), `tests/integration/create-note-function.test.ts` (RPC tests), `supabase/migrations/20260924120000_create_note_function.sql` (function style and grants)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Relation detection in the database

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- [x] 1.2 Relation detection integration tests pass: `npm run test:integration`
- [x] 1.3 Existing integration tests still pass (create_note, notes service) under the new trigger: `npm run test:integration`
- [x] 1.4 Lint passes: `npm run lint`

#### Manual

- [x] 1.5 Hosted DB ctype checked and result recorded
- [x] 1.6 Local Studio shows exactly one sorted relations row for two mutually-referenced notes

### Phase 2: Map data and layout (enabler for Phase 3's `/map`)

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:unit`
- [ ] 2.2 Integration tests pass: `npm run test:integration`
- [ ] 2.3 Lint passes (strict + React Compiler rules): `npm run lint`
- [ ] 2.4 Types check: `npx astro check`

### Phase 3: Memory map UI

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Types check: `npx astro check`
- [ ] 3.3 Production build succeeds: `npm run build`
- [ ] 3.4 All tests pass: `npm test`
- [ ] 3.5 Smoke passes against a local preview, including the new `/map` rows: `npm run smoke`

#### Manual

- [ ] 3.6 Connected notes show undirected lines; isolated notes appear
- [ ] 3.7 Node click navigates; dragging does not navigate
- [ ] 3.8 No way to create, delete, reconnect or select an edge on the map
- [ ] 3.9 Map renders dark on a light-mode OS; empty state shown with no notes
- [ ] 3.10 New note mentioning an existing one shows its connection on reload
- [ ] 3.11 Migration pushed to production; backfilled relations visible on production `/map`
