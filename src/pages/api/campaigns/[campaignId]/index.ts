import type { APIRoute } from "astro";

import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { renameCampaign } from "@/lib/services/campaigns";
import { campaignNameSchema } from "@/lib/schemas/campaigns";
import { isUuid } from "@/lib/utils";

export const prerender = false;

const FIELDS = new Set(["name"]);

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: "You must be signed in." }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: "Supabase is not configured." }, 500);
  }

  const { campaignId } = context.params;
  if (!campaignId || !isUuid(campaignId)) {
    return jsonError({ error: "This campaign doesn't exist or isn't yours." }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = campaignNameSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return jsonError(
      {
        error: firstIssue.message,
        field: fieldFromPath(firstIssue.path, FIELDS),
      },
      400,
    );
  }

  const result = await renameCampaign(supabase, campaignId, parsed.data.name);

  if (!result.success) {
    if (result.reason === "duplicate_name") {
      return jsonError({ error: `A campaign named "${parsed.data.name}" already exists.`, field: "name" }, 409);
    }
    if (result.reason === "not_found") {
      return jsonError({ error: "This campaign doesn't exist or isn't yours." }, 404);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("PATCH /api/campaigns/[campaignId]: unexpected renameCampaign failure", result.error);
    return jsonError({ error: "Something went wrong while renaming the campaign. Please try again." }, 500);
  }

  return new Response(JSON.stringify({ id: result.campaign.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
