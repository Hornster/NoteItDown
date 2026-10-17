import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from "@/lib/memory-map-layout";

/** Data carried by every note node on the map. */
export interface NoteNodeData {
  name: string;
  typeName: string;
  /** True when the node matches the active map search. */
  found?: boolean;
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
      data-found={data.found ? "true" : undefined}
      style={{ width: MAP_NODE_WIDTH, height: MAP_NODE_HEIGHT }}
      className={cn(
        "border-input bg-card text-card-foreground hover:bg-accent flex cursor-pointer flex-col justify-between gap-1 overflow-hidden rounded-xl border px-4 py-3 transition-colors",
        data.found && "border-primary ring-primary ring-2",
      )}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <span className="text-foreground shrink-0 truncate py-0.5 leading-normal font-medium">{data.name}</span>
      <Badge variant="outline" className="rounded-full px-2.5 py-1">
        {data.typeName}
      </Badge>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
    </div>
  );
}
