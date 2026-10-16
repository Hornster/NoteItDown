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

/** Command for PATCH /api/campaigns/:campaignId/notes/:noteId. Same shape and rules as create. */
export type UpdateNoteCommand = CreateNoteCommand;

/** A relation gained or lost by a note edit/delete: the other note's id and current name. */
export interface RelationChange {
  note_id: string;
  name: string;
}

/** Response of PATCH /api/campaigns/:campaignId/notes/:noteId. */
export interface UpdateNoteResponse {
  id: string;
  name: string;
  rechecked: boolean;
  added: RelationChange[];
  removed: RelationChange[];
}

/** Response of DELETE /api/campaigns/:campaignId/notes/:noteId. */
export interface DeleteNoteResponse {
  name: string;
  removed: RelationChange[];
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

/** Dashboard notes of one type, as produced by `groupNotesByType` in `@/lib/note-search`. */
export interface NoteGroup {
  typeName: string;
  notes: NoteListItem[];
}

export interface NoteDetail extends Note {
  type_name: string;
}

export interface ApiError {
  error: string;
  field?: "name" | "content" | "type" | "images";
}

/** A relation as needed by the memory map: no `campaign_id`, since the caller already scoped the query to one. */
export type MemoryMapRelation = Pick<Relation, "id" | "note_a_id" | "note_b_id">;

/** Domain-level payload for the memory map, free of React Flow types (mapped to nodes/edges in the island). */
export interface MemoryMapData {
  notes: NoteListItem[];
  relations: MemoryMapRelation[];
}

/** A stored image attached to a note; mirrors `public.note_images` (20261003120000_note_images.sql). */
export interface NoteImage {
  id: string;
  campaign_id: string;
  note_id: string;
  position: number;
  path: string;
  thumb_path: string | null;
  mime: "image/webp" | "image/jpeg";
  width: number;
  height: number;
  thumb_width: number | null;
  thumb_height: number | null;
  byte_size: number;
  alt_text: string | null;
  created_at: string;
}

/**
 * What the note page renders per image. `thumb_url` is the signed thumbnail URL (the
 * original's when there is no separate thumbnail); null when signing failed.
 */
export interface NoteImageView {
  id: string;
  position: number;
  alt_text: string | null;
  width: number;
  height: number;
  thumb_width: number | null;
  thumb_height: number | null;
  thumb_url: string | null;
}

/** Command to get signed upload URLs for one image. */
export interface PrepareUploadCommand {
  mime: "image/webp" | "image/jpeg";
  with_thumbnail: boolean;
}

export interface SignedUpload {
  path: string;
  signed_url: string;
  token: string;
}

export interface PrepareUploadResponse {
  image: SignedUpload;
  thumbnail: SignedUpload | null;
  /** Anon key, only present when the signed PUT requires an `apikey` header. */
  apikey?: string;
}

/** Command to register uploaded objects as a `note_images` row. */
export interface CommitImageCommand {
  path: string;
  thumb_path: string | null;
  width: number;
  height: number;
  thumb_width: number | null;
  thumb_height: number | null;
  alt_text: string | null;
}

export interface UpdateImageCommand {
  alt_text: string | null;
}

export interface CommitImageResponse {
  id: string;
  position: number;
}

export interface UpdateImageResponse {
  id: string;
  alt_text: string | null;
}

/** Fresh signed URLs for one image: full-size (short-lived) and thumbnail. */
export interface ImageUrlsResponse {
  url: string;
  thumb_url: string;
}

/** One browser-encoded output (original or thumbnail). */
export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  type: "image/webp" | "image/jpeg";
}

/** Result of the browser compression pipeline. `thumbnail` is null when the original fits within 512 px. */
export interface ProcessedImage {
  image: EncodedImage;
  thumbnail: EncodedImage | null;
}

/** An image picked on the note form, held in the browser until Save. */
export interface PendingImage {
  key: string;
  fileName: string;
  status: "processing" | "ready" | "error";
  processed?: ProcessedImage;
  previewUrl?: string;
  error?: string;
  /** True when the picked file's sniffed or declared type is GIF or WebP. */
  maybeAnimated?: boolean;
  alt_text: string;
}

/** Image edits held by the note form until Save. */
export interface HeldImageState {
  kept: NoteImageView[];
  removedIds: string[];
  altEdits: Record<string, string | null>;
  added: PendingImage[];
}

/** What `applyImageChanges` needs from the held state; `labels` maps existing image ids to "image N". */
export interface ImageChanges {
  removedIds: string[];
  altEdits: Record<string, string | null>;
  added: PendingImage[];
  labels?: Record<string, string>;
}

/** An image step that failed after the note was saved. */
export interface ImageFailure {
  label: string;
  reason: string;
}
