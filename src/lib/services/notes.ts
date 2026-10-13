import type {
  PostgrestMaybeSingleResponse,
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from "@supabase/supabase-js";

import { PG_ERROR } from "@/lib/constants/db-error-codes";
import type {
  CreateNoteCommand,
  DeleteNoteResponse,
  Note,
  NoteDetail,
  NoteListItem,
  NoteType,
  UpdateNoteCommand,
  UpdateNoteResponse,
} from "@/types";

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

export type UpdateNoteResult =
  | { success: true; changes: UpdateNoteResponse }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "duplicate_name" }
  | { success: false; reason: "invalid_type" }
  | { success: false; reason: "unexpected"; error: unknown };

export type DeleteNoteResult =
  | { success: true; changes: DeleteNoteResponse }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "unexpected"; error: unknown };

/** Shape of the update_note RPC's jsonb result. */
interface UpdateNoteRpcResult {
  note: Note;
  rechecked: boolean;
  added: UpdateNoteResponse["added"];
  removed: UpdateNoteResponse["removed"];
}

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
    if (error.code === PG_ERROR.UNIQUE_VIOLATION) {
      return { success: false, reason: "duplicate_name" };
    }
    // 23503: FK violation (type not in this campaign). 42501: RLS denial (foreign
    // campaign/type). 22023: neither/both type arguments provided.
    if (
      error.code === PG_ERROR.FOREIGN_KEY_VIOLATION ||
      error.code === PG_ERROR.INSUFFICIENT_PRIVILEGE ||
      error.code === PG_ERROR.INVALID_PARAMETER_VALUE
    ) {
      return { success: false, reason: "invalid_type" };
    }
    return { success: false, reason: "unexpected", error };
  }

  return { success: true, note: response.data };
}

/**
 * Calls the update_note RPC (edit plus relation change set) and maps its DB-level failures
 * to a typed result. P0002 means the note is missing, in another campaign, or hidden by RLS.
 */
export async function updateNote(
  supabase: SupabaseClient,
  campaignId: string,
  noteId: string,
  command: UpdateNoteCommand,
): Promise<UpdateNoteResult> {
  const response: PostgrestSingleResponse<UpdateNoteRpcResult> = await supabase.rpc("update_note", {
    p_campaign_id: campaignId,
    p_note_id: noteId,
    p_name: command.name,
    p_content: command.content,
    p_type_id: command.type.kind === "existing" ? command.type.id : null,
    p_new_type_name: command.type.kind === "new" ? command.type.name : null,
  });

  if (response.error) {
    const { error } = response;
    if (error.code === PG_ERROR.NO_DATA_FOUND) {
      return { success: false, reason: "not_found" };
    }
    if (error.code === PG_ERROR.UNIQUE_VIOLATION) {
      return { success: false, reason: "duplicate_name" };
    }
    if (
      error.code === PG_ERROR.FOREIGN_KEY_VIOLATION ||
      error.code === PG_ERROR.INSUFFICIENT_PRIVILEGE ||
      error.code === PG_ERROR.INVALID_PARAMETER_VALUE
    ) {
      return { success: false, reason: "invalid_type" };
    }
    return { success: false, reason: "unexpected", error };
  }

  const { note, rechecked, added, removed } = response.data;
  return { success: true, changes: { id: note.id, name: note.name, rechecked, added, removed } };
}

/**
 * Calls the delete_note RPC and maps its DB-level failures to a typed result. The result
 * lists the relations that disappeared with the note.
 */
export async function deleteNote(
  supabase: SupabaseClient,
  campaignId: string,
  noteId: string,
): Promise<DeleteNoteResult> {
  const response: PostgrestSingleResponse<DeleteNoteResponse> = await supabase.rpc("delete_note", {
    p_campaign_id: campaignId,
    p_note_id: noteId,
  });

  if (response.error) {
    const { error } = response;
    if (error.code === PG_ERROR.NO_DATA_FOUND) {
      return { success: false, reason: "not_found" };
    }
    return { success: false, reason: "unexpected", error };
  }

  return { success: true, changes: response.data };
}
