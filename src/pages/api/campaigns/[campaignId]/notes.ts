import type { APIRoute } from "astro";

import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES, noteNameTaken } from "@/lib/constants/messages";
import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { getCampaign } from "@/lib/services/campaigns";
import { createNote } from "@/lib/services/notes";
import { createNoteSchema } from "@/lib/schemas/notes";

export const prerender = false;

const FIELDS = new Set(["name", "content", "type"]);

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: MESSAGES.SIGNED_IN_REQUIRED }, HTTP_STATUS.UNAUTHORIZED);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: MESSAGES.SUPABASE_NOT_CONFIGURED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const { campaignId } = context.params;
  const campaign = campaignId ? await getCampaign(supabase, campaignId) : null;
  if (!campaign) {
    return jsonError({ error: MESSAGES.CAMPAIGN_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: MESSAGES.INVALID_JSON_BODY }, HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = createNoteSchema.safeParse(body);
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

  const result = await createNote(supabase, campaign.id, parsed.data);

  if (!result.success) {
    if (result.reason === "duplicate_name") {
      return jsonError({ error: noteNameTaken(parsed.data.name), field: "name" }, HTTP_STATUS.CONFLICT);
    }
    if (result.reason === "invalid_type") {
      return jsonError({ error: MESSAGES.NOTE_TYPE_INVALID, field: "type" }, HTTP_STATUS.BAD_REQUEST);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("POST /api/campaigns/[campaignId]/notes: unexpected createNote failure", result.error);
    return jsonError({ error: MESSAGES.NOTE_CREATE_FAILED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return new Response(JSON.stringify({ id: result.note.id }), {
    status: HTTP_STATUS.CREATED,
    headers: { "Content-Type": "application/json" },
  });
};
