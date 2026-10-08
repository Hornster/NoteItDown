import type { APIRoute } from "astro";

import { jsonError } from "@/lib/api";
import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES } from "@/lib/constants/messages";
import { commitImage } from "@/lib/services/note-images";
import { commitImageSchema } from "@/lib/schemas/note-images";
import { createClient } from "@/lib/supabase";
import { isUuid } from "@/lib/utils";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: MESSAGES.SIGNED_IN_REQUIRED }, HTTP_STATUS.UNAUTHORIZED);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: MESSAGES.SUPABASE_NOT_CONFIGURED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const { campaignId, noteId } = context.params;
  if (!campaignId || !noteId || !isUuid(campaignId) || !isUuid(noteId)) {
    return jsonError({ error: MESSAGES.NOTE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: MESSAGES.INVALID_JSON_BODY }, HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = commitImageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError({ error: parsed.error.issues[0].message }, HTTP_STATUS.BAD_REQUEST);
  }

  const result = await commitImage(supabase, context.locals.user.id, campaignId, noteId, parsed.data);

  if (!result.success) {
    if (result.reason === "invalid_upload") {
      return jsonError({ error: MESSAGES.IMAGE_UPLOAD_INVALID, field: "images" }, HTTP_STATUS.BAD_REQUEST);
    }
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.NOTE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    if (result.reason === "limit_reached") {
      return jsonError({ error: MESSAGES.IMAGE_LIMIT_REACHED, field: "images" }, HTTP_STATUS.CONFLICT);
    }
    // eslint-disable-next-line no-console -- surface unexpected failures for operators; the client only sees a generic message.
    console.error("POST /api/campaigns/[campaignId]/notes/[noteId]/images: commitImage failed", result.error);
    return jsonError({ error: MESSAGES.GENERIC_IMAGE_ERROR }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return new Response(JSON.stringify(result.image), {
    status: HTTP_STATUS.CREATED,
    headers: { "Content-Type": "application/json" },
  });
};
