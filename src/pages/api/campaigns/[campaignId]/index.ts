import type { APIRoute } from "astro";

import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES, campaignNameTaken } from "@/lib/constants/messages";
import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { renameCampaign } from "@/lib/services/campaigns";
import { campaignNameSchema } from "@/lib/schemas/campaigns";
import { isUuid } from "@/lib/utils";

export const prerender = false;

const FIELDS = new Set(["name"]);

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: MESSAGES.SIGNED_IN_REQUIRED }, HTTP_STATUS.UNAUTHORIZED);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: MESSAGES.SUPABASE_NOT_CONFIGURED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const { campaignId } = context.params;
  if (!campaignId || !isUuid(campaignId)) {
    return jsonError({ error: MESSAGES.CAMPAIGN_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: MESSAGES.INVALID_JSON_BODY }, HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = campaignNameSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return jsonError(
      {
        error: firstIssue.message,
        field: fieldFromPath(firstIssue.path, FIELDS),
      },
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const result = await renameCampaign(supabase, campaignId, parsed.data.name);

  if (!result.success) {
    if (result.reason === "duplicate_name") {
      return jsonError({ error: campaignNameTaken(parsed.data.name), field: "name" }, HTTP_STATUS.CONFLICT);
    }
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.CAMPAIGN_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("PATCH /api/campaigns/[campaignId]: unexpected renameCampaign failure", result.error);
    return jsonError({ error: MESSAGES.CAMPAIGN_RENAME_FAILED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return new Response(JSON.stringify({ id: result.campaign.id }), {
    status: HTTP_STATUS.OK,
    headers: { "Content-Type": "application/json" },
  });
};
