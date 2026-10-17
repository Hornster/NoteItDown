import { describe, expect, it } from "vitest";
import { centerZoom, findMatchingNoteIds, mapSearchOutcome, MAP_SEARCH_MIN_CENTER_ZOOM } from "./map-search";

const notes = [
  { id: "1", name: "Hobgoblin Chief" },
  { id: "2", name: "Alice" },
  { id: "3", name: "Goblin 2" },
  { id: "4", name: "Tavern" },
];

describe("findMatchingNoteIds", () => {
  it("returns no ids for an empty or whitespace-only query", () => {
    expect(findMatchingNoteIds(notes, "")).toEqual([]);
    expect(findMatchingNoteIds(notes, "   ")).toEqual([]);
  });

  it("matches a substring case-insensitively, in input order", () => {
    expect(findMatchingNoteIds(notes, "GOB")).toEqual(["1", "3"]);
  });

  it("returns no ids when nothing matches", () => {
    expect(findMatchingNoteIds(notes, "zzz")).toEqual([]);
  });

  it("returns every id when the query matches every note", () => {
    expect(findMatchingNoteIds(notes.slice(0, 3), "i")).toEqual(["1", "2", "3"]);
  });
});

describe("mapSearchOutcome", () => {
  it("is idle for an empty or whitespace-only query", () => {
    expect(mapSearchOutcome("", [])).toEqual({ kind: "idle" });
    expect(mapSearchOutcome("   ", ["1"])).toEqual({ kind: "idle" });
  });

  it("is none when a query has no matches", () => {
    expect(mapSearchOutcome("zzz", [])).toEqual({ kind: "none" });
  });

  it("is one with the id for exactly one match", () => {
    expect(mapSearchOutcome("alice", ["2"])).toEqual({ kind: "one", id: "2" });
  });

  it("is many with ids in input order for several matches", () => {
    expect(mapSearchOutcome("gob", ["1", "3"])).toEqual({ kind: "many", ids: ["1", "3"] });
  });

  it("is many when the query matches every note", () => {
    const ids = findMatchingNoteIds(notes.slice(0, 3), "i");
    expect(mapSearchOutcome("i", ids)).toEqual({ kind: "many", ids: ["1", "2", "3"] });
  });
});

describe("centerZoom", () => {
  it("raises a zoom below the minimum, and keeps equal and higher zooms", () => {
    expect(centerZoom(0.4)).toBe(MAP_SEARCH_MIN_CENTER_ZOOM);
    expect(centerZoom(1)).toBe(1);
    expect(centerZoom(1.8)).toBe(1.8);
  });
});
