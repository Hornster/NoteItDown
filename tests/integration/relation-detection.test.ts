import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestMaybeSingleResponse, PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser } from "./helpers";

import type { Note, Relation } from "@/types";

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

async function rpcCreateNote(
  client: SupabaseClient,
  args: { p_campaign_id: string; p_name: string; p_content: string; p_new_type_name: string },
): Promise<PostgrestSingleResponse<Note>> {
  const response: PostgrestSingleResponse<Note> = await client.rpc("create_note", args);
  return response;
}

/** Creates a note via the create_note RPC, reusing the predefined NPC type. */
async function createNote(client: SupabaseClient, campaignId: string, name: string, content: string): Promise<Note> {
  const { data, error } = await rpcCreateNote(client, {
    p_campaign_id: campaignId,
    p_name: name,
    p_content: content,
    p_new_type_name: "NPC",
  });
  if (error) {
    throw new Error(`createNote: failed to create "${name}": ${error.message}`);
  }
  return data;
}

/** Inserts a note directly into the table (bypassing create_note), to test that write path. */
async function insertNoteDirect(
  client: SupabaseClient,
  campaignId: string,
  typeId: string,
  name: string,
  content: string,
): Promise<Note> {
  const { data, error }: PostgrestSingleResponse<Note> = await client
    .from("notes")
    .insert({ campaign_id: campaignId, type_id: typeId, name, content })
    .select()
    .single();
  if (error) {
    throw new Error(`insertNoteDirect: failed to insert "${name}": ${error.message}`);
  }
  return data;
}

async function rpcNoteMentions(
  client: SupabaseClient,
  args: { p_content: string; p_name: string },
): Promise<PostgrestSingleResponse<boolean>> {
  const response: PostgrestSingleResponse<boolean> = await client.rpc("note_mentions", args);
  return response;
}

async function callNoteMentions(client: SupabaseClient, content: string, name: string): Promise<boolean | null> {
  const { data, error } = await rpcNoteMentions(client, { p_content: content, p_name: name });
  if (error) {
    throw new Error(`note_mentions rpc failed: ${error.message}`);
  }
  return data;
}

function sortIds(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

async function getRelation(
  client: SupabaseClient,
  campaignId: string,
  idA: string,
  idB: string,
): Promise<Relation | null> {
  const [note_a_id, note_b_id] = sortIds(idA, idB);
  const { data }: PostgrestMaybeSingleResponse<Relation> = await client
    .from("relations")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("note_a_id", note_a_id)
    .eq("note_b_id", note_b_id)
    .maybeSingle();
  return data ?? null;
}

async function countRelationsInvolving(client: SupabaseClient, campaignId: string, noteId: string): Promise<number> {
  const { count } = await client
    .from("relations")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .or(`note_a_id.eq.${noteId},note_b_id.eq.${noteId}`);
  return count ?? 0;
}

describe("relation detection", () => {
  let tenantA: { client: SupabaseClient; userId: string; campaignId: string };
  let tenantB: { client: SupabaseClient; userId: string; campaignId: string };

  beforeAll(async () => {
    tenantA = await createTestUser();
    tenantB = await createTestUser();
  });

  describe("note_mentions", () => {
    const cases: { content: string; name: string; expected: boolean }[] = [
      { content: "the Inn.", name: "Inn", expected: true },
      { content: "Winnie", name: "Inn", expected: false },
      { content: "w Łódź.", name: "Łódź", expected: true },
      { content: "Mr. (Bob) came", name: "Mr. (Bob)", expected: true },
      { content: "xMr. (Bob)y", name: "Mr. (Bob)", expected: false },
      { content: "abc", name: "a.c", expected: false },
      { content: "INN", name: "inn", expected: true },
      { content: "Bobby", name: "Bob", expected: false },
      { content: "Bob's", name: "Bob", expected: true },
    ];

    it.each(cases)('"$content" mentions "$name" -> $expected', async ({ content, name, expected }) => {
      const result = await callNoteMentions(tenantA.client, content, name);
      expect(result).toBe(expected);
    });
  });

  it("creates one relation, sorted ids, correct campaign_id, when the new note's content mentions an existing note", async () => {
    const target = await createNote(tenantA.client, tenantA.campaignId, "Zorvath Keep", "");
    const mentioner = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Anchor Point Alpha",
      "The scouts visited Zorvath Keep last night.",
    );

    const relation = await getRelation(tenantA.client, tenantA.campaignId, target.id, mentioner.id);
    expect(relation).not.toBeNull();
    expect(relation?.campaign_id).toBe(tenantA.campaignId);

    const [expectedA, expectedB] = sortIds(target.id, mentioner.id);
    expect(relation?.note_a_id).toBe(expectedA);
    expect(relation?.note_b_id).toBe(expectedB);
    expect(relation && relation.note_a_id < relation.note_b_id).toBe(true);
  });

  it("creates a relation when an existing note's content mentions the new note's name (reverse direction)", async () => {
    const existing = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Mentioner Delta",
      "This text references Quillfeather Tower.",
    );
    const newNote = await createNote(tenantA.client, tenantA.campaignId, "Quillfeather Tower", "");

    const relation = await getRelation(tenantA.client, tenantA.campaignId, existing.id, newNote.id);
    expect(relation).not.toBeNull();
  });

  it("creates exactly one relation when both notes mention each other", async () => {
    const noteM = await createNote(tenantA.client, tenantA.campaignId, "Karthenwyle Ridge", "");
    const noteN = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Hollowmere Bastion",
      "Karthenwyle Ridge sent word.",
    );

    const initial = await getRelation(tenantA.client, tenantA.campaignId, noteM.id, noteN.id);
    expect(initial).not.toBeNull();

    const { error } = await tenantA.client
      .from("notes")
      .update({ content: "Hollowmere Bastion replied in kind." })
      .eq("id", noteM.id);
    expect(error).toBeNull();

    const relation = await getRelation(tenantA.client, tenantA.campaignId, noteM.id, noteN.id);
    expect(relation).not.toBeNull();
    expect(await countRelationsInvolving(tenantA.client, tenantA.campaignId, noteM.id)).toBe(1);
  });

  it("does not create a self-relation when a note's own content contains its own name", async () => {
    const note = await createNote(tenantA.client, tenantA.campaignId, "Xandorin Crypt", "The Xandorin Crypt is old.");

    expect(await countRelationsInvolving(tenantA.client, tenantA.campaignId, note.id)).toBe(0);
  });

  it("creates a relation from a direct table insert", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const target = await createNote(tenantA.client, tenantA.campaignId, "Glasswick Ferry", "");
    const inserted = await insertNoteDirect(
      tenantA.client,
      tenantA.campaignId,
      npcTypeId,
      "Direct Insert Note",
      "Glasswick Ferry is nearby.",
    );

    const relation = await getRelation(tenantA.client, tenantA.campaignId, target.id, inserted.id);
    expect(relation).not.toBeNull();
  });

  it("a direct update removing a mention deletes the relation; adding one back recreates it", async () => {
    const target = await createNote(tenantA.client, tenantA.campaignId, "Emberwrit Cairn", "");
    const mentioner = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Anchor Point Zeta",
      "First mention of Emberwrit Cairn here.",
    );

    expect(await getRelation(tenantA.client, tenantA.campaignId, target.id, mentioner.id)).not.toBeNull();

    const removed = await tenantA.client.from("notes").update({ content: "" }).eq("id", mentioner.id);
    expect(removed.error).toBeNull();
    expect(await getRelation(tenantA.client, tenantA.campaignId, target.id, mentioner.id)).toBeNull();

    const added = await tenantA.client
      .from("notes")
      .update({ content: "Second mention of Emberwrit Cairn." })
      .eq("id", mentioner.id);
    expect(added.error).toBeNull();
    expect(await getRelation(tenantA.client, tenantA.campaignId, target.id, mentioner.id)).not.toBeNull();
  });

  it("re-detects relations on rename", async () => {
    const renamed = await createNote(tenantA.client, tenantA.campaignId, "Original Name Gamma", "");
    const mentioner = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Mentioner Epsilon",
      "This text references Renamed Target Beta.",
    );

    expect(await getRelation(tenantA.client, tenantA.campaignId, renamed.id, mentioner.id)).toBeNull();

    const { error } = await tenantA.client.from("notes").update({ name: "Renamed Target Beta" }).eq("id", renamed.id);
    expect(error).toBeNull();

    expect(await getRelation(tenantA.client, tenantA.campaignId, renamed.id, mentioner.id)).not.toBeNull();
  });

  it("creates no relation across tenants when tenant B's note names tenant A's note", async () => {
    const noteA = await createNote(tenantA.client, tenantA.campaignId, "Vorthak Sentinel", "");
    const before = await countRelationsInvolving(tenantA.client, tenantA.campaignId, noteA.id);

    const noteB = await createNote(
      tenantB.client,
      tenantB.campaignId,
      "Foreign Mentioner",
      "Vorthak Sentinel keeps watch.",
    );

    expect(await countRelationsInvolving(tenantA.client, tenantA.campaignId, noteA.id)).toBe(before);
    expect(await countRelationsInvolving(tenantB.client, tenantB.campaignId, noteB.id)).toBe(0);
  });

  it("removes relations when a note is deleted (cascade)", async () => {
    const noteP = await createNote(tenantA.client, tenantA.campaignId, "Yewthorn Gallows", "");
    const noteQ = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Nightfarer Ledger",
      "Yewthorn Gallows stands at the crossroads.",
    );

    expect(await getRelation(tenantA.client, tenantA.campaignId, noteP.id, noteQ.id)).not.toBeNull();

    const { error } = await tenantA.client.from("notes").delete().eq("id", noteP.id);
    expect(error).toBeNull();

    expect(await getRelation(tenantA.client, tenantA.campaignId, noteP.id, noteQ.id)).toBeNull();
  });

  it("recompute_campaign_relations restores a deleted relation and is idempotent", async () => {
    const noteU = await createNote(tenantA.client, tenantA.campaignId, "Obscura Wellspring", "");
    const noteV = await createNote(
      tenantA.client,
      tenantA.campaignId,
      "Trench of Karvellis",
      "Obscura Wellspring lies below.",
    );

    const before = await getRelation(tenantA.client, tenantA.campaignId, noteU.id, noteV.id);
    expect(before).not.toBeNull();

    const [note_a_id, note_b_id] = sortIds(noteU.id, noteV.id);
    const del = await tenantA.client
      .from("relations")
      .delete()
      .eq("campaign_id", tenantA.campaignId)
      .eq("note_a_id", note_a_id)
      .eq("note_b_id", note_b_id);
    expect(del.error).toBeNull();
    expect(await getRelation(tenantA.client, tenantA.campaignId, noteU.id, noteV.id)).toBeNull();

    const firstCall = await tenantA.client.rpc("recompute_campaign_relations", {
      p_campaign_id: tenantA.campaignId,
    });
    expect(firstCall.error).toBeNull();
    expect(await getRelation(tenantA.client, tenantA.campaignId, noteU.id, noteV.id)).not.toBeNull();

    const secondCall = await tenantA.client.rpc("recompute_campaign_relations", {
      p_campaign_id: tenantA.campaignId,
    });
    expect(secondCall.error).toBeNull();
    expect(await countRelationsInvolving(tenantA.client, tenantA.campaignId, noteU.id)).toBe(1);
  });
});
