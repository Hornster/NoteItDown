import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { resolveLandingCampaign } from "@/lib/services/campaigns";
import { readRememberedCampaign } from "@/lib/campaign-cookie";

export const prerender = false;

// Kept as a redirect so bookmarks, the sign-in redirect and old in-app links to
// /notes/new keep working. The real page lives at /campaigns/[campaignId]/notes/new.
// Static /notes/new wins over the dynamic /notes/[id] route.
export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response("Supabase is not configured.", { status: 404 });
  }

  const landing = await resolveLandingCampaign(supabase, readRememberedCampaign(context.cookies));
  if (!landing) {
    return new Response("No campaign found for this account.", { status: 404 });
  }

  return context.redirect(`/campaigns/${landing.id}/notes/new`);
};
