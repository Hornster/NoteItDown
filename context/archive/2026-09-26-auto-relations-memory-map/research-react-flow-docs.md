---
change_id: auto-relations-memory-map
type: research
topic: React Flow API for the S-02 memory map
created: 2026-09-26
method: Context7 (`/websites/reactflow_dev`, official reactflow.dev docs)
---

# Research: React Flow API for S-02

Follow-up to [research-memory-map-libraries.md](research-memory-map-libraries.md), which recommends React Flow + d3-force and asks for a Context7 check of the current API before `/10x-plan`. This file records what the official docs confirm, and flags what they did not show.

Package: `@xyflow/react` (React Flow v12).

## 1. Setup — confirmed

```bash
npm i @xyflow/react
```

```tsx
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css"; // required

<div style={{ height: 800 }}>
  <ReactFlow nodes={nodes} edges={edges} fitView colorMode="system">
    <Background />
    <Controls />
    <MiniMap />
  </ReactFlow>
</div>;
```

- Node shape: `{ id, position: { x, y }, data: { label } }`. Edge shape: `{ id, source, target }`.
- **The parent element must have an explicit width and height.** The docs list a missing height as a common error: the flow renders nothing.
- `colorMode="system"` gives light/dark theming.
- Custom nodes: pass `nodeTypes={{ npc: NpcNode, ... }}` (and `edgeTypes` for edges). Define the object outside the component so it isn't recreated on every render. This lets note types be styled with Tailwind/shadcn.
- `useNodesState` / `useEdgesState` are the helper hooks for controlled nodes and edges.

## 2. Navigation (FR-010) — confirmed

From the `ReactFlow` API reference:

| Prop | Type | Use in S-02 |
|---|---|---|
| `onNodeClick` | `NodeMouseHandler<Node>` → `(event, node)` | Navigate to `node.id`'s note page |
| `onEdgeClick` | `(event, edge)` | Edge gives `edge.source` / `edge.target` |
| `onNodeMouseEnter` / `onEdgeMouseEnter` | mouse handlers | Optional hover highlight |

**Open design point for the plan:** the roadmap says "click a connection → navigate to the connected note". An edge click has two ends and gives no direction. Choose one:

- (a) Make a node click the main navigation.
- (b) Make edge clicks relative to the currently focused note.
- (c) On an edge click, show a small chooser for which end to open.

## 3. Read-only map (FR-011) — partly confirmed

What the docs confirm:

- New connections are only created through an `onConnect` handler (the examples call `addEdge` in it).
- Reconnecting an edge is opt-in via `edgesReconnectable`, with `onReconnect*` handlers.
- Deletion goes through `onNodesDelete` / `onEdgesDelete` / `onDelete` / `onBeforeDelete`, and through `onNodesChange` / `onEdgesChange` for controlled flows.

So, for FR-011:

- Do not pass `onConnect`, `onReconnect`, `onDelete`, `onNodesDelete` or `onEdgesDelete`.
- Never call `addEdge`.

**Not confirmed by the fetched snippets** (standard `ReactFlow` props; check them during planning or implementation):

- `nodesConnectable={false}`
- `edgesReconnectable={false}`
- `deleteKeyCode={null}`
- `elementsSelectable` as needed

Also hide or leave out `<Handle>`s in custom nodes. The docs show a CSS option (`pointer-events: none; opacity: 0` on `.react-flow__handle`) that keeps edges attached.

Relations stay server-derived only. The map never writes back.

## 4. Automatic layout — confirmed

Notes have no stored positions, so a layout is required.

### dagre (`@dagrejs/dagre`)

- Official example: `getLayoutedElements(nodes, edges, { direction })`.
  - Build a `Dagre.graphlib.Graph`.
  - Set `rankdir` (`"TB"` / `"LR"`).
  - Add nodes with `node.measured?.width/height` and edges with source/target.
  - Run `Dagre.layout(g)`.
- Dagre positions nodes by their centre; React Flow positions them by their top-left corner. Subtract half the width and height to convert.
- It runs once and is simple, but it is designed for trees and hierarchies.
- Uses `ReactFlowProvider` + `useReactFlow().fitView()` after layout.

### d3-force

- Official example:
  - Create a `forceSimulation()` with `forceManyBody` (charge), `forceX`/`forceY`, a collide force and `forceLink(edges).id(d => d.id)`.
  - Start it with `.stop()` so it only advances by manual `simulation.tick()` calls.
  - Advance it with a `requestAnimationFrame` loop that calls `setNodes(...)` and `fitView()`.
- Gate the loop on `useNodesInitialized()`. The simulation needs measured node sizes.
- Wrap the component in `ReactFlowProvider`, because the layout hook uses `useReactFlow()`.
- The docs call it more complex than dagre/d3-hierarchy, but a better fit for non-tree graphs. A campaign's relation web is not a tree.

### Recommendation

- Use a one-shot layout, with no live animation:
  - Either run d3-force synchronously for a fixed number of ticks once nodes are measured, then `setNodes` + `fitView`.
  - Or use dagre if that looks good enough on real campaign data.
- Skip draggable live physics for the MVP.
- Choose the layout early in the plan, because it decides whether `ReactFlowProvider` and `useNodesInitialized` are needed.

## 5. Project integration — inferred, not from the docs

- Mount the island with `client:only="react"`. React Flow and the layout need browser measurement. This keeps graph code out of SSR on the Cloudflare Worker, as the library research already concluded.
- Data flow:
  - The Astro page (or an API route) loads the campaign's notes and relations via Supabase under RLS.
  - It maps them to `{ nodes, edges }` DTOs in `src/types.ts`.
  - It passes them as props to the island.
  - The island handles layout and click navigation.
- ESLint `strictTypeChecked`: type nodes and edges with React Flow's generics (`Node<NoteNodeData, "note">`, `Edge`) instead of `any`.
- The dependencies to add are `@xyflow/react` plus one of `@dagrejs/dagre` or `d3-force` (+ `@types/d3-force`).

## Open questions for `/10x-plan`

1. What does a click do: navigate on node click, edge click, or both (§2)?
2. Which layout: dagre or one-shot d3-force (§4)?
3. Should nodes be draggable? If so, positions are not saved (FR-011 only forbids editing relations, not moving nodes).
4. Confirm the unverified lock-down props in §3.

## Sources (Context7, `/websites/reactflow_dev`)

- reactflow.dev/learn/getting-started/installation-and-requirements
- reactflow.dev/learn/troubleshooting/common-errors (parent container size)
- reactflow.dev/learn/customization/theming
- reactflow.dev/api-reference/react-flow (node/edge/general events)
- reactflow.dev/examples/overview (custom `nodeTypes`/`edgeTypes`)
- reactflow.dev/examples/interaction/connection-events
- reactflow.dev/llms-medium.txt (dagre and d3-force layout examples, handle-hiding CSS)
