import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { resolveLandingCampaign } from "@/lib/services/campaigns";
import { readRememberedCampaign } from "@/lib/campaign-cookie";

export const prerender = false;

// Static /campaigns wins over the dynamic /campaigns/[campaignId] route, so bookmarks
// and old links to the bare prefix land somewhere real.
export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response("Supabase is not configured.", { status: 500 });
  }

  const landing = await resolveLandingCampaign(supabase, readRememberedCampaign(context.cookies));
  if (!landing) {
    return new Response("No campaign found for this account.", { status: 404 });
  }

  return context.redirect(`/campaigns/${landing.id}`);
};
