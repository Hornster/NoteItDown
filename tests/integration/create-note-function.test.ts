import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestMaybeSingleResponse, PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser } from "./helpers";

import type { Note } from "@/types";

function errorCode(error: PostgrestSingleResponse<unknown>["error"]): string | undefined {
  return error?.code;
}

async function callCreateNote(
  client: SupabaseClient,
  args: {
    p_campaign_id: string;
    p_name: string;
    p_content: string;
    p_type_id?: string | null;
    p_new_type_name?: string | null;
  },
): Promise<PostgrestSingleResponse<Note>> {
  const response: PostgrestSingleResponse<Note> = await client.rpc("create_note", args);
  return response;
}

async function findTypeId(client: SupabaseClient, campaignId: string, name: string): Promise<string | null> {
  const { data }: PostgrestMaybeSingleResponse<{ id: string }> = await client
    .from("note_types")
    .select("id")
    .eq("campaign_id", campaignId)
    .ilike("name", name)
    .maybeSingle();
  return data?.id ?? null;
}

async function isTypePredefined(client: SupabaseClient, campaignId: string, name: string): Promise<boolean | null> {
  const { data }: PostgrestMaybeSingleResponse<{ is_predefined: boolean }> = await client
    .from("note_types")
    .select("is_predefined")
    .eq("campaign_id", campaignId)
    .ilike("name", name)
    .maybeSingle();
  return data?.is_predefined ?? null;
}

async function countRows(client: SupabaseClient, table: "notes" | "note_types", campaignId: string): Promise<number> {
  const { count } = await client.from(table).select("*", { count: "exact", head: true }).eq("campaign_id", campaignId);
  return count ?? 0;
}

describe("create_note", () => {
  let tenantA: { client: SupabaseClient; userId: string; campaignId: string };
  let tenantB: { client: SupabaseClient; userId: string; campaignId: string };

  beforeAll(async () => {
    tenantA = await createTestUser();
    tenantB = await createTestUser();
  });

  it("creates a note with a predefined type", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    expect(npcTypeId).toBeTruthy();

    const { data, error } = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Bob the Blacksmith",
      p_content: "Sells swords.",
      p_type_id: npcTypeId,
    });

    expect(error).toBeNull();
    expect(data?.name).toBe("Bob the Blacksmith");
    expect(data?.type_id).toBe(npcTypeId);
  });

  it("creates a note with a new custom type, recorded as non-predefined", async () => {
    const { error } = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "The Ashen Company",
      p_content: "A mercenary band.",
      p_new_type_name: "Faction",
    });

    expect(error).toBeNull();

    const isPredefined = await isTypePredefined(tenantA.client, tenantA.campaignId, "faction");
    expect(isPredefined).toBe(false);
  });

  it("reuses the predefined NPC type case-insensitively, creating no new type row", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const typeCountBefore = await countRows(tenantA.client, "note_types", tenantA.campaignId);

    const { data, error } = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Another NPC via lowercase type",
      p_content: "",
      p_new_type_name: "npc",
    });

    expect(error).toBeNull();
    expect(data?.type_id).toBe(npcTypeId);

    const typeCountAfter = await countRows(tenantA.client, "note_types", tenantA.campaignId);
    expect(typeCountAfter).toBe(typeCountBefore);
  });

  it("rejects a duplicate note name (case-insensitive) with 23505, leaving no orphan type", async () => {
    const name = "Unique Duplicate Test Note";
    const first = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: name,
      p_content: "first",
      p_new_type_name: "Duplicate Test Type",
    });
    expect(first.error).toBeNull();

    const typeCountBefore = await countRows(tenantA.client, "note_types", tenantA.campaignId);

    const second = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: name.toLowerCase(),
      p_content: "second",
      p_new_type_name: "Another New Type",
    });

    expect(errorCode(second.error)).toBe("23505");

    const typeCountAfter = await countRows(tenantA.client, "note_types", tenantA.campaignId);
    expect(typeCountAfter).toBe(typeCountBefore);
  });

  it("rejects both type arguments and neither with 22023", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");

    const both = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Both Args Note",
      p_content: "",
      p_type_id: npcTypeId,
      p_new_type_name: "Some New Type",
    });
    expect(errorCode(both.error)).toBe("22023");

    const neither = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Neither Arg Note",
      p_content: "",
    });
    expect(errorCode(neither.error)).toBe("22023");
  });

  it("rejects tenant B using tenant A's campaign id with an existing type id, unchanged counts", async () => {
    const npcTypeIdA = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const notesCountBefore = await countRows(tenantA.client, "notes", tenantA.campaignId);
    const typesCountBefore = await countRows(tenantA.client, "note_types", tenantA.campaignId);

    const { error } = await callCreateNote(tenantB.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Cross Tenant Note A",
      p_content: "",
      p_type_id: npcTypeIdA,
    });

    expect(errorCode(error)).toBe("42501");
    expect(await countRows(tenantA.client, "notes", tenantA.campaignId)).toBe(notesCountBefore);
    expect(await countRows(tenantA.client, "note_types", tenantA.campaignId)).toBe(typesCountBefore);
  });

  it("rejects tenant B using tenant A's campaign id with a new type name, unchanged counts", async () => {
    const notesCountBefore = await countRows(tenantA.client, "notes", tenantA.campaignId);
    const typesCountBefore = await countRows(tenantA.client, "note_types", tenantA.campaignId);

    const { error } = await callCreateNote(tenantB.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Cross Tenant Note B",
      p_content: "",
      p_new_type_name: "Faction",
    });

    expect(errorCode(error)).toBe("42501");
    expect(await countRows(tenantA.client, "notes", tenantA.campaignId)).toBe(notesCountBefore);
    expect(await countRows(tenantA.client, "note_types", tenantA.campaignId)).toBe(typesCountBefore);
  });

  it("rejects tenant B's own campaign with tenant A's type id (FK failure)", async () => {
    const npcTypeIdA = await findTypeId(tenantA.client, tenantA.campaignId, "npc");

    const { error } = await callCreateNote(tenantB.client, {
      p_campaign_id: tenantB.campaignId,
      p_name: "Wrong Campaign Type Note",
      p_content: "",
      p_type_id: npcTypeIdA,
    });

    expect(errorCode(error)).toBe("23503");
  });

  it("rejects a name over 120 chars and content over 20000 chars with 23514", async () => {
    const npcTypeId = await findTypeId(tenantA.client, tenantA.campaignId, "npc");

    const tooLongName = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "a".repeat(121),
      p_content: "",
      p_type_id: npcTypeId,
    });
    expect(errorCode(tooLongName.error)).toBe("23514");

    const tooLongContent = await callCreateNote(tenantA.client, {
      p_campaign_id: tenantA.campaignId,
      p_name: "Content Length Test Note",
      p_content: "a".repeat(20001),
      p_type_id: npcTypeId,
    });
    expect(errorCode(tooLongContent.error)).toBe("23514");
  });
});
