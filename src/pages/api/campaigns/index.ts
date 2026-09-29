import type { APIRoute } from "astro";

import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { createCampaign } from "@/lib/services/campaigns";
import { campaignNameSchema } from "@/lib/schemas/campaigns";

export const prerender = false;

const FIELDS = new Set(["name"]);

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: "You must be signed in." }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: "Supabase is not configured." }, 500);
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

  const result = await createCampaign(supabase, context.locals.user.id, parsed.data.name);

  if (!result.success) {
    if (result.reason === "duplicate_name") {
      return jsonError({ error: `A campaign named "${parsed.data.name}" already exists.`, field: "name" }, 409);
    }
    // "not_found" is unreachable here — createCampaign never returns it, only renameCampaign does — but
    // SaveCampaignResult is shared, so this branch keeps the switch exhaustive without an `as` cast.
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error(
      "POST /api/campaigns: unexpected createCampaign failure",
      result.reason === "unexpected" ? result.error : result.reason,
    );
    return jsonError({ error: "Something went wrong while creating the campaign. Please try again." }, 500);
  }

  return new Response(JSON.stringify({ id: result.campaign.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
