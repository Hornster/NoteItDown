import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestMaybeSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser } from "./helpers";

import { createNote, getNote, listNotes } from "@/lib/services/notes";
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
});
