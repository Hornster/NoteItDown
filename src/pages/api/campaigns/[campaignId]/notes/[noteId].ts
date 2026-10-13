import type { APIRoute } from "astro";

import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES, noteNameTaken } from "@/lib/constants/messages";
import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { removeNoteFolder } from "@/lib/services/note-images";
import { deleteNote, updateNote } from "@/lib/services/notes";
import { updateNoteSchema } from "@/lib/schemas/notes";
import { isUuid } from "@/lib/utils";

export const prerender = false;

const FIELDS = new Set(["name", "content", "type"]);

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: HTTP_STATUS.OK,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async (context) => {
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

  const parsed = updateNoteSchema.safeParse(body);
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

  const result = await updateNote(supabase, campaignId, noteId, parsed.data);

  if (!result.success) {
    if (result.reason === "duplicate_name") {
      return jsonError({ error: noteNameTaken(parsed.data.name), field: "name" }, HTTP_STATUS.CONFLICT);
    }
    if (result.reason === "invalid_type") {
      return jsonError({ error: MESSAGES.NOTE_TYPE_INVALID, field: "type" }, HTTP_STATUS.BAD_REQUEST);
    }
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.NOTE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("PATCH /api/campaigns/[campaignId]/notes/[noteId]: unexpected updateNote failure", result.error);
    return jsonError({ error: MESSAGES.NOTE_SAVE_FAILED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return jsonOk(result.changes);
};

export const DELETE: APIRoute = async (context) => {
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

  const result = await deleteNote(supabase, campaignId, noteId);

  if (!result.success) {
    if (result.reason === "not_found") {
      return jsonError({ error: MESSAGES.NOTE_NOT_FOUND }, HTTP_STATUS.NOT_FOUND);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("DELETE /api/campaigns/[campaignId]/notes/[noteId]: unexpected deleteNote failure", result.error);
    return jsonError({ error: MESSAGES.NOTE_DELETE_FAILED }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  // Cascade removes image rows, not Storage objects. Failures are logged inside and never change the response.
  await removeNoteFolder(supabase, context.locals.user.id, campaignId, noteId);

  return jsonOk(result.changes);
};
