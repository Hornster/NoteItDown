import type { PostgrestResponse, SupabaseClient } from "@supabase/supabase-js";

import type { MemoryMapRelation } from "@/types";

/**
 * All relations of a campaign, for the memory map. RLS scopes this to the caller's own
 * campaign, so another tenant's campaign id returns an empty list rather than an error.
 */
export async function listRelations(supabase: SupabaseClient, campaignId: string): Promise<MemoryMapRelation[]> {
  const { data, error }: PostgrestResponse<MemoryMapRelation> = await supabase
    .from("relations")
    .select("id, note_a_id, note_b_id")
    .eq("campaign_id", campaignId);

  if (error) {
    throw new Error(`listRelations: query failed: ${error.message}`);
  }

  return data;
}
