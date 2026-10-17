import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useNodesState, type Edge } from "@xyflow/react";

import { Input } from "@/components/ui/input";
import { useMapSearchFocus } from "@/components/hooks/useMapSearchFocus";
import { useNoteSearch } from "@/components/hooks/useNoteSearch";
import { MESSAGES } from "@/lib/constants/messages";
import { findMatchingNoteIds, mapSearchOutcome } from "@/lib/map-search";
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

interface Props extends MemoryMapData {
  campaignId: string;
  initialQuery: string;
}

function MemoryMapCanvas(props: Props) {
  // Lazy initializers run exactly once, so the layout simulation and the edge list are
  // never recomputed on re-render (e.g. while dragging a node).
  const [initialNodes] = useState(() => buildNodes(props));
  const [edges] = useState(() => buildEdges(props));
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  const { input, appliedQuery, searchRun, onInputChange, onKeyDown, onBlur } = useNoteSearch(props.initialQuery);
  const matchingIds = useMemo(() => findMatchingNoteIds(props.notes, appliedQuery), [props.notes, appliedQuery]);
  const outcome = useMemo(() => mapSearchOutcome(appliedQuery, matchingIds), [appliedQuery, matchingIds]);
  useMapSearchFocus(outcome, searchRun, props.initialQuery !== "");

  // Found marking is derived on top of the state nodes, which are never rewritten (dragging keeps working).
  const displayNodes = useMemo(() => {
    const found = new Set(matchingIds);
    return nodes.map((node) => ({ ...node, data: { ...node.data, found: found.has(node.id) } }));
  }, [nodes, matchingIds]);

  return (
    <div className="space-y-4">
      <Input
        type="search"
        value={input}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        aria-label={MESSAGES.NOTES_SEARCH_LABEL}
        placeholder={MESSAGES.NOTES_SEARCH_LABEL}
        className="rounded-lg px-3 py-2 text-sm"
      />

      <div role="status" aria-live="polite">
        {outcome.kind === "none" && <p className="text-muted-foreground">{MESSAGES.NO_NOTES_FOUND}</p>}
      </div>

      <div className="border-input bg-background h-[70vh] overflow-hidden rounded-xl border">
        <ReactFlow
          nodes={displayNodes}
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
            window.location.assign(`/campaigns/${props.campaignId}/notes/${node.id}`);
          }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

/**
 * Read-only graph of the active campaign (FR-011: nothing here can create, delete,
 * reconnect or select a relation), with a note-name search that marks and frames matches.
 * Nodes and edges are computed once, from the initial props, with a one-shot force layout —
 * dragging a node only moves it locally, it is never persisted. Clicking a node navigates to its note.
 */
export function MemoryMap(props: Props) {
  return (
    <ReactFlowProvider>
      <MemoryMapCanvas {...props} />
    </ReactFlowProvider>
  );
}

export default MemoryMap;
