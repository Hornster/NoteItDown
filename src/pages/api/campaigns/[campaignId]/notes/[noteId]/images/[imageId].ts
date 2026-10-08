import type { APIRoute } from "astro";

import { jsonError } from "@/lib/api";
import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES } from "@/lib/constants/messages";
import { deleteImage, getImageUrls, updateImageAltText } from "@/lib/services/note-images";
import { updateImageSchema } from "@/lib/schemas/note-images";
import { createClient } from "@/lib/supabase";
import { isUuid } from "@/lib/utils";

export const prerender = false;

function jsonOk(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: HTTP_STATUS.OK,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Shared guards: auth, Supabase client, uuid params. Returns a Response on failure. */
function guard(context: Parameters<APIRoute>[0]) {
  if (!context.locals.user) {
    return {
      ok: false as const,
      response: jsonError({ error: MESSAGES.SIGNED_IN_REQUIRED }, HTTP_STATUS.UNAUTHORIZED),
    };
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return {
      ok: false as const,
      response: jsonError({ error: MESSAGES.SUPABASE_NOT_CONFIGURED }, HTTP_STATUS.INTERNAL_SERVER_ERROR),
    };
  }

  const { campaignId, noteId, imageId } = context.params;
  if (!campaignId || !noteId || !imageId || !isUuid(campaignId) || !isUuid(noteId) || !isUuid(imageId)) {
    return { ok: false as const, response: jsonError({ error: MESSAGES.IMAGE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND) };
  }

  return { ok: true as const, supabase, campaignId, noteId, imageId };
}

function unexpected(verb: string, error: unknown): Response {
  // eslint-disable-next-line no-console -- surface unexpected failures for operators; the client only sees a generic message.
  console.error(`${verb} /api/campaigns/[campaignId]/notes/[noteId]/images/[imageId]: unexpected failure`, error);
  return jsonError({ error: MESSAGES.GENERIC_IMAGE_ERROR }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
}

export const GET: APIRoute = async (context) => {
  const g = guard(context);
  if (!g.ok) {
    return g.response;
  }

  const result = await getImageUrls(g.supabase, g.campaignId, g.noteId, g.imageId);
  if (!result.success) {
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.IMAGE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    return unexpected("GET", result.error);
  }

  return jsonOk(result.urls, { "Cache-Control": "no-store" });
};

export const PATCH: APIRoute = async (context) => {
  const g = guard(context);
  if (!g.ok) {
    return g.response;
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: MESSAGES.INVALID_JSON_BODY }, HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = updateImageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError({ error: parsed.error.issues[0].message }, HTTP_STATUS.BAD_REQUEST);
  }

  const result = await updateImageAltText(g.supabase, g.campaignId, g.noteId, g.imageId, parsed.data.alt_text);
  if (!result.success) {
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.IMAGE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    return unexpected("PATCH", result.error);
  }

  return jsonOk(result.image);
};

export const DELETE: APIRoute = async (context) => {
  const g = guard(context);
  if (!g.ok) {
    return g.response;
  }

  const result = await deleteImage(g.supabase, g.campaignId, g.noteId, g.imageId);
  if (!result.success) {
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.IMAGE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    return unexpected("DELETE", result.error);
  }

  return jsonOk({ id: g.imageId });
};
