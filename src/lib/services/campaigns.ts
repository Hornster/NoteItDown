import type { SupabaseClient } from "@supabase/supabase-js";

import type { Campaign } from "@/types";

/**
 * Resolves the campaign the current request acts on.
 *
 * S-03 handoff: this slice supports exactly one campaign per user, so the "active"
 * campaign is simply the caller's oldest one. When S-03 adds multiple campaigns and a
 * way to switch between them, this function (and only this function) must change —
 * for example to read a campaign id from a cookie or the URL — and any campaign id that
 * then arrives from the client must be re-checked for ownership on the server before use.
 */
export async function getActiveCampaign(supabase: SupabaseClient): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<Campaign>();

  if (error) {
    throw new Error(`getActiveCampaign: query failed: ${error.message}`);
  }

  return data ?? null;
}
