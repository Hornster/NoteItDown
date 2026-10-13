import type { PostgrestMaybeSingleResponse, PostgrestResponse, SupabaseClient } from "@supabase/supabase-js";

import { PG_ERROR } from "@/lib/constants/db-error-codes";
import { isUuid } from "@/lib/utils";
import type { Campaign, CampaignSummary } from "@/types";

export type SaveCampaignResult =
  | { success: true; campaign: Campaign }
  | { success: false; reason: "duplicate_name" }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "unexpected"; error: unknown };

/**
 * The caller's oldest campaign (RLS scopes this to their own), or null if they have none.
 * Private: the only public entry point for "which campaign does this request act on" is
 * resolveLandingCampaign below.
 */
async function getOldestCampaign(supabase: SupabaseClient): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<Campaign>();

  if (error) {
    throw new Error(`getOldestCampaign: query failed: ${error.message}`);
  }

  return data ?? null;
}

/**
 * All of the caller's campaigns, oldest first (RLS scopes this to their own).
 */
export async function listCampaigns(supabase: SupabaseClient): Promise<CampaignSummary[]> {
  const { data, error }: PostgrestResponse<CampaignSummary> = await supabase
    .from("campaigns")
    .select("id, name")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`listCampaigns: query failed: ${error.message}`);
  }

  return data;
}

/**
 * RLS scopes this to the caller's own campaigns, so another tenant's campaign (or a
 * nonexistent id) comes back as null rather than an error. A malformed uuid is rejected
 * before it reaches PostgREST, which would otherwise raise 22P02 instead of an empty result.
 */
export async function getCampaign(supabase: SupabaseClient, id: string): Promise<Campaign | null> {
  if (!isUuid(id)) {
    return null;
  }

  const { data, error }: PostgrestMaybeSingleResponse<Campaign> = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getCampaign: query failed: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Creates a campaign for the given owner. Maps the DB-level duplicate-name failure to a
 * typed result. Raw DB messages are never passed through to callers; the "unexpected"
 * case carries the raw error only for server-side logging (same pattern as createNote).
 */
export async function createCampaign(
  supabase: SupabaseClient,
  ownerId: string,
  name: string,
): Promise<SaveCampaignResult> {
  const { data, error }: PostgrestMaybeSingleResponse<Campaign> = await supabase
    .from("campaigns")
    .insert({ owner_id: ownerId, name })
    .select()
    .maybeSingle();

  if (error) {
    // campaigns_owner_name_key (duplicate campaign name, case-insensitive).
    if (error.code === PG_ERROR.UNIQUE_VIOLATION) {
      return { success: false, reason: "duplicate_name" };
    }
    return { success: false, reason: "unexpected", error };
  }

  if (!data) {
    return { success: false, reason: "unexpected", error: new Error("createCampaign: insert returned no row") };
  }

  return { success: true, campaign: data };
}

/**
 * Renames a campaign the caller owns. A malformed id, a nonexistent id, or another
 * tenant's id (RLS-hidden) all return "not_found" rather than an error — a malformed id
 * is rejected before it reaches PostgREST, which would otherwise raise 22P02.
 */
export async function renameCampaign(supabase: SupabaseClient, id: string, name: string): Promise<SaveCampaignResult> {
  if (!isUuid(id)) {
    return { success: false, reason: "not_found" };
  }

  const { data, error }: PostgrestMaybeSingleResponse<Campaign> = await supabase
    .from("campaigns")
    .update({ name })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    // campaigns_owner_name_key (duplicate campaign name, case-insensitive).
    if (error.code === PG_ERROR.UNIQUE_VIOLATION) {
      return { success: false, reason: "duplicate_name" };
    }
    return { success: false, reason: "unexpected", error };
  }

  if (!data) {
    return { success: false, reason: "not_found" };
  }

  return { success: true, campaign: data };
}

/**
 * Resolves the campaign to land on: the caller's last-used campaign when it's still
 * theirs, otherwise their oldest campaign, otherwise null (no campaigns at all).
 */
export async function resolveLandingCampaign(
  supabase: SupabaseClient,
  lastCampaignId: string | undefined,
): Promise<Campaign | null> {
  if (lastCampaignId) {
    const campaign = await getCampaign(supabase, lastCampaignId);
    if (campaign) {
      return campaign;
    }
  }

  return getOldestCampaign(supabase);
}
