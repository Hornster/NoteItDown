import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps } from "@xyflow/react";

import { nodeCenter } from "@/lib/memory-map-layout";

/**
 * Undirected straight line between two nodes' centres (React Flow's "simple floating
 * edges" pattern), since `note_a_id`/`note_b_id` are a canonical sort order, not a
 * direction — the handle placement on `NoteNode` never routes these edges.
 */
export function StraightEdge({ id, source, target }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const sourceCenter = nodeCenter(sourceNode);
  const targetCenter = nodeCenter(targetNode);
  const [edgePath] = getStraightPath({
    sourceX: sourceCenter.x,
    sourceY: sourceCenter.y,
    targetX: targetCenter.x,
    targetY: targetCenter.y,
  });

  return <BaseEdge id={id} path={edgePath} />;
}
