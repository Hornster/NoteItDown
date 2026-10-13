import type { APIRoute } from "astro";

import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES } from "@/lib/constants/messages";
import { createClient } from "@/lib/supabase";
import { getNote } from "@/lib/services/notes";
import { isUuid } from "@/lib/utils";

export const prerender = false;

// Kept as a redirect so bookmarks and old links to /notes/[id] keep working. The real
// page lives at /campaigns/[campaignId]/notes/[noteId].
export const GET: APIRoute = async (context) => {
  const { id } = context.params;
  const supabase = createClient(context.request.headers, context.cookies);

  // RLS makes another tenant's note come back as null too, so this also 404s for it.
  const note = id && isUuid(id) && supabase ? await getNote(supabase, id) : null;
  if (!note) {
    return new Response(MESSAGES.NOTE_NOT_FOUND, { status: HTTP_STATUS.NOT_FOUND });
  }

  return context.redirect(`/campaigns/${note.campaign_id}/notes/${id}`);
};
