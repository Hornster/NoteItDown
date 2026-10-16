import { describe, expect, it } from "vitest";
import type { NoteListItem } from "@/types";
import {
  compareNames,
  expandedGroupsStorageKey,
  filterNoteGroups,
  groupNotesByType,
  matchesNoteName,
  normalizeQuery,
  readExpandedGroups,
  shouldSearchOnBlur,
  writeExpandedGroups,
} from "./note-search";

function note(id: string, name: string, type_name = "NPC"): NoteListItem {
  return { id, name, type_name, created_at: "2026-01-01T00:00:00Z" };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  return storage as typeof storage & Storage;
}

const throwingStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("normalizeQuery", () => {
  it("trims, and maps nullish and whitespace-only to empty", () => {
    expect(normalizeQuery("  gob ")).toBe("gob");
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery(undefined)).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("matchesNoteName", () => {
  it("matches a substring in the middle, case-insensitively", () => {
    expect(matchesNoteName("Hobgoblin Chief", "gob")).toBe(true);
    expect(matchesNoteName("Hobgoblin Chief", "GOB")).toBe(true);
    expect(matchesNoteName("Alice", "gob")).toBe(false);
  });

  it("matches everything for an empty or whitespace-only query", () => {
    expect(matchesNoteName("Alice", "")).toBe(true);
    expect(matchesNoteName("Alice", "   ")).toBe(true);
  });
});

describe("compareNames", () => {
  it("orders numbers by value", () => {
    expect(compareNames("Goblin 2", "Goblin 10")).toBeLessThan(0);
  });

  it("is deterministic for base-equal names", () => {
    const a = compareNames("Éclair", "Eclair");
    expect(a).not.toBe(0);
    expect(compareNames("Eclair", "Éclair")).toBe(-a);
    expect(compareNames("Eclair", "Eclair")).toBe(0);
  });
});

describe("groupNotesByType", () => {
  it("groups across types and sorts groups and notes A-Z ignoring case", () => {
    const groups = groupNotesByType([
      note("1", "zeta", "Place"),
      note("2", "Alpha", "NPC"),
      note("3", "Beta", "Place"),
      note("4", "Łucznik", "Place"),
      note("5", "Goblin 10", "Faction"),
      note("6", "Goblin 2", "Faction"),
    ]);
    expect(groups.map((g) => g.typeName)).toEqual(["Faction", "NPC", "Place"]);
    expect(groups[0]?.notes.map((n) => n.name)).toEqual(["Goblin 2", "Goblin 10"]);
    expect(groups[2]?.notes.map((n) => n.name)).toEqual(["Beta", "Łucznik", "zeta"]);
  });

  it("orders Alpha, Beta, Łucznik, zeta within one type", () => {
    const [group] = groupNotesByType(["zeta", "Alpha", "Beta", "Łucznik"].map((n, i) => note(String(i), n)));
    expect(group.notes.map((n) => n.name)).toEqual(["Alpha", "Beta", "Łucznik", "zeta"]);
  });

  it("breaks full ties by id, regardless of input order", () => {
    const forward = groupNotesByType([note("a", "Same"), note("b", "Same")]);
    const backward = groupNotesByType([note("b", "Same"), note("a", "Same")]);
    expect(forward[0]?.notes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(backward[0]?.notes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("orders base-equal names the same regardless of input order", () => {
    const one = groupNotesByType([note("1", "Éclair"), note("2", "Eclair")]);
    const two = groupNotesByType([note("2", "Eclair"), note("1", "Éclair")]);
    expect(one[0]?.notes.map((n) => n.id)).toEqual(two[0]?.notes.map((n) => n.id));
  });

  it("returns no groups for no notes", () => {
    expect(groupNotesByType([])).toEqual([]);
  });

  it("groups and filters a 500-note list", () => {
    const types = ["NPC", "Place", "Item", "Faction", "Quest"];
    const notes = Array.from({ length: 500 }, (_, i) =>
      note(`id-${String(i).padStart(3, "0")}`, i % 50 === 0 ? `Hobgoblin ${i}` : `Note ${i}`, types[i % types.length]),
    );
    const groups = groupNotesByType(notes);
    expect(groups).toHaveLength(5);
    expect(groups.reduce((sum, g) => sum + g.notes.length, 0)).toBe(500);
    const filtered = filterNoteGroups(groups, "gob");
    expect(filtered.reduce((sum, g) => sum + g.notes.length, 0)).toBe(10);
  });
});

describe("filterNoteGroups", () => {
  const groups = groupNotesByType([
    note("1", "Hobgoblin Chief", "NPC"),
    note("2", "Alice", "NPC"),
    note("3", "Goblin 2", "NPC"),
    note("4", "Tavern", "Place"),
  ]);

  it("returns the input unchanged for an empty or whitespace-only query", () => {
    expect(filterNoteGroups(groups, "")).toBe(groups);
    expect(filterNoteGroups(groups, "   ")).toBe(groups);
  });

  it("keeps matching notes, drops empty groups and preserves order", () => {
    const result = filterNoteGroups(groups, "gob");
    expect(result.map((g) => g.typeName)).toEqual(["NPC"]);
    expect(result[0]?.notes.map((n) => n.name)).toEqual(["Goblin 2", "Hobgoblin Chief"]);
  });

  it("returns no groups when nothing matches", () => {
    expect(filterNoteGroups(groups, "zzz")).toEqual([]);
  });
});

describe("shouldSearchOnBlur", () => {
  it("is false when normalized values are equal and true when they differ", () => {
    expect(shouldSearchOnBlur("gob", " gob ")).toBe(false);
    expect(shouldSearchOnBlur("gob", "gobl")).toBe(true);
    expect(shouldSearchOnBlur("  ", "")).toBe(false);
    expect(shouldSearchOnBlur("", "gob")).toBe(true);
  });
});

describe("expanded groups storage", () => {
  const key = expandedGroupsStorageKey("c1");

  it("builds a per-campaign key", () => {
    expect(key).toBe("noteitdown:dashboard-expanded:c1");
  });

  it("round-trips and removes the key for an empty set", () => {
    const storage = fakeStorage();
    writeExpandedGroups(storage, "c1", new Set(["NPC", "Place"]));
    expect(readExpandedGroups(storage, "c1")).toEqual(new Set(["NPC", "Place"]));
    expect(readExpandedGroups(storage, "c2")).toEqual(new Set());

    writeExpandedGroups(storage, "c1", new Set());
    expect(storage.data.has(key)).toBe(false);
  });

  it("returns an empty set for a missing key, corrupt JSON or wrong shapes", () => {
    expect(readExpandedGroups(fakeStorage(), "c1")).toEqual(new Set());
    expect(readExpandedGroups(fakeStorage({ [key]: "{nope" }), "c1")).toEqual(new Set());
    expect(readExpandedGroups(fakeStorage({ [key]: '{"a":1}' }), "c1")).toEqual(new Set());
    expect(readExpandedGroups(fakeStorage({ [key]: '["NPC",3]' }), "c1")).toEqual(new Set());
  });

  it("tolerates a throwing or null storage", () => {
    expect(readExpandedGroups(throwingStorage, "c1")).toEqual(new Set());
    expect(() => {
      writeExpandedGroups(throwingStorage, "c1", ["NPC"]);
      writeExpandedGroups(throwingStorage, "c1", []);
    }).not.toThrow();
    expect(readExpandedGroups(null, "c1")).toEqual(new Set());
    expect(() => {
      writeExpandedGroups(null, "c1", ["NPC"]);
    }).not.toThrow();
  });
});
