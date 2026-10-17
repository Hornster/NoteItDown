import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { InternalNode, Node } from "@xyflow/react";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";

/** Fixed node box shared with the map's node component. */
export const MAP_NODE_WIDTH = 160;
export const MAP_NODE_HEIGHT = 80;

/** Centre of a node's box in flow coordinates, from its measured (or fixed-fallback) size. */
export function nodeCenter(node: InternalNode<Node>): { x: number; y: number } {
  const { x, y } = node.internals.positionAbsolute;
  const width = node.measured.width ?? MAP_NODE_WIDTH;
  const height = node.measured.height ?? MAP_NODE_HEIGHT;
  return { x: x + width / 2, y: y + height / 2 };
}

/** Enough ticks for the simulation to settle from alpha=1 without relying on the auto-stop timer. */
const SIMULATION_TICKS = 300;

interface LayoutNode extends SimulationNodeDatum {
  id: string;
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  source: string;
  target: string;
}

/**
 * Deterministic, pure, one-shot force layout for the memory map. Builds plain-object copies
 * of the given ids/relations (d3-force mutates whatever it's given), runs a fixed number of
 * manual ticks, and returns each note's top-left position (center minus half the node box).
 *
 * Relations whose endpoints aren't both in `noteIds` are dropped before the simulation runs,
 * since `forceLink` throws on an id it can't resolve. d3-force's default fixed-seed random
 * source, combined with this function's stable input order, makes the output deterministic.
 */
export function layoutMemoryMap(
  noteIds: readonly string[],
  relations: readonly { note_a_id: string; note_b_id: string }[],
): Map<string, { x: number; y: number }> {
  const idSet = new Set(noteIds);
  const nodes: LayoutNode[] = noteIds.map((id) => ({ id }));
  const links: LayoutLink[] = relations
    .filter((relation) => idSet.has(relation.note_a_id) && idSet.has(relation.note_b_id))
    .map((relation) => ({ source: relation.note_a_id, target: relation.note_b_id }));

  const collideRadius = Math.hypot(MAP_NODE_WIDTH, MAP_NODE_HEIGHT) / 2;

  const simulation = forceSimulation(nodes)
    .force("charge", forceManyBody())
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(links).id((node) => node.id),
    )
    .force("collide", forceCollide<LayoutNode>(collideRadius))
    .force("x", forceX<LayoutNode>().strength(0.05))
    .force("y", forceY<LayoutNode>().strength(0.05))
    .stop();

  simulation.tick(SIMULATION_TICKS);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    positions.set(node.id, {
      x: (node.x ?? 0) - MAP_NODE_WIDTH / 2,
      y: (node.y ?? 0) - MAP_NODE_HEIGHT / 2,
    });
  }
  return positions;
}
