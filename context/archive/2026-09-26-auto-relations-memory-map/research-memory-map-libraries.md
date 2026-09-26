---
change_id: auto-relations-memory-map
type: research
topic: Memory map visualization libraries
created: 2026-09-26
method: web_search_exa (not yet verified against Context7 docs)
---

# Research: Memory map libraries for S-02

Candidate libraries for rendering the S-02 memory map (auto-detected relations between notes, click-to-navigate), checked against `context/foundation/tech-stack.md`.

## Constraints

- **Astro 7 SSR on Cloudflare Workers:** every candidate draws on canvas, WebGL or needs browser measurements, so the map has to be a React island mounted with `client:only="react"`. The Worker only sends notes and relations as props or through an API route. No graph code runs on the Worker, so none of these libraries affects Worker bundle limits.
- **React 19 (^19.2.6):** this narrows the options.
- **S-02 needs:**
  - A small graph: one campaign, probably tens to low hundreds of notes.
  - Automatic layout.
  - A click handler on connections (FR-010), and possibly on notes.
  - No way to hand-create or edit a relation (FR-011).
- **UI stack:** Tailwind 4 and shadcn/ui are a plus if the library draws nodes as normal page elements.

## Candidates

| Library | Drawn with | Layout | Click events | React 19 | License | Fit |
|---|---|---|---|---|---|---|
| **React Flow** (`@xyflow/react` v12) + `d3-force` | HTML nodes, SVG connections | None built in; official d3-force / dagre / elkjs recipes | `onNodeClick`, `onEdgeClick` | ✅ UI components updated for React 19, Tailwind 4 and shadcn | MIT (ready-made layout examples are Pro-licensed; the recipe docs are free) | **Best fit.** Nodes are real HTML styled with Tailwind/shadcn, accessible, dark mode. Layout is DIY (~50 lines). FR-011: `nodesConnectable={false}`, no `onConnect`. |
| **react-force-graph-2d** | Canvas | Built-in d3-force physics | `onNodeClick`, `onLinkClick`, hover, drag | ⚠️ Works, with rough edges (see below) | MIT | **Simplest.** Pass `graphData={{nodes, links}}` and you have a map. ~60 KB gzipped. Canvas nodes: no Tailwind/shadcn styling, weak accessibility. |
| **Sigma.js** + `@react-sigma/core` (+ graphology, ForceAtlas2) | WebGL | ForceAtlas2, can give the same layout on every load | Yes, via event hooks | ✅ Confirmed in a 2026 write-up | MIT | Built for large graphs, which S-02 doesn't need. ~90 KB. Browser-only; not readable by screen readers. |
| **Reagraph** | WebGL (three.js + react-three-fiber v9) | Many built in: force, radial, tree, circular | Yes | ✅ Now on react-three-fiber v9 (the React 19 line) | Apache-2.0 | Polished and feature-rich, but pulls in three.js, drei, react-spring and graphology. Too heavy for the MVP. |
| **Cytoscape.js** + `react-cytoscapejs` | Canvas | Many, via extensions | Yes | ⚠️ Wrapper's last release is 2.0.0 (updated 2025-07); no idiomatic React bindings | MIT (one blog said LGPL; the official site says MIT) | ~150 KB. Its strength is graph algorithms, which S-02 doesn't need. |
| **vis-network** | Canvas | Force, hierarchical | Yes | No official React wrapper | MIT / Apache | ~180 KB; React wiring is DIY. |

### react-force-graph and React 19

- One 2026 write-up says it is incompatible with React 19's ref handling.
- A 2026-02 GitHub issue (#596) shows it running on React 19.2.4, with a real bug: the graph stops responding after browser back/forward navigation.
- The fix (react-kapsule PR #15) was still open as of 2026-06. Workaround: remount the component by changing its `key`.
- If chosen, test this early.

## Recommendation

1. **React Flow + d3-force (default).**
   - Matches the existing Tailwind, shadcn and React 19 setup.
   - Supports clicking connections directly (FR-010).
   - Nodes stay accessible.
   - Makes FR-011 easy to enforce.
   - Cost: a small layout hook that stops the simulation once it settles.
2. **react-force-graph-2d (quickest to ship).**
   - Fewest lines for a working, force-laid-out, clickable map.
   - Choose it if speed matters more than styling or accessibility.
   - Plan for the back/forward bug.

Skip Reagraph, Sigma, Cytoscape and vis-network for S-02: their strengths (thousands of nodes, graph algorithms) don't apply at campaign scale.

**Follow-up for `/10x-plan`:** check the chosen library's current API with Context7 before locking the plan.

## Sources

- reactflow.dev: layouting overview (`/learn/layouting/layouting`), force-layout example, what's-new page
- github.com/xyflow/xyflow issue #3168 (server-side rendering, resolved in v12)
- github.com/vasturiano/react-force-graph issues #596, #551, #379
- robbiepalmer.me/projects/personal-site/adrs/038-content-graph
- redsurgetechnology.com/blog/react-graph-library-guide (2026-09-11)
- npmjs.com/package/reagraph; github.com/reaviz/reagraph PR #323
- npmjs.com/package/react-cytoscapejs; github.com/plotly/react-cytoscapejs
- js.cytoscape.org
