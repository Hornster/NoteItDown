---
date: 2026-09-26T20:03:39+02:00
researcher: Claude (claude-opus-5-5) for Hornster
git_commit: 73d1efa
branch: main
repository: NoteItDown
topic: "Is research-react-flow-docs.md compatible with the codebase for implementing S-02?"
tags: [research, codebase, memory-map, react-flow, relations, s-02]
status: complete
last_updated: 2026-09-26
last_updated_by: Claude (claude-opus-5-5) for Hornster
last_updated_note: "Follow-up 3: search-then-write staging does not unlock parallelism; staging still useful for the S-04 diff"
---

# Research: Is `research-react-flow-docs.md` compatible with the codebase for S-02?

**Date**: 2026-09-26T20:03:39+02:00
**Researcher**: Claude (claude-opus-5-5) for Hornster
**Git Commit**: 73d1efa (working tree also has uncommitted `ToolkitTutorialSections.md` and this change folder)
**Branch**: main
**Repository**: NoteItDown

## Research Question

Review the codebase and decide whether `context/changes/auto-relations-memory-map/research-react-flow-docs.md` is compatible with it, for implementing roadmap slice S-02 (`context/foundation/roadmap.md:102-112`: FR-007, FR-009, FR-010, FR-011, US-01).

## Summary

**Verdict: compatible, with six corrections and one major gap.** React Flow v12 fits the stack. Nothing in the codebase blocks it. But the doc covers only the *map UI* half of S-02 (FR-009, FR-010, FR-011). It says nothing about FR-007 relation detection, and no detection code exists yet.

Settled (verified against the code, npm or Context7):

- `@xyflow/react@12.12.0` declares `react >=17` / `react-dom >=17` as peers. The repo has `react ^19.2.6` (`package.json`). No peer conflict.
- All four lock-down props the doc left "not confirmed" in §3 are real `ReactFlow` props:
  - `nodesConnectable` (boolean)
  - `elementsSelectable` (boolean)
  - `nodesDraggable` (boolean)
  - `deleteKeyCode` (`KeyCode | null`, default `'Backspace'`)

  This fetch did not show `edgesReconnectable`. It is harmless as long as no `onReconnect` is passed, as the doc already says.
- The data the map needs already exists under RLS:
  - `notes` and `relations` tables with `relations_select_own_campaign` (`supabase/migrations/20260922120000_campaign_notes_schema.sql:58-141`).
  - A note detail route to navigate to (`src/pages/notes/[id].astro:10-17`).

Corrections to the doc:

1. **CSS import location (§1).** For Tailwind 4, the React Flow docs say to import `@xyflow/react/dist/style.css` in the global CSS, after `tailwindcss`, inside `@layer base`. They say not to import it from the component. The doc's `import "@xyflow/react/dist/style.css"` in the component contradicts this. It belongs in `src/styles/global.css` (currently lines 1-4).
2. **`colorMode="system"` (§1) doesn't fit this app.** Every page uses the fixed dark `bg-cosmic` gradient (`src/styles/global.css:113-115`, `src/pages/dashboard.astro:15`). Nothing in `src/` sets the `.dark` class (grep for `class="dark` / `classList…dark` returned no hits). On a light-mode OS, `"system"` would render a light flow on a dark page. Use `colorMode="dark"`.
3. **Edges are undirected, so edge styling must not imply direction.**
   - `relations` stores `note_a_id < note_b_id` as a canonical UUID order only (`…campaign_notes_schema.sql:104,117`; `docs/reference/contract-surfaces.md` "Canonical ordering invariant").
   - Mapping `note_a_id→source` and `note_b_id→target` is arbitrary. Don't use `markerEnd` arrows.
   - With a force layout, the default top/bottom handles route edges badly. React Flow's "simple floating edges" example (custom edge that draws a straight line between nodes) fits better. Hidden handles must use `opacity: 0` / `visibility: hidden`, not `display: none`, or edges stop rendering (Context7, troubleshooting).
4. **The d3-force pattern in §4 likely conflicts with this repo's lint rules.**
   - `eslint.config.js:44` extends `eslint-plugin-react-hooks` `recommended-latest`. The installed plugin sets these React Compiler rules to `error`: `set-state-in-effect`, `immutability`, `refs`, `purity`, `globals`.
   - The docs' pattern calls `setNodes` in an effect or rAF loop gated on `useNodesInitialized`, and d3-force mutates node objects in place. That will probably fail `npm run lint`. This is an inference: nothing was linted here.
   - A pure one-shot layout avoids the problem. Run `forceSimulation(...).stop()` plus N × `tick()` over plain copies, using fixed or estimated node sizes, in a pure function, and pass the result as `nodes` with the `fitView` prop.
   - d3-force's default random source is a fixed-seed LCG (d3-force@3 README, `simulation.randomSource`), so the layout is deterministic.
   - That same pure function could even run on the server (inference; not tested in workerd).
   - This design also removes the need for `ReactFlowProvider` / `useNodesInitialized`.
5. **DTO placement (§5).**
   - `src/types.ts:1-7` holds snake_case DTOs mirroring the DB, with no library types.
   - Put a domain DTO in `src/types.ts`, for example `{ notes: {id, name, type_name}[], relations: {id, note_a_id, note_b_id}[] }`.
   - Do the mapping to React Flow `Node<…>` / `Edge` inside the island, so `src/types.ts` never imports `@xyflow/react`.
6. **Controlled-state wiring (§1, §3).**
   - The doc suggests `useNodesState` / `useEdgesState`. Those return `onNodesChange` / `onEdgesChange`. Once they're wired, Backspace deletes selected elements *locally*.
   - This never reaches the DB: the map has no write path, and relations have no UPDATE policy.
   - Still, a vanishing edge looks like a manual override (FR-011). Either skip the change handlers entirely (static `nodes`/`edges` props, `nodesDraggable={false}`), or keep them and set `deleteKeyCode={null}`.

**Gap: FR-007 detection is outside the doc and absent from the code.**

- `createNote` (`src/lib/services/notes.ts:101-128`) only calls the `create_note` RPC.
- `create_note` only inserts the note (`supabase/migrations/20260924120000_create_note_function.sql:8-51`).
- No code under `src/` or `supabase/migrations/` writes to `relations`. So S-02's plan must also design detection. See Open Questions.

## Detailed Findings

### Dependencies and runtime

- `npm view @xyflow/react`: version `12.12.0`. Peers are `react >=17`, `react-dom >=17`, `@types/react >=17`, `@types/react-dom >=17`. Dependencies are `zustand ^4.4.0`, `classcat`, `@xyflow/system 0.0.83`. The `zustand@4` peer is `react >=16.8`.
- `d3-force` is at `3.0.0` and `@dagrejs/dagre` at `3.1.1`. The doc names neither version. `@types/d3-force` is needed for the strict TS config (`tsconfig.json:2`).
- Island mounting: existing islands use `client:load` (`src/pages/notes/new.astro:33`, `src/pages/auth/signin.astro:14`, `src/pages/auth/signup.astro:14`). No `client:only` island exists yet. The doc's `client:only="react"` is valid Astro and adds no new infrastructure.
- No `ClientRouter` / `ViewTransitions` in `src/` (grep, no hits). So navigation from the island is a full page load: `window.location.assign('/notes/${id}')` or an `<a>`.

### Container sizing

- `src/layouts/Layout.astro:40-46` sets `html, body { height: 100% }`. The pages wrap content in `min-h-screen` plus `max-w-2xl` cards (`src/pages/dashboard.astro:15-16`). Neither gives the flow a fixed height.
- The map wrapper needs an explicit height, for example `h-[70vh]`. This matches the doc's §1 warning about a missing height.

### Read-only map (FR-011)

- The database already enforces FR-011's "no edit" part: `relations` has SELECT/INSERT/DELETE policies and **no UPDATE policy** (`…campaign_notes_schema.sql:127-141`).
- INSERT and DELETE are allowed for the owner, so detection can write. The UI must simply never call them.
- Confirmed props (Context7 `/websites/reactflow_dev`, API reference "Interaction Props" and "Keyboard Props"):
  - `nodesConnectable`, `elementsSelectable`, `nodesDraggable`, `nodesFocusable`, `edgesFocusable`, `connectOnClick`
  - `deleteKeyCode: KeyCode | null`
- If edge clicks are used for navigation, `elementsSelectable={false}` does not disable `onEdgeClick` or `onNodeClick`. Those are separate event props. (This is inference from the prop descriptions: "allows nodes and edges to be selected".)

### Navigation (FR-010)

- `node.id` = note UUID maps directly onto `/notes/[id]`. That route validates UUIDs and returns 404 for another tenant's note (`src/pages/notes/[id].astro:10-21`).
- The schema confirms the doc's edge-click ambiguity (§2): a relation has no semantic direction.
- The doc's option (b), "edge click relative to the focused note", only makes sense if the map also appears on `/notes/[id]` as a neighbourhood view. Today that page shows only the note (`src/pages/notes/[id].astro:33-47`).

### Page placement and auth

- `PROTECTED_ROUTES = ["/dashboard", "/notes"]` uses a `startsWith` match (`src/middleware.ts:4,18`).
- A `/map` page must be added to that list. A page under `/dashboard` or `/notes/…` is protected automatically.
- Inference from Astro's route-priority rules: a static `src/pages/notes/map.astro` would win over `[id].astro`.
- Data loading follows the existing pattern: `getActiveCampaign` + service call (`src/pages/dashboard.astro:9-11`). A new `listRelations(supabase, campaignId)` in `src/lib/services/` fits `src/lib/services/notes.ts` conventions: throw on error, untyped client, explicit row types.

### Relation detection (FR-007) — not in the doc

- There are two current write paths for notes:
  - `create_note` RPC (security invoker)
  - direct table insert, allowed by `notes_insert_own_campaign` (`…campaign_notes_schema.sql:85-89`)

  The migration comment says both are reachable because the anon key is public (`…create_note_function.sql:56-59`). Detection only in the TS service would miss the direct-insert path. Detection in the DB (inside `create_note` or a trigger) would cover both.
- Any insert must sort the pair (`note_a_id < note_b_id`) and must stay inside one campaign. Both rules are enforced by constraints (`…campaign_notes_schema.sql:113-118`).
- Note names are unique **case-insensitively** (`notes_campaign_name_key` on `lower(name)`, `…campaign_notes_schema.sql:74`). The PRD says "exact-name" (`context/foundation/prd.md:77`) but doesn't define case or word-boundary rules. The FR-007 Socrates note already names the "Inn"/"inn" false positive (`prd.md:78`).
- The NFR says the map should reflect a new note "within a short, perceptible delay" (`prd.md:91`). That favours synchronous detection at note creation over a background job. The tech stack has `has_background_jobs: false` (`context/foundation/tech-stack.md`).
- S-04 will reuse the same engine (`roadmap.md:135`). So detection should be one callable unit, not inlined in the page.
- Notes created before S-02 have no relations. The plan needs a backfill or a "recompute campaign" step.

## Code References

- `package.json` — `react ^19.2.6`, `react-dom ^19.2.6`, `zod ^4.6.5`; no graph libraries yet
- `eslint.config.js:17,44` — `strictTypeChecked` + react-hooks `recommended-latest` (React Compiler rules at `error`)
- `src/styles/global.css:1-4` — Tailwind 4 imports (where React Flow CSS should go); `:113-115` `bg-cosmic`
- `src/layouts/Layout.astro:40-46` — html/body height
- `src/middleware.ts:4,18` — `PROTECTED_ROUTES` prefix match
- `src/pages/dashboard.astro:9-11` — campaign + list loading pattern
- `src/pages/notes/[id].astro:10-21` — navigation target, UUID check, 404
- `src/lib/services/notes.ts:48-69,101-128` — service conventions; `createNote` has no detection
- `src/lib/services/campaigns.ts:14-28` — `getActiveCampaign`, the single campaign resolver
- `src/types.ts:35-41` — `Relation` entity already declared
- `supabase/migrations/20260922120000_campaign_notes_schema.sql:104-141` — `relations` table, canonical order, RLS (no UPDATE)
- `supabase/migrations/20260924120000_create_note_function.sql:8-51` — `create_note` inserts the note only
- `docs/reference/contract-surfaces.md` — `relations` canonical-ordering note that names S-02 explicitly

## Architecture Insights

- The DB is the enforcement point: campaign scoping by composite FKs, ownership by RLS, and "must stay in sync" limits in both zod and CHECK constraints. Detection placed in the DB would follow this precedent.
- Pages are thin Astro frontmatter with services in `src/lib/services/`. React islands receive plain props, and there's no client-side data fetching for reads. A map island that takes `{notes, relations}` props matches this.
- Astro frontmatter must not `return` early: it crashes ESLint (`src/pages/notes/[id].astro:7-9`). Use `Astro.response.status` plus conditional rendering on the map page too.

## Historical Context (from prior changes)

- `context/archive/2026-09-22-campaign-notes-schema/` — designed `relations` as undirected with canonical ordering for S-02. `docs/reference/contract-surfaces.md` records that S-02 "must sort the pair before insert/lookup".
- `context/archive/2026-09-23-create-notes/` — introduced `create_note` (atomic, security invoker), DB-level length limits, and the "no top-level return in frontmatter" rule.

Verdicts on individual claims in `research-react-flow-docs.md`:

| Claim | Verdict |
|---|---|
| §1 install, node/edge shapes, explicit parent height, `nodeTypes` defined outside the component | Supported |
| §1 `import style.css` in the component | Contradicted for Tailwind 4 (use `global.css` in `@layer base`) |
| §1 `colorMode="system"` | Works, but mismatched with this app's always-dark theme |
| §2 click handlers and edge-direction ambiguity | Supported; the schema confirms no direction |
| §3 no `onConnect` / `onReconnect` / `onDelete` | Supported |
| §3 "not confirmed" props | Now confirmed: `nodesConnectable`, `elementsSelectable`, `deleteKeyCode`. `edgesReconnectable` still not seen |
| §4 dagre / d3-force description | Supported as docs. The rAF/effect variant is at risk under this repo's lint rules (inference) |
| §4 recommendation: one-shot layout, no live physics | Supported and reinforced by the lint finding |
| §5 `client:only="react"` | Compatible |
| §5 "Astro page loads via Supabase under RLS" | Compatible |
| §5 "`{nodes, edges}` DTOs in `src/types.ts`" | Partial: keep React Flow types out of `types.ts` |
| §5 "dependencies to add" | Supported; add `@types/d3-force` if d3-force is used |

## Related Research

- `context/changes/auto-relations-memory-map/research-memory-map-libraries.md` — library choice (React Flow + d3-force). Its React 19 compatibility claim for React Flow is consistent with the npm peer ranges above.
- `context/changes/auto-relations-memory-map/research-react-flow-docs.md` — the document assessed here.

## Open Questions (for `/10x-plan`)

1. **Detection location:** DB (inside `create_note` / a trigger, which covers the direct-insert path) or TS service?
2. **Match semantics:** case-sensitive or not (names are unique case-insensitively)? Should matching respect word boundaries ("Inn" vs "Winnie")? Should the direction be both ways (A's name in B's content, or B's name in A's content)?
3. **Backfill** for notes created before S-02.
4. **Click behaviour** (from the doc): node-click navigation, edge-click with a chooser, or a per-note neighbourhood map?
5. **Map location:** `/dashboard`, a new `/map` (add it to `PROTECTED_ROUTES`), or `/notes/map`?
6. **Layout:** a pure one-shot d3-force function with fixed node sizes (lint-safe, deterministic) vs. dagre. Verify with `npm run lint` early.

---

## Follow-up (2026-09-26T20:25+02:00, commit 73d1efa): How to implement FR-007 relation detection

**Question:** How should S-02's relation detection work so that it fits `context/foundation/tech-stack.md` (Astro SSR on Cloudflare Workers + Supabase Postgres; `has_background_jobs: false`, `has_ai: false`) and the React Flow map? Give 3 pros and 3 cons per option.

**Answer:** Four options fit the stack. **Recommended: Option A.** Store relations and detect them in Postgres, using a trigger on `notes` that calls one SQL detection function. Option C (compute relations at read time) is the fallback if the fastest possible hypothesis test matters more than S-04 reuse. React Flow doesn't decide between them: A, B and C all hand the island the same `{notes, relations}` DTO proposed above (Correction 5). Only option D changes what the island receives.

This answers Open Question 1 (where detection runs) and the testable part of Open Question 2 (how matching works). Case sensitivity and word-boundary rules remain product choices, but the evidence below narrows them.

### Settled constraints every option must respect

- **Pair order and dedup:** store the pair sorted (`note_a_id < note_b_id`, `…campaign_notes_schema.sql:117`), rely on `relations_unique_pair` (`:118`), and keep both notes in one campaign (composite FKs, `:113-116`). In SQL that means `least()/greatest()` plus `on conflict do nothing`. In TS, sort the two ids before inserting.
- **Direction:** a relation exists if A's name appears in B's text *or* B's name appears in A's text (`prd.md:100`). That is two checks per pair, stored as one undirected edge. A note never relates to itself.
- **Case:** names are unique case-insensitively (`notes_campaign_name_key` on `lower(name)`, `:74`). Case-insensitive matching is therefore consistent with the schema, and case-sensitive matching would miss sentence-initial mentions. Still a product choice (Open Question 2).
- **Existing notes:** notes created by S-01 have no relations. A, B and C each need a "recompute campaign" routine, which A and B also need for backfill. D needs none.
- **Deletes:** already handled for stored relations. FK `on delete cascade` (`:114,116`) removes a deleted note's edges. Deleting a note can't *create* relations, so S-04's delete path only needs the before/after difference for its notice.

### Matching mechanics (tested against local Supabase and Node on 2026-09-26)

These results decide how the word-boundary rule can be implemented. Test DB: local Supabase, `PostgreSQL 17.6`, database ctype `en_US.UTF-8`.

| Check | Result |
|---|---|
| Postgres `'Spotkali w Łódź.' ~* '\mŁódź\M'` | `true`: non-ASCII letters count as word characters under this ctype |
| Postgres `'Winnie' ~* '\minn\M'` | `false`: word boundaries reject the "Inn in Winnie" false positive |
| Postgres `'the Inn.' ~* '\minn\M'` | `true` |
| Postgres `'Mr. (Bob) came' ~* ('\m' \|\| escaped('Mr. (Bob)') \|\| '\M')` | `false`: `\M` fails when a name *ends* in punctuation |
| Postgres same text with a guard `(^\|[^[:alnum:]_])…($\|[^[:alnum:]_])` | `true`, and `false` for `'xMr. (Bob)y'` |
| Node `/\bŁódź\b/i.test("w Łódź.")` | `false`: JS `\b` is ASCII-only |
| Node `/(?<![\p{L}\p{N}_])Łódź(?![\p{L}\p{N}_])/iu.test("w Łódź.")` | `true` |

What follows:

- Word-boundary matching is feasible in both SQL and TS, but neither plain `\m…\M` (SQL) nor `\b` (JS) is correct for every name. Use explicit non-word-character guards.
- Escape regex metacharacters in names in both languages. Names are free text up to 120 chars (`create_note_function.sql:60`). Postgres has no built-in escape function, so it needs a `regexp_replace` that escapes the metacharacters. The version tested here produces `Mr\. \(Bob\)`.
- Gap: the hosted Supabase project's ctype wasn't checked. If it is `C`, `[:alnum:]` may treat `Ł` as a non-word character. Check with `select datctype from pg_database where datname = current_database();` on production before relying on SQL word boundaries.
- Plain substring matching (`position(lower(name) in lower(content)) > 0` / `includes`) avoids regex entirely, but it accepts "Inn" inside "Winnie" (`prd.md:78`).

### Option A — Stored relations, detected in Postgres (trigger + SQL function) — **recommended**

**Shape:**

- A `security invoker` plpgsql function `detect_note_relations(p_note_id)` deletes the note's existing edges, then inserts the pairs that match in either direction.
- An `AFTER INSERT OR UPDATE OF name, content ON notes` trigger calls it.
- `recompute_campaign_relations(p_campaign_id)` does the backfill. The migration runs it for existing campaigns.
- The map page reads `relations` through a new `listRelations` service.

**Pros:**

1. It covers every write path: `create_note` RPC, direct `insert` into `notes`, and direct `update`. All three are reachable because the anon key is public (`create_note_function.sql:56-59`, `restrict_update_columns.sql:10` grants `update (name, content, type_id)`). So "relations are exclusively the output of automatic matching" (FR-011) holds regardless of which path wrote the note. Only A enforces this.
2. It's atomic with the note write: same transaction, and no extra Worker→Supabase round trip. `createNote` (`src/lib/services/notes.ts:101-128`) needs no change. This follows the repo's "DB is the enforcement point" precedent (Architecture Insights above).
3. S-04 largely comes for free. `UPDATE OF name, content` already re-runs detection on edit, delete cascades already remove edges, and backfill is one SQL call in the migration. Relations are precomputed, so the map read stays a cheap indexed select (`relations_campaign_id_idx`, `:121`) no matter how long the notes are.

**Cons:**

1. The matcher lives in plpgsql and regex. Name escaping plus non-word guards (see the table above) are harder to write and debug than TS. Word-character classes depend on the database ctype, and the hosted ctype is unverified.
2. It can only be tested through the integration suite, which needs `npx supabase start` (`tests/integration/`). `npm run test:unit` can't exercise it, so feedback is slower while the matching rules are still changing.
3. A trigger can't hand the "added/removed relations" set back to the API caller for FR-008's notice (S-04). S-04 will need an RPC that snapshots edges before the edit and returns the difference, or a before/after select around the update. Triggers are also implicit side effects that someone reading `notes.ts` won't see.

### Option B — Stored relations, detected in a TS service on the Worker

**Shape:**

- `src/lib/services/relations.ts` holds a pure `detectRelations(target, others) → pairs` plus a persistence wrapper.
- The wrapper loads the campaign's notes, deletes the target note's edges and inserts the new set.
- `POST /api/notes` calls it after `createNote` succeeds.

**Pros:**

1. The matcher is a pure TS function, so it can be unit-tested in Vitest with no services and gets strict type checking. That's the fastest loop for tuning matching rules while the hypothesis is tested.
2. The function returns the added/removed difference directly, which S-04's FR-008 notice needs. There's no hidden side effect: the call is visible in the API route.
3. JS regex with the `u` flag and Unicode lookarounds handles non-ASCII names regardless of database locale (verified above).

**Cons:**

1. It misses the direct `insert`/`update`/RPC paths that skip the API route. Relations can then drift from notes until the next recompute, so FR-011's invariant only holds in application code. The impact is low, because only the owner can write their own data, but the guarantee is weaker than A's.
2. It isn't atomic. If the relations write fails after the note has been committed, the note has no edges. It's also several round trips per save: read notes, delete edges, insert edges. RLS policies allow the INSERT/DELETE (`:132-141`), but a failure needs a retry or a recompute action.
3. Every save loads the content of all the campaign's notes (up to 20,000 chars each, `create_note_function.sql:61`) into the Worker. That's fine at the PRD's `data_volume: small` (`prd.md:8-11`), but payload and CPU grow with the campaign, and this Worker has request CPU limits.

### Option C — No stored relations; compute them at read time (SQL function or server-side TS)

**Shape:** the map page calls `campaign_relations(p_campaign_id)`, a SQL function returning undirected pairs, or runs the TS matcher on the full note list in the Astro frontmatter. The `relations` table stays empty.

**Pros:**

1. Relations can never be stale. There's nothing to sync, no backfill, and renames and deletes (S-04) are reflected with no extra work. All write paths are covered.
2. It's the smallest write-side change: `create_note` and `createNote` stay untouched, so the hypothesis gets tested with the least code.
3. Matching rules can change at any time and apply to every existing note immediately. That's useful while "Inn vs. Winnie" rules are still being tuned.

**Cons:**

1. Every map load does O(N²) name×content comparisons, up to N×(N−1) regex tests over texts of up to 20,000 chars. That's acceptable only at small scale, and the cost moves onto every page view.
2. It contradicts the recorded contract. `relations`, its RLS and its ordering invariant exist because S-02 was expected to store detection output (`docs/reference/contract-surfaces.md:38-45`, `context/archive/2026-09-22-campaign-notes-schema/`). The table becomes dead schema unless the registry is updated.
3. FR-008's notice (S-04) has no stored "before" state. S-04 must compute the full set before and after each edit to find what changed, which doubles the O(N²) cost on edits.

### Option D — Compute relations in the browser, inside the React Flow island

**Shape:** the page passes each note's `{id, name, content}` to the `client:only` island. A `useMemo` in the island builds React Flow `Edge[]` directly.

**Pros:**

1. No backend or migration work. Edges are built in the exact shape React Flow needs.
2. Recomputing is instant on the client, and relations are never stale (same as C).
3. The server does no matching work on any request.

**Cons:**

1. The full content of every note ships to the browser just to draw a map that only needs names. For large campaigns that means a heavy page payload.
2. The engine is locked in the UI layer. S-04's server-side notice and any "related notes" list on `/notes/[id]` would need it again, which breaks "S-04 reuses the same engine" (`roadmap.md:135`) and the convention that business logic lives in `src/lib/services/` (CLAUDE.md).
3. Same contract conflict as C: `relations` goes unused. Edge computation also sits inside a component that falls under the React Compiler lint rules (Correction 4). A pure memoized function is fine, but every added feature raises the lint risk.

### Comparison

| | A: DB trigger | B: TS service | C: compute on read | D: in browser |
|---|---|---|---|---|
| Covers all write paths | yes | no (API route only) | yes | yes |
| Atomic with note write | yes | no | n/a | n/a |
| Unit-testable without Supabase | no | yes | TS variant only | yes |
| Gives S-04 a change set easily | needs extra RPC | yes | needs before/after compute | no |
| Uses existing `relations` contract | yes | yes | no | no |
| Map read cost | indexed select | indexed select | O(N²) per load | O(N²) per load, client |

### Why A is recommended

- It's the only option that is both atomic and covers every write path.
- It matches the schema's intent and the DB-enforcement precedent.
- It keeps the map read cheap.

Its main weakness, testability of the SQL matcher, is covered by existing integration-test infrastructure (`tests/integration/create-note-function.test.ts` already tests an RPC).

A **hybrid** is possible but not recommended here: a TS pure matcher for unit tests plus a SQL copy for the trigger. The two copies would drift, which is the kind of dual-maintenance the `notes` length checks already warn about (`create_note_function.sql:56-59`).

### Open items for `/10x-plan`

1. Pick case-insensitive vs case-sensitive matching, and word-boundary guard vs plain substring. Word boundaries are recommended given `prd.md:78`.
2. Verify the hosted database's `datctype` before relying on SQL word classes (see the gap above).
3. Concurrency (inference, not tested): with option A or B, two notes created at the same moment in one campaign each miss the other's uncommitted row. For a single user that's rare, but the "recompute campaign" routine also serves as the repair path.
4. S-04's change-set mechanism under A: an RPC that returns the added and removed pairs.

---

## Follow-up 2 (2026-09-26): Decision and counterargument

**Decision (user):** Option A. The user's reason: per-insert cost grows linearly (2N checks for N existing notes, so the cumulative cost is an arithmetic series), and the database was assumed to parallelize this work better than a JS runtime.

**Counterargument: the performance reason doesn't hold. Option A is still the right pick, but for its guarantees, not for speed.**

- **Postgres won't parallelize this detection.** The planner doesn't generate parallel plans for queries that write data or lock rows, for queries inside PL/pgSQL loops, or for queries using `PARALLEL UNSAFE` functions, which is the default for user-defined functions (PostgreSQL docs §15.2, "When Can Parallel Query Be Used?", via Context7). An `INSERT … SELECT` run inside a trigger meets the first condition. So Option A runs the same 2N regex checks sequentially in one backend process.
- **The JS cost is small at this scale.** A Node benchmark on 2026-09-26 ran 1,000 Unicode-aware word-boundary regex checks against 500 notes of ~20,000 chars each (the maximum content size). One new note took 201.6 ms, including compiling the regexes. That's a worst case for content length; a 50-note campaign (100 checks) scales linearly to roughly 20 ms. Postgres and V8 do comparable work per check.
- **B's real costs are I/O and guarantees, not CPU.** B has to transfer every note's content to the Worker and make several round trips per save. It also isn't atomic and misses direct writes. Those are the reasons already given for A in the first follow-up.
- **One constraint that does favour A (unverified):** Cloudflare Workers enforce a per-request CPU limit that depends on the plan. This repo doesn't record which plan it uses. On a tight CPU limit, B's ~20–200 ms of regex work could fail requests, while A's work runs in Postgres and doesn't count against it.

---

## Follow-up 3 (2026-09-26): Would a "search first, write after" staging step let Postgres parallelize detection?

**Question:** Detection could first run a read-only search, store the matches (note id, positions and so on) in a temp table, and only then write the relations. Would splitting it this way unlock parallel query?

**Answer: technically possible, but in practice no.** The split removes one blocker, the write, but two others remain.

1. **Too little data for the planner to choose it.** Measured on local Supabase (Postgres 17.6) in a rolled-back transaction, 2026-09-26. The test table had 500 notes at ~20,000 chars each, and its heap was only 256 kB. Note content above ~2 kB is moved out of the heap into TOAST storage, and parallel sequential scans are only considered for heaps of at least `min_parallel_table_scan_size` (8MB). With default settings, a `CREATE TABLE AS` search (the one writing form allowed to go parallel) was planned as a plain serial `Seq Scan`. This follows from TOAST, so reaching the threshold would take a number of notes far beyond this product's scale (inference).
2. **The gain is small even when forced.** With parallel costs forced to 0, Postgres launched 2 workers, and the 500-note search took 14.8 ms instead of 29.1 ms serially. A 50-note campaign is roughly 3 ms serially, where worker start-up overhead would cancel the saving (inference, not measured).
3. **Temp tables work against it.** Scans of temporary tables are parallel-restricted (PostgreSQL docs §15.4, "Parallel Safety"). A temp table created on every note save also adds system-catalog churn, so a CTE or a plpgsql array variable is the better staging container.
4. **Untested:** whether a query issued from a trigger function nested inside an `INSERT` can get a parallel plan at all. The tests above ran as top-level statements.

**The staging idea is still worth keeping, for a different reason.**

- Compute the complete new set of pairs for the note first, as a CTE or array.
- Diff it against the note's existing `relations` rows.
- Delete only the removed pairs, insert only the added ones, and return both lists.

This is exactly the "added/removed" set S-04's FR-008 notice needs. It fixes Option A's third con, provided the logic lives in an RPC that is called explicitly rather than purely in a trigger. Storing match positions isn't needed for relations; leave it out unless a future feature (for example highlighting mentions) needs it.
