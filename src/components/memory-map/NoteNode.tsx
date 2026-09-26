import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from "@/lib/memory-map-layout";

/** Data carried by every note node on the map. */
export interface NoteNodeData {
  name: string;
  typeName: string;
  [key: string]: unknown;
}

export type NoteFlowNode = Node<NoteNodeData, "note">;

/**
 * Read-only note box: fixed size, truncated name, type badge, styled like the
 * dashboard's list items. Both handles are present (so edges stay attached) but
 * hidden and non-interactive — the map has no way to create or reconnect an edge.
 */
export function NoteNode({ data }: NodeProps<NoteFlowNode>) {
  return (
    <div
      style={{ width: MAP_NODE_WIDTH, height: MAP_NODE_HEIGHT }}
      className={cn(
        "flex cursor-pointer flex-col justify-between gap-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10",
      )}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <span className="shrink-0 truncate py-0.5 leading-normal font-medium text-white">{data.name}</span>
      <span className="w-fit shrink-0 rounded-full bg-purple-500/30 px-2.5 py-1 text-xs text-purple-200">
        {data.typeName}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
    </div>
  );
}
