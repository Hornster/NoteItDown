import { expect } from "vitest";
import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { HTTP_STATUS } from "@/lib/constants/http-status";
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

/**
 * Storage reports a policy denial as HTTP 400 with body statusCode "403"; asserting the message
 * proves the policy fired rather than some unrelated (network, MIME) failure.
 */
export function expectRlsDenied(error: unknown) {
  expect(error).toMatchObject({ statusCode: String(HTTP_STATUS.FORBIDDEN) });
  expect((error as Error).message).toMatch(/row-level security/);
}

/** Content length limit shared by the DB check (char_length) and the zod schema (UTF-16 units). */
const CONTENT_LIMIT = 20000;

/**
 * Content values that must survive a create/update round-trip byte for byte. The limit case is
 * exactly 20000 characters of multibyte BMP text (ż, ł, é) mixed with spaces and newlines, with
 * leading and trailing whitespace: each character is one code point (DB char_length) and one
 * UTF-16 unit (zod .max), so both layers agree at the boundary. Emoji are astral (one code point,
 * two UTF-16 units) and therefore stay in a short string.
 */
export function roundTripContents(): { label: string; content: string }[] {
  const unit = "żółć é\nłąka ";
  const core = unit.repeat(Math.ceil(CONTENT_LIMIT / unit.length)).slice(0, CONTENT_LIMIT - 6);
  const limit = `  \n${core}\n  `;
  if (limit.length !== CONTENT_LIMIT || Array.from(limit).length !== CONTENT_LIMIT) {
    throw new Error("roundTripContents: limit fixture is not exactly 20000 characters");
  }
  return [
    { label: "multi-line text", content: "First line\nSecond line\n\nFourth line after a blank one" },
    { label: "Unicode and emoji", content: "Zażółć gęślą jaźń, café, 日本語, \u{1F409} \u{1F5E1}\uFE0F \u{1F3F0}" },
    { label: "leading and trailing whitespace", content: "  \t padded body \n\n  " },
    { label: "exactly 20000 characters", content: limit },
  ];
}
