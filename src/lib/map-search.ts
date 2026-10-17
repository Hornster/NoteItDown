import { matchesNoteName, normalizeQuery } from "./note-search";

/** Centering on a single result never leaves the viewport zoomed out below this. */
export const MAP_SEARCH_MIN_CENTER_ZOOM = 1;
/** Fitting several results never zooms in past this. */
export const MAP_SEARCH_FIT_MAX_ZOOM = 1;
export const MAP_SEARCH_ANIMATION_MS = 300;
/** fitView padding as a fraction of the viewport. */
export const MAP_SEARCH_FIT_PADDING = 0.2;

export type MapSearchOutcome =
  { kind: "idle" } | { kind: "none" } | { kind: "one"; id: string } | { kind: "many"; ids: string[] };

/** Ids of notes whose name matches the query, in input order. A normalized-empty query matches nothing. */
export function findMatchingNoteIds(notes: readonly { id: string; name: string }[], query: string): string[] {
  if (normalizeQuery(query) === "") return [];
  return notes.filter((n) => matchesNoteName(n.name, query)).map((n) => n.id);
}

/** Classifies a search: idle (no query), none, one match (center on it) or many (fit them all). */
export function mapSearchOutcome(query: string, matchingIds: readonly string[]): MapSearchOutcome {
  if (normalizeQuery(query) === "") return { kind: "idle" };
  if (matchingIds.length === 0) return { kind: "none" };
  const [first] = matchingIds;
  if (matchingIds.length === 1) return { kind: "one", id: first };
  return { kind: "many", ids: [...matchingIds] };
}

/** Zoom to use when centering on a single result: the current zoom, but never below the minimum. */
export function centerZoom(currentZoom: number): number {
  return Math.max(currentZoom, MAP_SEARCH_MIN_CENTER_ZOOM);
}
