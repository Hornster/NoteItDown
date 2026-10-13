import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser } from "./helpers";

import { PG_ERROR } from "@/lib/constants/db-error-codes";
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  renameCampaign,
  resolveLandingCampaign,
} from "@/lib/services/campaigns";
import { createNote } from "@/lib/services/notes";
import { listRelations } from "@/lib/services/relations";
import type { NoteType } from "@/types";

async function listTypeNames(client: SupabaseClient, campaignId: string): Promise<string[]> {
  const { data, error }: PostgrestResponse<Pick<NoteType, "name">> = await client
    .from("note_types")
    .select("name")
    .eq("campaign_id", campaignId);
  if (error) {
    throw new Error(`listTypeNames: query failed: ${error.message}`);
  }
  return data.map((row) => row.name);
}

async function findTypeId(client: SupabaseClient, campaignId: string, name: string): Promise<string> {
  const { data } = await client
    .from("note_types")
    .select("id")
    .eq("campaign_id", campaignId)
    .ilike("name", name)
    .maybeSingle<{ id: string }>();
  if (!data) {
    throw new Error(`findTypeId: no type named ${name} in campaign ${campaignId}`);
  }
  return data.id;
}

describe("campaigns service", () => {
  let tenantA: { client: SupabaseClient; userId: string; campaignId: string };
  let tenantB: { client: SupabaseClient; userId: string; campaignId: string };

  beforeAll(async () => {
    tenantA = await createTestUser();
    tenantB = await createTestUser();
  });

  it("createCampaign creates a campaign seeded with the 4 predefined note types", async () => {
    const result = await createCampaign(tenantA.client, tenantA.userId, "Second Campaign");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.campaign.owner_id).toBe(tenantA.userId);
    expect(result.campaign.name).toBe("Second Campaign");

    const typeNames = await listTypeNames(tenantA.client, result.campaign.id);
    expect(typeNames.sort()).toEqual(["NPC", "Observation", "Place", "Quest"].sort());
  });

  it("createCampaign maps a duplicate name (case-insensitive) to duplicate_name", async () => {
    const first = await createCampaign(tenantA.client, tenantA.userId, "Duplicate Campaign");
    expect(first.success).toBe(true);

    const second = await createCampaign(tenantA.client, tenantA.userId, "duplicate campaign");
    expect(second.success).toBe(false);
    expect(!second.success && second.reason).toBe("duplicate_name");
  });

  it("a direct insert with padded whitespace fails with 23514", async () => {
    const { error } = await tenantA.client.from("campaigns").insert({
      owner_id: tenantA.userId,
      name: " padded",
    });
    expect(error?.code).toBe(PG_ERROR.CHECK_VIOLATION);
  });

  it("a direct insert with an 81-char name fails with 23514", async () => {
    const { error } = await tenantA.client.from("campaigns").insert({
      owner_id: tenantA.userId,
      name: "a".repeat(81),
    });
    expect(error?.code).toBe(PG_ERROR.CHECK_VIOLATION);
  });

  it("renameCampaign succeeds, and the DB check rejects an untrimmed name", async () => {
    const created = await createCampaign(tenantA.client, tenantA.userId, "Rename Source Campaign");
    expect(created.success).toBe(true);
    if (!created.success) return;

    const renamed = await renameCampaign(tenantA.client, created.campaign.id, "Renamed Campaign");
    expect(renamed.success).toBe(true);
    if (!renamed.success) return;
    expect(renamed.campaign.name).toBe("Renamed Campaign");

    const fetched = await getCampaign(tenantA.client, created.campaign.id);
    expect(fetched?.name).toBe("Renamed Campaign");

    // zod trims at the API boundary; the DB refuses anything that bypasses it untrimmed.
    const padded = await renameCampaign(tenantA.client, created.campaign.id, "  Renamed Campaign  ");
    expect(padded.success).toBe(false);
    expect(!padded.success && padded.reason).toBe("unexpected");
    expect(!padded.success && padded.reason === "unexpected" && (padded.error as { code?: string }).code).toBe(
      PG_ERROR.CHECK_VIOLATION,
    );
  });

  it("renameCampaign to another own campaign's name maps to duplicate_name", async () => {
    const first = await createCampaign(tenantA.client, tenantA.userId, "Rename Collision One");
    const second = await createCampaign(tenantA.client, tenantA.userId, "Rename Collision Two");
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;

    const result = await renameCampaign(tenantA.client, second.campaign.id, "Rename Collision One");
    expect(result.success).toBe(false);
    expect(!result.success && result.reason).toBe("duplicate_name");
  });

  it("renaming tenant B's campaign as tenant A maps to not_found", async () => {
    const bBefore = await getCampaign(tenantB.client, tenantB.campaignId);
    expect(bBefore?.name).toBe("My Campaign");

    const result = await renameCampaign(tenantA.client, tenantB.campaignId, "Hijacked Name");
    expect(result.success).toBe(false);
    expect(!result.success && result.reason).toBe("not_found");

    // not_found must mean no row was written: the owner still sees the original name.
    expect((await getCampaign(tenantB.client, tenantB.campaignId))?.name).toBe(bBefore?.name);
  });

  it("renaming tenant A's campaign as tenant B maps to not_found and leaves A's name unchanged", async () => {
    const aBefore = await getCampaign(tenantA.client, tenantA.campaignId);
    expect(aBefore).not.toBeNull();

    const result = await renameCampaign(tenantB.client, tenantA.campaignId, "Hijacked Name");
    expect(result.success).toBe(false);
    expect(!result.success && result.reason).toBe("not_found");

    expect((await getCampaign(tenantA.client, tenantA.campaignId))?.name).toBe(aBefore?.name);
  });

  it("renaming a malformed id maps to not_found", async () => {
    const result = await renameCampaign(tenantA.client, "not-a-uuid", "Whatever");
    expect(result.success).toBe(false);
    expect(!result.success && result.reason).toBe("not_found");
  });

  it("getCampaign returns null for another tenant's id and for a malformed id", async () => {
    expect(await getCampaign(tenantA.client, tenantB.campaignId)).toBeNull();
    expect(await getCampaign(tenantA.client, "not-a-uuid")).toBeNull();
  });

  it("listCampaigns returns oldest first with the signup default first", async () => {
    const first = await createCampaign(tenantA.client, tenantA.userId, "List Order First");
    const second = await createCampaign(tenantA.client, tenantA.userId, "List Order Second");
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;

    const campaigns = await listCampaigns(tenantA.client);
    expect(campaigns[0].id).toBe(tenantA.campaignId);
    expect(campaigns[0].name).toBe("My Campaign");
    expect(campaigns.slice(-2).map((c) => c.id)).toEqual([first.campaign.id, second.campaign.id]);
  });

  it("listCampaigns never contains another tenant's campaign ids", async () => {
    const own = await listCampaigns(tenantA.client);
    const foreign = await listCampaigns(tenantB.client);
    expect(own.length).toBeGreaterThan(0);
    expect(foreign.length).toBeGreaterThan(0);

    const foreignIds = new Set(foreign.map((c) => c.id));
    expect(own.some((c) => foreignIds.has(c.id))).toBe(false);
    expect(own.map((c) => c.id)).not.toContain(tenantB.campaignId);
    expect(foreign.map((c) => c.id)).not.toContain(tenantA.campaignId);
  });

  it("resolveLandingCampaign returns the cookie campaign when owned", async () => {
    const created = await createCampaign(tenantA.client, tenantA.userId, "Landing Cookie Campaign");
    expect(created.success).toBe(true);
    if (!created.success) return;

    const resolved = await resolveLandingCampaign(tenantA.client, created.campaign.id);
    expect(resolved?.id).toBe(created.campaign.id);
  });

  it("resolveLandingCampaign falls back to the oldest for undefined, a foreign id and a malformed id", async () => {
    const forUndefined = await resolveLandingCampaign(tenantA.client, undefined);
    expect(forUndefined?.id).toBe(tenantA.campaignId);

    const forForeign = await resolveLandingCampaign(tenantA.client, tenantB.campaignId);
    expect(forForeign?.id).toBe(tenantA.campaignId);

    const forMalformed = await resolveLandingCampaign(tenantA.client, "not-a-uuid");
    expect(forMalformed?.id).toBe(tenantA.campaignId);
  });

  it("a note in campaign 2 mentioning a campaign 1 note name produces no relation in either campaign", async () => {
    const secondCampaign = await createCampaign(tenantA.client, tenantA.userId, "Relation Isolation Campaign");
    expect(secondCampaign.success).toBe(true);
    if (!secondCampaign.success) return;

    const npcTypeIdCampaign1 = await findTypeId(tenantA.client, tenantA.campaignId, "npc");
    const noteInCampaign1 = await createNote(tenantA.client, tenantA.campaignId, {
      name: "Isolation Target Note",
      content: "",
      type: { kind: "existing", id: npcTypeIdCampaign1 },
    });
    expect(noteInCampaign1.success).toBe(true);
    if (!noteInCampaign1.success) return;

    const npcTypeIdCampaign2 = await findTypeId(tenantA.client, secondCampaign.campaign.id, "npc");
    const noteInCampaign2 = await createNote(tenantA.client, secondCampaign.campaign.id, {
      name: "Isolation Mentioner Note",
      content: "This mentions Isolation Target Note.",
      type: { kind: "existing", id: npcTypeIdCampaign2 },
    });
    expect(noteInCampaign2.success).toBe(true);

    const targetId = noteInCampaign1.note.id;
    const relationsCampaign1 = await listRelations(tenantA.client, tenantA.campaignId);
    expect(relationsCampaign1.some((r) => r.note_a_id === targetId || r.note_b_id === targetId)).toBe(false);

    const relationsCampaign2 = await listRelations(tenantA.client, secondCampaign.campaign.id);
    expect(relationsCampaign2).toEqual([]);
  });
});
