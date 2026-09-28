/**
 * Shared entity types mirroring the Supabase schema defined in
 * supabase/migrations/20260922120000_campaign_notes_schema.sql
 *
 * Field names match the database columns exactly (snake_case) —
 * no camelCase mapping layer.
 */

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface NoteType {
  id: string;
  campaign_id: string;
  name: string;
  is_predefined: boolean;
  created_at: string;
}

export interface Note {
  id: string;
  campaign_id: string;
  type_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Relation {
  id: string;
  campaign_id: string;
  note_a_id: string;
  note_b_id: string;
  created_at: string;
}

/**
 * DTOs shared by the API, services and the React form. Unlike the entity interfaces
 * above, these do not mirror a table field for field.
 */

/**
 * Command for POST /api/campaigns/[campaignId]/notes. Deliberately has no campaign id in
 * the body: the campaign comes from the URL path and is ownership-checked server-side via
 * getCampaign (see src/lib/services/campaigns.ts) before it's used.
 */
export interface CreateNoteCommand {
  name: string;
  content: string;
  type: { kind: "existing"; id: string } | { kind: "new"; name: string };
}

/** Command for POST /api/campaigns (create) and PATCH /api/campaigns/:id (rename). */
export interface SaveCampaignCommand {
  name: string;
}

/** The subset of a campaign shown in the campaign switcher. */
export type CampaignSummary = Pick<Campaign, "id" | "name">;

export interface NoteListItem {
  id: string;
  name: string;
  type_name: string;
  created_at: string;
}

export interface NoteDetail extends Note {
  type_name: string;
}

export interface ApiError {
  error: string;
  field?: "name" | "content" | "type";
}

/** A relation as needed by the memory map: no `campaign_id`, since the caller already scoped the query to one. */
export type MemoryMapRelation = Pick<Relation, "id" | "note_a_id" | "note_b_id">;

/** Domain-level payload for the memory map, free of React Flow types (mapped to nodes/edges in the island). */
export interface MemoryMapData {
  notes: NoteListItem[];
  relations: MemoryMapRelation[];
}
