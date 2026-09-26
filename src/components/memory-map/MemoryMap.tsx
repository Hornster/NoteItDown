import { useState } from "react";
import { Background, Controls, ReactFlow, useNodesState, type Edge } from "@xyflow/react";

import { layoutMemoryMap } from "@/lib/memory-map-layout";
import type { MemoryMapData } from "@/types";
import { NoteNode, type NoteFlowNode } from "./NoteNode";
import { StraightEdge } from "./StraightEdge";

// Defined at module scope so React Flow doesn't see a new object identity on every render.
const nodeTypes = { note: NoteNode };
const edgeTypes = { straight: StraightEdge };

function buildNodes(data: MemoryMapData): NoteFlowNode[] {
  const positions = layoutMemoryMap(
    data.notes.map((note) => note.id),
    data.relations,
  );
  return data.notes.map((note) => ({
    id: note.id,
    type: "note",
    position: positions.get(note.id) ?? { x: 0, y: 0 },
    data: { name: note.name, typeName: note.type_name },
  }));
}

// Mirrors layoutMemoryMap's filter: drop relations whose endpoints aren't among the notes.
function buildEdges(data: MemoryMapData): Edge[] {
  const noteIds = new Set(data.notes.map((note) => note.id));
  return data.relations
    .filter((relation) => noteIds.has(relation.note_a_id) && noteIds.has(relation.note_b_id))
    .map((relation) => ({
      id: relation.id,
      type: "straight",
      source: relation.note_a_id,
      target: relation.note_b_id,
    }));
}

/**
 * Read-only graph of the active campaign (FR-011: nothing here can create, delete,
 * reconnect or select a relation). Nodes and edges are computed once, from the initial
 * props, with a one-shot force layout — dragging a node only moves it locally, it is
 * never persisted. Clicking a node navigates to its note.
 */
export function MemoryMap(props: MemoryMapData) {
  // Lazy initializers run exactly once, so the layout simulation and the edge list are
  // never recomputed on re-render (e.g. while dragging a node).
  const [initialNodes] = useState(() => buildNodes(props));
  const [edges] = useState(() => buildEdges(props));
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        edgesFocusable={false}
        edgesReconnectable={false}
        colorMode="dark"
        fitView
        onNodeClick={(_event, node) => {
          window.location.assign(`/notes/${node.id}`);
        }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export default MemoryMap;
