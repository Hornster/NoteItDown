import { z } from "zod";

import { contentTooLong, MESSAGES, nameTooLong, typeNameTooLong } from "@/lib/constants/messages";
import type { CreateNoteCommand, UpdateNoteCommand } from "@/types";

/**
 * Limits shared with the create-note form (NoteForm) so client-side checks mirror
 * these exactly. Keep in sync with notes_name_length_check / notes_content_length_check
 * in supabase/migrations/20260924120000_create_note_function.sql (name/content) — the
 * type-name limit is zod-only (see "Signup and seeding coupling" in the plan).
 */
export const NOTE_NAME_MAX_LENGTH = 120;
export const NOTE_CONTENT_MAX_LENGTH = 20000;
export const NOTE_TYPE_NAME_MAX_LENGTH = 60;

/**
 * Validates POST /api/campaigns/[campaignId]/notes bodies. `.strict()` rejects unknown
 * top-level keys — in particular `campaign_id`, which must never be accepted from the
 * client; the campaign comes from the URL path and is ownership-checked server-side.
 *
 * name/content limits mirror notes_name_length_check / notes_content_length_check
 * in supabase/migrations/20260924120000_create_note_function.sql. Keep them in sync.
 */
export const createNoteSchema = z
  .object({
    name: z.string().trim().min(1, MESSAGES.NAME_REQUIRED).max(NOTE_NAME_MAX_LENGTH, nameTooLong(NOTE_NAME_MAX_LENGTH)),
    // Not trimmed: the user's whitespace in the note body is kept as typed.
    content: z.string().max(NOTE_CONTENT_MAX_LENGTH, contentTooLong(NOTE_CONTENT_MAX_LENGTH)).default(""),
    type: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("existing"),
          id: z.uuid(MESSAGES.TYPE_ID_INVALID),
        })
        .strict(),
      z
        .object({
          kind: z.literal("new"),
          name: z
            .string()
            .trim()
            .min(1, MESSAGES.TYPE_NAME_REQUIRED)
            .max(NOTE_TYPE_NAME_MAX_LENGTH, typeNameTooLong(NOTE_TYPE_NAME_MAX_LENGTH)),
        })
        .strict(),
    ]),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// Compile-time check: the schema's inferred output must stay assignable to the shared DTO.
// (a type-only assertion, so it costs nothing at runtime and never goes "unused")
type _AssertAssignableToCommand<T extends CreateNoteCommand> = T;
export type _SchemaMatchesCommand = _AssertAssignableToCommand<CreateNoteInput>;

/**
 * Validates PATCH /api/campaigns/[campaignId]/notes/[noteId] bodies. The edit body has the
 * same shape and rules as create (full replacement of name, content and type), so the
 * schema is reused rather than forked.
 */
export const updateNoteSchema = createNoteSchema;

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

type _AssertAssignableToUpdateCommand<T extends UpdateNoteCommand> = T;
export type _SchemaMatchesUpdateCommand = _AssertAssignableToUpdateCommand<UpdateNoteInput>;
