import type { NoteGroup, NoteListItem } from "@/types";

export const NOTE_SEARCH_DEBOUNCE_MS = 300;
export const NOTE_SEARCH_PARAM = "q";
/** Pinned (not the runtime default) so SSR in workerd and hydration in the browser order groups identically. */
export const NOTE_SORT_LOCALE = "en";

const baseCollator = new Intl.Collator(NOTE_SORT_LOCALE, { sensitivity: "base", numeric: true });
const variantCollator = new Intl.Collator(NOTE_SORT_LOCALE, { sensitivity: "variant", numeric: true });

/** Trims the raw query; nullish and whitespace-only input mean "no search" (empty string). */
export function normalizeQuery(raw: string | null | undefined): string {
  return raw?.trim() ?? "";
}

/** Case-insensitive substring match on the note name. An empty query matches everything. */
export function matchesNoteName(name: string, query: string): boolean {
  const normalized = normalizeQuery(query);
  return normalized === "" || name.toLowerCase().includes(normalized.toLowerCase());
}

/** A-Z ignoring case and accents, numbers by value; base-equal names fall back to a variant-strength comparison. */
export function compareNames(a: string, b: string): number {
  return baseCollator.compare(a, b) || variantCollator.compare(a, b);
}

/** One group per distinct type name; groups and the notes inside them are sorted by name (ties by id). */
export function groupNotesByType(notes: NoteListItem[]): NoteGroup[] {
  const byType = new Map<string, NoteListItem[]>();
  for (const note of notes) {
    const bucket = byType.get(note.type_name);
    if (bucket) bucket.push(note);
    else byType.set(note.type_name, [note]);
  }
  return [...byType.entries()]
    .map(([typeName, groupNotes]) => ({
      typeName,
      notes: groupNotes.sort((a, b) => compareNames(a.name, b.name) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => compareNames(a.typeName, b.typeName) || a.typeName.localeCompare(b.typeName));
}

/** Keeps only matching notes and drops groups left empty; order is preserved. An empty query returns the input. */
export function filterNoteGroups(groups: NoteGroup[], query: string): NoteGroup[] {
  const normalized = normalizeQuery(query);
  if (normalized === "") return groups;
  return groups
    .map((group) => ({
      typeName: group.typeName,
      notes: group.notes.filter((n) => matchesNoteName(n.name, normalized)),
    }))
    .filter((group) => group.notes.length > 0);
}

/** Blur re-runs the search only when the typed text differs (after trimming) from what is applied. */
export function shouldSearchOnBlur(input: string, appliedQuery: string): boolean {
  return normalizeQuery(input) !== normalizeQuery(appliedQuery);
}

export function expandedGroupsStorageKey(campaignId: string): string {
  return `noteitdown:dashboard-expanded:${campaignId}`;
}

/** Reads the expanded type names. Tolerant: anything unreadable or malformed yields an empty set. Never throws. */
export function readExpandedGroups(storage: Storage | null, campaignId: string): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(expandedGroupsStorageKey(campaignId));
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

/** Persists the expanded type names; an empty set removes the key. Never throws (storage may be blocked). */
export function writeExpandedGroups(storage: Storage | null, campaignId: string, typeNames: Iterable<string>): void {
  if (!storage) return;
  const names = [...typeNames];
  try {
    if (names.length === 0) storage.removeItem(expandedGroupsStorageKey(campaignId));
    else storage.setItem(expandedGroupsStorageKey(campaignId), JSON.stringify(names));
  } catch {
    // Storage unavailable (private mode, blocked): expansion state just isn't remembered.
  }
}
