import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestMaybeSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser } from "./helpers";

import { createNote, deleteNote, getNote, listNotes, updateNote } from "@/lib/services/notes";
import { countNoteRelations } from "@/lib/services/relations";
import type { CreateNoteCommand } from "@/types";

async function findTypeId(client: SupabaseClient, campaignId: string, name: string): Promise<string> {
  const { data }: PostgrestMaybeSingleResponse<{ id: string }> = await client
    .from("note_types")
    .select("id")
    .eq("campaign_id", campaignId)
    .ilike("name", name)
    .maybeSingle();
  if (!data) {
    throw new Error(`findTypeId: no type named ${name} in campaign ${campaignId}`);
  }
  return data.id;
}

describe("notes service", () => {
  let tenantA: { client: SupabaseClient; userId: string; campaignId: string };
  let tenantB: { client: SupabaseClient; userId: string; campaignId: string };

  beforeAll(async () => {
    tenantA = await createTestUser();
    tenantB = await createTestUser();
  });

  it("createNote maps a duplicate name to duplicate_name", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const command: CreateNoteCommand = {
      name: "Service Duplicate Note",
      content: "first",
      type: { kind: "existing", id: npcTypeId },
    };

    const first = await createNote(tenantA.client, tenantA.campaignId, command);
    expect(first.success).toBe(true);

    const second = await createNote(tenantA.client, tenantA.campaignId, {
      ...command,
      name: command.name.toLowerCase(),
      content: "second",
    });
    expect(second.success).toBe(false);
    expect(!second.success && second.reason).toBe("duplicate_name");
  });

  it("createNote maps a foreign type id to invalid_type", async () => {
    const npcTypeIdA = await findTypeId(tenantA.client, tenantA.campaignId, "npc");

    const result = await createNote(tenantB.client, tenantB.campaignId, {
      name: "Service Foreign Type Note",
      content: "",
      type: { kind: "existing", id: npcTypeIdA },
    });

    expect(result.success).toBe(false);
    expect(!result.success && result.reason).toBe("invalid_type");
  });

  it("listNotes is newest-first with type names", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const placeTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "place");

    const older = await createNote(tenantA.client, tenantA.campaignId, {
      name: "Service Order Note Older",
      content: "",
      type: { kind: "existing", id: npcTypeId },
    });
    expect(older.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const newer = await createNote(tenantA.client, tenantA.campaignId, {
      name: "Service Order Note Newer",
      content: "",
      type: { kind: "existing", id: placeTypeId },
    });
    expect(newer.success).toBe(true);

    const notes = await listNotes(tenantA.client, tenantA.campaignId);
    const olderIndex = notes.findIndex((n) => n.name === "Service Order Note Older");
    const newerIndex = notes.findIndex((n) => n.name === "Service Order Note Newer");
    expect(olderIndex).toBeGreaterThan(-1);
    expect(newerIndex).toBeGreaterThan(-1);
    expect(newerIndex).toBeLessThan(olderIndex);

    const newerNote = notes[newerIndex];
    expect(newerNote.type_name).toBe("Place");
  });

  it("getNote returns null for another tenant's note", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const created = await createNote(tenantA.client, tenantA.campaignId, {
      name: "Service Cross Tenant Get Note",
      content: "secret",
      type: { kind: "existing", id: npcTypeId },
    });
    expect(created.success).toBe(true);
    const noteId = created.success ? created.note.id : "";

    const asOwner = await getNote(tenantA.client, noteId);
    expect(asOwner?.id).toBe(noteId);

    const asOther = await getNote(tenantB.client, noteId);
    expect(asOther).toBeNull();
  });

  describe("updateNote / deleteNote / countNoteRelations", () => {
    async function makeNote(name: string, content = ""): Promise<{ id: string; typeId: string }> {
      const typeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
      const created = await createNote(tenantA.client, tenantA.campaignId, {
        name,
        content,
        type: { kind: "existing", id: typeId },
      });
      if (!created.success) {
        throw new Error(`makeNote failed: ${created.reason}`);
      }
      return { id: created.note.id, typeId };
    }

    it("updateNote returns the change set on success", async () => {
      const { id, typeId } = await makeNote("Svc Upd Base");
      const result = await updateNote(tenantA.client, tenantA.campaignId, id, {
        name: "Svc Upd Renamed",
        content: "new body",
        type: { kind: "existing", id: typeId },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes.id).toBe(id);
        expect(result.changes.name).toBe("Svc Upd Renamed");
        expect(result.changes.rechecked).toBe(true);
        expect(result.changes.added).toEqual([]);
        expect(result.changes.removed).toEqual([]);
      }
    });

    it("updateNote maps a missing or foreign note to not_found", async () => {
      const { id, typeId } = await makeNote("Svc Upd Foreign");
      const command = { name: "x", content: "", type: { kind: "existing" as const, id: typeId } };

      const missing = await updateNote(tenantA.client, tenantA.campaignId, crypto.randomUUID(), command);
      expect(!missing.success && missing.reason).toBe("not_found");

      const foreign = await updateNote(tenantB.client, tenantB.campaignId, id, command);
      expect(!foreign.success && foreign.reason).toBe("not_found");
    });

    it("updateNote maps a duplicate name to duplicate_name", async () => {
      await makeNote("Svc Upd Dup Taken");
      const { id, typeId } = await makeNote("Svc Upd Dup Other");
      const result = await updateNote(tenantA.client, tenantA.campaignId, id, {
        name: "svc upd dup taken",
        content: "",
        type: { kind: "existing", id: typeId },
      });
      expect(!result.success && result.reason).toBe("duplicate_name");
    });

    it("updateNote maps a foreign type id to invalid_type", async () => {
      const { id } = await makeNote("Svc Upd Bad Type");
      const foreignTypeId = await findTypeId(tenantB.client, tenantB.campaignId, "npc");
      const result = await updateNote(tenantA.client, tenantA.campaignId, id, {
        name: "Svc Upd Bad Type",
        content: "",
        type: { kind: "existing", id: foreignTypeId },
      });
      expect(!result.success && result.reason).toBe("invalid_type");
    });

    it("deleteNote removes the note, reports its relations, and maps a missing note to not_found", async () => {
      const target = await makeNote("Svc Del Target");
      const linker = await makeNote("Svc Del Linker", "mentions Svc Del Target here");

      expect(await countNoteRelations(tenantA.client, target.id)).toBe(1);
      expect(await countNoteRelations(tenantB.client, target.id)).toBe(0);

      const foreign = await deleteNote(tenantB.client, tenantB.campaignId, target.id);
      expect(!foreign.success && foreign.reason).toBe("not_found");

      const result = await deleteNote(tenantA.client, tenantA.campaignId, target.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes.name).toBe("Svc Del Target");
        expect(result.changes.removed).toEqual([{ note_id: linker.id, name: "Svc Del Linker" }]);
      }

      expect(await getNote(tenantA.client, target.id)).toBeNull();
      expect(await countNoteRelations(tenantA.client, linker.id)).toBe(0);

      const again = await deleteNote(tenantA.client, tenantA.campaignId, target.id);
      expect(!again.success && again.reason).toBe("not_found");
    });
  });
});
