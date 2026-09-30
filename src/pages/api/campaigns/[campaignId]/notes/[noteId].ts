import type { APIRoute } from "astro";

import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { deleteNote, updateNote } from "@/lib/services/notes";
import { updateNoteSchema } from "@/lib/schemas/notes";
import { isUuid } from "@/lib/utils";

export const prerender = false;

const FIELDS = new Set(["name", "content", "type"]);

const NOT_FOUND = "This note doesn't exist or isn't yours.";

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: "You must be signed in." }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: "Supabase is not configured." }, 500);
  }

  const { campaignId, noteId } = context.params;
  if (!campaignId || !noteId || !isUuid(campaignId) || !isUuid(noteId)) {
    return jsonError({ error: NOT_FOUND }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = updateNoteSchema.safeParse(body);
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

  const result = await updateNote(supabase, campaignId, noteId, parsed.data);

  if (!result.success) {
    if (result.reason === "duplicate_name") {
      return jsonError(
        { error: `A note named "${parsed.data.name}" already exists in this campaign.`, field: "name" },
        409,
      );
    }
    if (result.reason === "invalid_type") {
      return jsonError({ error: "The selected type is not valid for this campaign.", field: "type" }, 400);
    }
    if (result.reason === "not_found") {
      return jsonError({ error: NOT_FOUND }, 404);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("PATCH /api/campaigns/[campaignId]/notes/[noteId]: unexpected updateNote failure", result.error);
    return jsonError({ error: "Something went wrong while saving the note. Please try again." }, 500);
  }

  return jsonOk(result.changes);
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: "You must be signed in." }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: "Supabase is not configured." }, 500);
  }

  const { campaignId, noteId } = context.params;
  if (!campaignId || !noteId || !isUuid(campaignId) || !isUuid(noteId)) {
    return jsonError({ error: NOT_FOUND }, 404);
  }

  const result = await deleteNote(supabase, campaignId, noteId);

  if (!result.success) {
    if (result.reason === "not_found") {
      return jsonError({ error: NOT_FOUND }, 404);
    }
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("DELETE /api/campaigns/[campaignId]/notes/[noteId]: unexpected deleteNote failure", result.error);
    return jsonError({ error: "Something went wrong while deleting the note. Please try again." }, 500);
  }

  return jsonOk(result.changes);
};
