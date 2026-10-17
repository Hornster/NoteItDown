import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { NOTE_SEARCH_DEBOUNCE_MS, NOTE_SEARCH_PARAM, normalizeQuery, shouldSearchOnBlur } from "@/lib/note-search";

interface UseNoteSearchResult {
  input: string;
  appliedQuery: string;
  /** Counts search runs: every Enter, plus any debounce/blur apply that changed the query. Starts at 0. */
  searchRun: number;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

/** Edits only the `q` param of the current URL (other params and hash are kept); no-op when it already matches. */
function syncQueryToUrl(query: string): void {
  const url = new URL(window.location.href);
  if ((url.searchParams.get(NOTE_SEARCH_PARAM) ?? "") === query) return;
  if (query === "") url.searchParams.delete(NOTE_SEARCH_PARAM);
  else url.searchParams.set(NOTE_SEARCH_PARAM, query);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Owns the search input text and the applied query. The query is applied after a debounce pause,
 * on Enter, and on blur when the text changed; every applied change is mirrored to `?q=`.
 */
export function useNoteSearch(initialQuery: string): UseNoteSearchResult {
  const [input, setInput] = useState(initialQuery);
  const [appliedQuery, setAppliedQuery] = useState(initialQuery);
  const [searchRun, setSearchRun] = useState(0);
  const appliedRef = useRef(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  // Applies a query; counts a run when forced (Enter) or when it differs from the current applied query.
  const applyQuery = useCallback((next: string, force: boolean) => {
    const changed = next !== appliedRef.current;
    appliedRef.current = next;
    setAppliedQuery(next);
    if (force || changed) setSearchRun((run) => run + 1);
  }, []);

  useEffect(() => {
    syncQueryToUrl(appliedQuery);
  }, [appliedQuery]);

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setInput(value);
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        applyQuery(normalizeQuery(value), false);
      }, NOTE_SEARCH_DEBOUNCE_MS);
    },
    [clearTimer, applyQuery],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      clearTimer();
      applyQuery(normalizeQuery(event.currentTarget.value), true);
    },
    [clearTimer, applyQuery],
  );

  const onBlur = useCallback(() => {
    clearTimer();
    if (shouldSearchOnBlur(input, appliedQuery)) applyQuery(normalizeQuery(input), false);
  }, [clearTimer, applyQuery, input, appliedQuery]);

  return { input, appliedQuery, searchRun, onInputChange, onKeyDown, onBlur };
}
