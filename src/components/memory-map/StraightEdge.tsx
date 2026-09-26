import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
  type Node,
} from "@xyflow/react";

import { MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from "@/lib/memory-map-layout";

/** Centre of a node's box in flow coordinates, from its measured (or fixed-fallback) size. */
function nodeCenter(node: InternalNode<Node>): { x: number; y: number } {
  const { x, y } = node.internals.positionAbsolute;
  const width = node.measured.width ?? MAP_NODE_WIDTH;
  const height = node.measured.height ?? MAP_NODE_HEIGHT;
  return { x: x + width / 2, y: y + height / 2 };
}

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
