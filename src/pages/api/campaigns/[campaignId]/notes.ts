import type { APIRoute } from "astro";

import { jsonError, fieldFromPath } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { getCampaign } from "@/lib/services/campaigns";
import { createNote } from "@/lib/services/notes";
import { createNoteSchema } from "@/lib/schemas/notes";

export const prerender = false;

const FIELDS = new Set(["name", "content", "type"]);

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError({ error: "You must be signed in." }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError({ error: "Supabase is not configured." }, 500);
  }

  const { campaignId } = context.params;
  const campaign = campaignId ? await getCampaign(supabase, campaignId) : null;
  if (!campaign) {
    return jsonError({ error: "This campaign doesn't exist or isn't yours." }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = createNoteSchema.safeParse(body);
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

  const result = await createNote(supabase, campaign.id, parsed.data);

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
    // eslint-disable-next-line no-console -- surface unexpected DB failures for operators; the client only sees a generic message.
    console.error("POST /api/campaigns/[campaignId]/notes: unexpected createNote failure", result.error);
    return jsonError({ error: "Something went wrong while creating the note. Please try again." }, 500);
  }

  return new Response(JSON.stringify({ id: result.note.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
