import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestMaybeSingleResponse, PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser } from "./helpers";

import type { Note, Relation } from "@/types";

interface RelatedNote {
  note_id: string;
  name: string;
}

interface UpdateNoteResult {
  note: Note;
  rechecked: boolean;
  added: RelatedNote[];
  removed: RelatedNote[];
}

interface DeleteNoteResult {
  name: string;
  removed: RelatedNote[];
}

interface Tenant {
  client: SupabaseClient;
  userId: string;
  campaignId: string;
}

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

async function countTypes(client: SupabaseClient, campaignId: string): Promise<number> {
  const { count } = await client
    .from("note_types")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  return count ?? 0;
}

async function createNote(client: SupabaseClient, campaignId: string, name: string, content: string): Promise<Note> {
  const response: PostgrestSingleResponse<Note> = await client.rpc("create_note", {
    p_campaign_id: campaignId,
    p_name: name,
    p_content: content,
    p_new_type_name: "NPC",
  });
  if (response.error) {
    throw new Error(`createNote: failed to create "${name}": ${response.error.message}`);
  }
  return response.data;
}

async function callUpdateNote(
  client: SupabaseClient,
  args: {
    p_campaign_id: string;
    p_note_id: string;
    p_name: string;
    p_content: string;
    p_type_id?: string | null;
    p_new_type_name?: string | null;
  },
): Promise<PostgrestSingleResponse<UpdateNoteResult>> {
  const response: PostgrestSingleResponse<UpdateNoteResult> = await client.rpc("update_note", args);
  return response;
}

async function callDeleteNote(
  client: SupabaseClient,
  args: { p_campaign_id: string; p_note_id: string },
): Promise<PostgrestSingleResponse<DeleteNoteResult>> {
  const response: PostgrestSingleResponse<DeleteNoteResult> = await client.rpc("delete_note", args);
  return response;
}

async function relationsOf(client: SupabaseClient, noteId: string): Promise<Relation[]> {
  const { data, error }: PostgrestSingleResponse<Relation[]> = await client
    .from("relations")
    .select("*")
    .or(`note_a_id.eq.${noteId},note_b_id.eq.${noteId}`);
  if (error) {
    throw new Error(`relationsOf failed: ${error.message}`);
  }
  return data;
}

async function getNote(client: SupabaseClient, noteId: string): Promise<Note | null> {
  const { data }: PostgrestMaybeSingleResponse<Note> = await client
    .from("notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();
  return data;
}

describe("update_note / delete_note", () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let npcTypeId: string;

  beforeAll(async () => {
    tenantA = await createTestUser();
    tenantB = await createTestUser();
    npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
  });

  it("content edit adding a mention reports it in `added` and stores the relation", async () => {
    const other = await createNote(tenantA.client, tenantA.campaignId, "Mira Stonehand", "A smith.");
    const note = await createNote(tenantA.client, tenantA.campaignId, "Add Subject", "Nothing yet.");

    const { data, error } = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: note.name,
      p_content: "Was seen with Mira Stonehand.",
      p_type_id: note.type_id,
    });

    expect(error).toBeNull();
    expect(data?.rechecked).toBe(true);
    expect(data?.added).toEqual([{ note_id: other.id, name: "Mira Stonehand" }]);
    expect(data?.removed).toEqual([]);
    expect(data?.note.content).toBe("Was seen with Mira Stonehand.");

    const relations = await relationsOf(tenantA.client, note.id);
    expect(relations).toHaveLength(1);
    expect([relations[0]?.note_a_id, relations[0]?.note_b_id]).toContain(other.id);
  });

  it("rename breaking a mention reports `removed`; an unchanged relation keeps its id", async () => {
    const keep = await createNote(tenantA.client, tenantA.campaignId, "Keeper Gwen", "Friend.");
    const gone = await createNote(tenantA.client, tenantA.campaignId, "Vanishing Vik", "Friend.");
    const note = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Rename Subject",
      "Knows Keeper Gwen and Vanishing Vik.",
    );
    const before = await relationsOf(tenantA.client, note.id);
    expect(before).toHaveLength(2);
    const keepRelationBefore = before.find((r) => r.note_a_id === keep.id || r.note_b_id === keep.id);

    const { data, error } = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: "Rename Subject",
      p_content: "Knows Keeper Gwen.",
      p_type_id: note.type_id,
    });

    expect(error).toBeNull();
    expect(data?.added).toEqual([]);
    expect(data?.removed).toEqual([{ note_id: gone.id, name: "Vanishing Vik" }]);

    const after = await relationsOf(tenantA.client, note.id);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(keepRelationBefore?.id);
  });

  it("a rename that breaks a mention from the other note's side is reported as removed", async () => {
    const other = await createNote(tenantA.client, tenantA.campaignId, "Mentions Oldname", "See Oldname here.");
    const note = await createNote(tenantA.client, tenantA.campaignId, "Oldname", "x");

    const { data, error } = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: "Newname",
      p_content: "x",
      p_type_id: note.type_id,
    });

    expect(error).toBeNull();
    expect(data?.rechecked).toBe(true);
    expect(data?.removed).toEqual([{ note_id: other.id, name: "Mentions Oldname" }]);
    expect(data?.added).toEqual([]);
  });

  it("type-only edit is not rechecked and reports no changes", async () => {
    const other = await createNote(tenantA.client, tenantA.campaignId, "Typeonly Friend", "x");
    const note = await createNote(tenantA.client, tenantA.campaignId, "Typeonly", "Met Typeonly Friend.");
    const placeTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "place");

    const { data, error } = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: note.name,
      p_content: note.content,
      p_type_id: placeTypeId,
    });

    expect(error).toBeNull();
    expect(data?.rechecked).toBe(false);
    expect(data?.added).toEqual([]);
    expect(data?.removed).toEqual([]);
    expect(data?.note.type_id).toBe(placeTypeId);
    expect(await relationsOf(tenantA.client, other.id)).toHaveLength(1);
  });

  it("p_new_type_name creates a custom type or reuses one case-insensitively", async () => {
    const note = await createNote(tenantA.client, tenantA.campaignId, "Newtype Subject", "x");

    const created = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: note.name,
      p_content: note.content,
      p_new_type_name: "Relic",
    });
    expect(created.error).toBeNull();
    const relicId = await findTypeId(tenantA.client, tenantA.campaignId, "relic");
    expect(created.data?.note.type_id).toBe(relicId);

    const typesBefore = await countTypes(tenantA.client, tenantA.campaignId);
    const reused = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: note.name,
      p_content: note.content,
      p_new_type_name: "rELIC",
    });
    expect(reused.error).toBeNull();
    expect(reused.data?.note.type_id).toBe(relicId);

    const predefined = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: note.name,
      p_content: note.content,
      p_new_type_name: "npc",
    });
    expect(predefined.error).toBeNull();
    expect(predefined.data?.note.type_id).toBe(npcTypeId);
    expect(await countTypes(tenantA.client, tenantA.campaignId)).toBe(typesBefore);
  });

  it("rejects both or neither type argument with 22023", async () => {
    const note = await createNote(tenantA.client, tenantA.campaignId, "Type Args Subject", "x");
    const base = {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: note.name,
      p_content: note.content,
    };

    const both = await callUpdateNote(tenantA.client, { ...base, p_type_id: npcTypeId, p_new_type_name: "Z" });
    expect(both.error?.code).toBe("22023");
    const neither = await callUpdateNote(tenantA.client, base);
    expect(neither.error?.code).toBe("22023");
  });

  it("rename to another note's name in a different case fails with 23505; own case-only rename succeeds", async () => {
    await createNote(tenantA.client, tenantA.campaignId, "Taken Name", "x");
    const note = await createNote(tenantA.client, tenantA.campaignId, "Rename Me", "x");

    const clash = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: "TAKEN NAME",
      p_content: "x",
      p_type_id: note.type_id,
    });
    expect(clash.error?.code).toBe("23505");

    const caseOnly = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: "rename me",
      p_content: "x",
      p_type_id: note.type_id,
    });
    expect(caseOnly.error).toBeNull();
    expect(caseOnly.data?.note.name).toBe("rename me");
    expect(caseOnly.data?.rechecked).toBe(true);
  });

  it("a failed update with p_new_type_name leaves no orphan custom type", async () => {
    await createNote(tenantA.client, tenantA.campaignId, "Occupied Name", "x");
    const note = await createNote(tenantA.client, tenantA.campaignId, "Orphan Guard", "x");
    const typesBefore = await countTypes(tenantA.client, tenantA.campaignId);

    const clash = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: "Occupied Name",
      p_content: "x",
      p_new_type_name: "Ghosttype",
    });

    expect(clash.error?.code).toBe("23505");
    expect(await countTypes(tenantA.client, tenantA.campaignId)).toBe(typesBefore);
  });

  it("returns P0002 for a foreign user's note or a wrong campaign id, changing nothing", async () => {
    const note = await createNote(tenantA.client, tenantA.campaignId, "Protected Note", "original");

    const foreign = await callUpdateNote(tenantB.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
      p_name: "Hijacked",
      p_content: "hijacked",
      p_type_id: npcTypeId,
    });
    expect(foreign.error?.code).toBe("P0002");

    const wrongCampaign = await callUpdateNote(tenantA.client, {
      p_campaign_id: tenantB.campaignId,
      p_note_id: note.id,
      p_name: "Hijacked",
      p_content: "hijacked",
      p_type_id: npcTypeId,
    });
    expect(wrongCampaign.error?.code).toBe("P0002");

    const foreignDelete = await callDeleteNote(tenantB.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
    });
    expect(foreignDelete.error?.code).toBe("P0002");

    const stored = await getNote(tenantA.client, note.id);
    expect(stored?.name).toBe("Protected Note");
    expect(stored?.content).toBe("original");
  });

  it("delete returns the name and every former neighbour, and leaves no relation rows", async () => {
    const zed = await createNote(tenantA.client, tenantA.campaignId, "Zed Neighbour", "x");
    const alpha = await createNote(tenantA.client, tenantA.campaignId, "alpha Neighbour", "x");
    const note = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Doomed Note",
      "Mentions Zed Neighbour and alpha Neighbour.",
    );
    // Relation in the other direction: a neighbour that mentions the doomed note.
    const reverse = await createNote(tenantA.client, tenantA.campaignId, "Mid Neighbour", "About Doomed Note.");
    expect(await relationsOf(tenantA.client, note.id)).toHaveLength(3);

    const { data, error } = await callDeleteNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: note.id,
    });

    expect(error).toBeNull();
    expect(data?.name).toBe("Doomed Note");
    expect(data?.removed).toEqual([
      { note_id: alpha.id, name: "alpha Neighbour" },
      { note_id: reverse.id, name: "Mid Neighbour" },
      { note_id: zed.id, name: "Zed Neighbour" },
    ]);
    expect(await getNote(tenantA.client, note.id)).toBeNull();
    expect(await relationsOf(tenantA.client, note.id)).toHaveLength(0);
  });

  it("delete of a missing note returns P0002", async () => {
    const { error } = await callDeleteNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_note_id: crypto.randomUUID(),
    });
    expect(error?.code).toBe("P0002");
  });
});
