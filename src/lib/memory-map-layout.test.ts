import { describe, expect, it } from "vitest";

import { layoutMemoryMap } from "./memory-map-layout";

describe("layoutMemoryMap", () => {
  it("returns an empty map for empty input", () => {
    const positions = layoutMemoryMap([], []);
    expect(positions.size).toBe(0);
  });

  it("gives every id a finite x/y", () => {
    const noteIds = ["a", "b", "c", "d"];
    const relations = [
      { note_a_id: "a", note_b_id: "b" },
      { note_a_id: "b", note_b_id: "c" },
    ];

    const positions = layoutMemoryMap(noteIds, relations);

    expect(positions.size).toBe(noteIds.length);
    for (const id of noteIds) {
      const position = positions.get(id);
      expect(position).toBeDefined();
      expect(Number.isFinite(position?.x)).toBe(true);
      expect(Number.isFinite(position?.y)).toBe(true);
    }
  });

  it("gives isolated notes (no relations) positions too", () => {
    const noteIds = ["x", "y", "z"];

    const positions = layoutMemoryMap(noteIds, []);

    expect(positions.size).toBe(3);
    for (const id of noteIds) {
      const position = positions.get(id);
      expect(Number.isFinite(position?.x)).toBe(true);
      expect(Number.isFinite(position?.y)).toBe(true);
    }
  });

  it("is deterministic: the same input twice gives equal output", () => {
    const noteIds = ["n1", "n2", "n3", "n4", "n5"];
    const relations = [
      { note_a_id: "n1", note_b_id: "n2" },
      { note_a_id: "n2", note_b_id: "n3" },
      { note_a_id: "n3", note_b_id: "n4" },
    ];

    const first = layoutMemoryMap(noteIds, relations);
    const second = layoutMemoryMap(noteIds, relations);

    expect(Object.fromEntries(first)).toEqual(Object.fromEntries(second));
  });

  it("does not mutate its inputs", () => {
    const noteIds = ["p", "q", "r"];
    const relations = [{ note_a_id: "p", note_b_id: "q" }];

    const noteIdsBefore = structuredClone(noteIds);
    const relationsBefore = structuredClone(relations);

    layoutMemoryMap(noteIds, relations);

    expect(noteIds).toEqual(noteIdsBefore);
    expect(relations).toEqual(relationsBefore);
  });

  it("does not throw when a relation references an unknown id", () => {
    const noteIds = ["only-known"];
    const relations = [{ note_a_id: "only-known", note_b_id: "unknown-id" }];

    expect(() => layoutMemoryMap(noteIds, relations)).not.toThrow();

    const positions = layoutMemoryMap(noteIds, relations);
    expect(positions.size).toBe(1);
    expect(positions.has("unknown-id")).toBe(false);
  });
});
