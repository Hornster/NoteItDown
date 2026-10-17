import { useEffect, useRef } from "react";
import { useNodesInitialized, useReactFlow } from "@xyflow/react";

import {
  MAP_SEARCH_ANIMATION_MS,
  MAP_SEARCH_FIT_MAX_ZOOM,
  MAP_SEARCH_FIT_PADDING,
  centerZoom,
  type MapSearchOutcome,
} from "@/lib/map-search";
import { nodeCenter } from "@/lib/memory-map-layout";

/**
 * Moves the viewport once per search run: centers on a single match, fits several, leaves it
 * alone for no match or no query. Must be called under `ReactFlowProvider`. The initial `?q=`
 * counts as run 0. The move is deferred by one animation frame so it lands after React Flow's
 * built-in `fitView` on load.
 */
export function useMapSearchFocus(outcome: MapSearchOutcome, searchRun: number, hasInitialQuery: boolean): void {
  const { setCenter, fitView, getInternalNode, getZoom } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const outcomeRef = useRef(outcome);
  const handledRun = useRef<number | null>(null);

  useEffect(() => {
    outcomeRef.current = outcome;
  }, [outcome]);

  useEffect(() => {
    if (!nodesInitialized || handledRun.current === searchRun) return;
    if (searchRun === 0 && !hasInitialQuery) {
      handledRun.current = searchRun;
      return;
    }

    const frame = requestAnimationFrame(() => {
      handledRun.current = searchRun;
      const current = outcomeRef.current;
      if (current.kind === "one") {
        const node = getInternalNode(current.id);
        if (!node) return;
        const { x, y } = nodeCenter(node);
        void setCenter(x, y, { zoom: centerZoom(getZoom()), duration: MAP_SEARCH_ANIMATION_MS });
      } else if (current.kind === "many") {
        void fitView({
          nodes: current.ids.map((id) => ({ id })),
          maxZoom: MAP_SEARCH_FIT_MAX_ZOOM,
          padding: MAP_SEARCH_FIT_PADDING,
          duration: MAP_SEARCH_ANIMATION_MS,
        });
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [nodesInitialized, searchRun, hasInitialQuery, setCenter, fitView, getInternalNode, getZoom]);
}
