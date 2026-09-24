import { z } from "zod";

import type { CreateNoteCommand } from "@/types";

/**
 * Validates POST /api/notes bodies. `.strict()` rejects unknown top-level keys —
 * in particular `campaign_id`, which must never be accepted from the client
 * (see the S-03 handoff in context/changes/create-notes/plan.md).
 *
 * name/content limits mirror notes_name_length_check / notes_content_length_check
 * in supabase/migrations/20260924120000_create_note_function.sql. Keep them in sync.
 */
export const createNoteSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120, "Name must be at most 120 characters."),
    // Not trimmed: the user's whitespace in the note body is kept as typed.
    content: z.string().max(20000, "Content must be at most 20,000 characters.").default(""),
    type: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("existing"),
          id: z.uuid("Type id must be a valid uuid."),
        })
        .strict(),
      z
        .object({
          kind: z.literal("new"),
          name: z.string().trim().min(1, "Type name is required.").max(60, "Type name must be at most 60 characters."),
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
