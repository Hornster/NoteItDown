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
