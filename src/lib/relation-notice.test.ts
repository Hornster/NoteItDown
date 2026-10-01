import { describe, expect, it } from "vitest";
import { RELATION_NOTICE_KEY, takeRelationNotice, writeRelationNotice, type RelationNotice } from "./relation-notice";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

const editNotice: RelationNotice = {
  kind: "edit",
  noteId: "n1",
  noteName: "Bob",
  rechecked: true,
  added: [{ note_id: "00000000-0000-4000-8000-000000000002", name: "Alice" }],
  removed: [],
};

describe("relation notice", () => {
  it("returns the notice for a matching target and clears the key", () => {
    const storage = fakeStorage();
    writeRelationNotice(storage, editNotice);
    expect(takeRelationNotice(storage, { kind: "edit", noteId: "n1" })).toEqual(editNotice);
    expect(storage.data.has(RELATION_NOTICE_KEY)).toBe(false);
  });

  it("supports the delete kind", () => {
    const storage = fakeStorage();
    const notice: RelationNotice = { kind: "delete", campaignId: "c1", noteName: "Bob", removed: [] };
    writeRelationNotice(storage, notice);
    expect(takeRelationNotice(storage, { kind: "delete", campaignId: "c1" })).toEqual(notice);
  });

  it("returns null on a mismatched target but still clears the key", () => {
    const storage = fakeStorage();
    writeRelationNotice(storage, editNotice);
    expect(takeRelationNotice(storage, { kind: "edit", noteId: "other" })).toBeNull();
    expect(storage.data.has(RELATION_NOTICE_KEY)).toBe(false);

    writeRelationNotice(storage, editNotice);
    expect(takeRelationNotice(storage, { kind: "delete", campaignId: "n1" })).toBeNull();
  });

  it("returns null for malformed JSON or a wrong shape", () => {
    expect(
      takeRelationNotice(fakeStorage({ [RELATION_NOTICE_KEY]: "{nope" }), { kind: "edit", noteId: "n1" }),
    ).toBeNull();
    const wrong = JSON.stringify({ kind: "edit", noteId: "n1" });
    const storage = fakeStorage({ [RELATION_NOTICE_KEY]: wrong });
    expect(takeRelationNotice(storage, { kind: "edit", noteId: "n1" })).toBeNull();
    expect(storage.data.has(RELATION_NOTICE_KEY)).toBe(false);
  });

  it("returns null when a relation item is malformed", () => {
    const target = { kind: "edit", noteId: "n1" } as const;
    const items: unknown[] = [
      { name: "Alice" },
      { note_id: "../x", name: "Alice" },
      { note_id: editNotice.added[0]?.note_id, name: 1 },
    ];
    for (const item of items) {
      const raw = JSON.stringify({ ...editNotice, added: [item] });
      expect(takeRelationNotice(fakeStorage({ [RELATION_NOTICE_KEY]: raw }), target)).toBeNull();
    }
  });

  it("returns null for a delete notice from another campaign", () => {
    const storage = fakeStorage();
    writeRelationNotice(storage, { kind: "delete", campaignId: "c1", noteName: "Bob", removed: [] });
    expect(takeRelationNotice(storage, { kind: "delete", campaignId: "c2" })).toBeNull();
  });

  it("returns null when the stored JSON is not an object", () => {
    expect(
      takeRelationNotice(fakeStorage({ [RELATION_NOTICE_KEY]: "null" }), { kind: "edit", noteId: "n1" }),
    ).toBeNull();
  });

  it("returns null when there is nothing stored", () => {
    expect(takeRelationNotice(fakeStorage(), { kind: "edit", noteId: "n1" })).toBeNull();
  });

  it("never throws when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => {
      writeRelationNotice(throwing, editNotice);
    }).not.toThrow();
    expect(takeRelationNotice(throwing, { kind: "edit", noteId: "n1" })).toBeNull();
  });
});
