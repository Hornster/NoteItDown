import { useCallback, useEffect, useState } from "react";
import { sessionStorageOrNull } from "@/lib/browser-storage";
import { readExpandedGroups, writeExpandedGroups } from "@/lib/note-search";

interface UseGroupExpansionResult {
  isExpanded: (typeName: string) => boolean;
  toggle: (typeName: string) => void;
}

interface SearchExpansion {
  query: string;
  expanded: Set<string>;
}

function toggled(set: Set<string>, typeName: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(typeName)) next.add(typeName);
  return next;
}

/**
 * Two separate expansion sets: the browse set (persisted per campaign in sessionStorage, loaded after
 * mount) and a search set (reset to all matching groups whenever the applied query changes, never persisted).
 */
export function useGroupExpansion(
  campaignId: string,
  appliedQuery: string,
  matchingTypeNames: string[],
): UseGroupExpansionResult {
  const [browse, setBrowse] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState<SearchExpansion>({ query: appliedQuery, expanded: new Set(matchingTypeNames) });

  useEffect(() => {
    // Storage is read after mount (never during render) so the first client render matches the SSR HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrowse(readExpandedGroups(sessionStorageOrNull(), campaignId));
  }, [campaignId]);

  // Adjust state during render when the applied query changes, so the new query's first render is already expanded.
  let activeSearch = search;
  if (search.query !== appliedQuery) {
    activeSearch = { query: appliedQuery, expanded: new Set(matchingTypeNames) };
    setSearch(activeSearch);
  }

  const searching = appliedQuery !== "";

  const isExpanded = useCallback(
    (typeName: string) => (searching ? activeSearch.expanded : browse).has(typeName),
    [searching, activeSearch, browse],
  );

  const toggle = useCallback(
    (typeName: string) => {
      if (searching) {
        setSearch({ query: activeSearch.query, expanded: toggled(activeSearch.expanded, typeName) });
        return;
      }
      const next = toggled(browse, typeName);
      setBrowse(next);
      writeExpandedGroups(sessionStorageOrNull(), campaignId, next);
    },
    [searching, activeSearch, browse, campaignId],
  );

  return { isExpanded, toggle };
}
