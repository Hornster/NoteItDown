import type { PostgrestResponse, SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/utils";
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

/**
 * Number of relations a note takes part in (as either side), for the delete dialog.
 * RLS scopes this to the caller's own notes, so a foreign note id counts 0. A non-uuid id
 * also counts 0, because it is interpolated into a PostgREST `or` filter string.
 */
export async function countNoteRelations(supabase: SupabaseClient, noteId: string): Promise<number> {
  if (!isUuid(noteId)) {
    return 0;
  }

  const { count, error } = await supabase
    .from("relations")
    .select("id", { count: "exact", head: true })
    .or(`note_a_id.eq.${noteId},note_b_id.eq.${noteId}`);

  if (error) {
    throw new Error(`countNoteRelations: query failed: ${error.message}`);
  }

  return count ?? 0;
}
