import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import type { Note } from "@/types";

export { createTestUser } from "../support/test-user";

/** Creates a note through the create_note RPC and returns it. */
export async function createTestNote(
  client: SupabaseClient,
  campaignId: string,
  name = `Note ${crypto.randomUUID()}`,
): Promise<Note> {
  const response: PostgrestSingleResponse<Note> = await client.rpc("create_note", {
    p_campaign_id: campaignId,
    p_name: name,
    p_content: "",
    p_new_type_name: "NPC",
  });
  if (response.error) {
    throw new Error(`createTestNote: failed to create "${name}": ${response.error.message}`);
  }
  return response.data;
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** A tiny valid 1x1 WebP (static bytes). */
export function webpFixture(): Uint8Array<ArrayBuffer> {
  return fromBase64("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
}

/** A tiny valid 1x1 JPEG (static bytes). */
export function jpegFixture(): Uint8Array<ArrayBuffer> {
  return fromBase64(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  );
}
