import type {
  PostgrestMaybeSingleResponse,
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from "@supabase/supabase-js";

import type { CreateNoteCommand, Note, NoteDetail, NoteListItem, NoteType } from "@/types";

/** Row shape returned by a `notes` select embedding its type's name. */
interface NoteWithTypeName {
  id: string;
  name: string;
  created_at: string;
  note_types: { name: string } | null;
}

/** Row shape returned by a full `notes` select embedding its type's name. */
type NoteDetailRow = Note & { note_types: { name: string } | null };

export type CreateNoteResult =
  | { success: true; note: Note }
  | { success: false; reason: "duplicate_name" }
  | { success: false; reason: "invalid_type" }
  | { success: false; reason: "unexpected"; error: unknown };

/**
 * Predefined types first, then custom types, each alphabetical.
 */
export async function listNoteTypes(supabase: SupabaseClient, campaignId: string): Promise<NoteType[]> {
  const { data, error }: PostgrestResponse<NoteType> = await supabase
    .from("note_types")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("is_predefined", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`listNoteTypes: query failed: ${error.message}`);
  }

  return data;
}

/**
 * Newest first, joined with the type name.
 */
export async function listNotes(supabase: SupabaseClient, campaignId: string): Promise<NoteListItem[]> {
  // The untyped client (no generated Database types — see plan's "What We're NOT Doing")
  // infers embedded relations as arrays from the select string alone; at runtime, `notes
  // -> note_types` is many-to-one, so PostgREST nests a single object per row. The cast
  // bridges that gap in the static type without weakening it to `any`.
  const { data, error } = (await supabase
    .from("notes")
    .select("id, name, created_at, note_types(name)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })) as unknown as PostgrestResponse<NoteWithTypeName>;

  if (error) {
    throw new Error(`listNotes: query failed: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    type_name: row.note_types?.name ?? "",
  }));
}

/**
 * RLS scopes this to the caller's own notes, so another tenant's note (or a
 * nonexistent id) comes back as null rather than an error.
 */
export async function getNote(supabase: SupabaseClient, id: string): Promise<NoteDetail | null> {
  // Same embed-cardinality gap as listNotes: cast the inferred array shape to the real
  // single-object shape PostgREST returns for this many-to-one relation.
  const { data, error } = (await supabase
    .from("notes")
    .select("*, note_types(name)")
    .eq("id", id)
    .maybeSingle()) as unknown as PostgrestMaybeSingleResponse<NoteDetailRow>;

  if (error) {
    throw new Error(`getNote: query failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const { note_types, ...note } = data;
  return { ...note, type_name: note_types?.name ?? "" };
}

/**
 * Calls the create_note RPC and maps its DB-level failures to a typed result. Raw DB
 * messages are never passed through to callers; the "unexpected" case carries the raw
 * error only for server-side logging.
 */
export async function createNote(
  supabase: SupabaseClient,
  campaignId: string,
  command: CreateNoteCommand,
): Promise<CreateNoteResult> {
  const response: PostgrestSingleResponse<Note> = await supabase.rpc("create_note", {
    p_campaign_id: campaignId,
    p_name: command.name,
    p_content: command.content,
    p_type_id: command.type.kind === "existing" ? command.type.id : null,
    p_new_type_name: command.type.kind === "new" ? command.type.name : null,
  });

  if (response.error) {
    const { error } = response;
    // notes_campaign_name_key (duplicate note name, case-insensitive).
    if (error.code === "23505") {
      return { success: false, reason: "duplicate_name" };
    }
    // 23503: FK violation (type not in this campaign). 42501: RLS denial (foreign
    // campaign/type). 22023: neither/both type arguments provided.
    if (error.code === "23503" || error.code === "42501" || error.code === "22023") {
      return { success: false, reason: "invalid_type" };
    }
    return { success: false, reason: "unexpected", error };
  }

  return { success: true, note: response.data };
}
