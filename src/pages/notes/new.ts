import type { APIRoute } from "astro";

import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES } from "@/lib/constants/messages";
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
    return new Response(MESSAGES.SUPABASE_NOT_CONFIGURED, { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
  }

  const landing = await resolveLandingCampaign(supabase, readRememberedCampaign(context.cookies));
  if (!landing) {
    return new Response(MESSAGES.NO_CAMPAIGN_FOR_ACCOUNT, { status: HTTP_STATUS.NOT_FOUND });
  }

  return context.redirect(`/campaigns/${landing.id}/notes/new`);
};
