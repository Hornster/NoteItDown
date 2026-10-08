/* eslint-disable no-console -- server-side service logs removal/signing failures it deliberately swallows */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DB_CONSTRAINT } from "@/lib/constants/db-constraints";
import { PG_ERROR } from "@/lib/constants/db-error-codes";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_NOTE, NOTE_IMAGES_BUCKET, STORED_IMAGE_MIMES } from "@/lib/images/limits";
import type {
  CommitImageCommand,
  CommitImageResponse,
  ImageUrlsResponse,
  NoteImage,
  NoteImageView,
  PrepareUploadCommand,
  PrepareUploadResponse,
  SignedUpload,
  UpdateImageResponse,
} from "@/types";

/** Thumbnail URLs live for 6 h to cover long sessions. */
const THUMB_URL_EXPIRY_SECONDS = 6 * 60 * 60;
/** Full-size URLs are fetched on demand and live for 5 minutes. */
const FULL_URL_EXPIRY_SECONDS = 300;
/** Storage `list` page size, also the batch size for `remove`. */
const STORAGE_PAGE_SIZE = 1000;

export type PrepareUploadResult =
  | { success: true; upload: PrepareUploadResponse }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "limit_reached" }
  | { success: false; reason: "unexpected"; error: unknown };

export type CommitImageResult =
  | { success: true; image: CommitImageResponse }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "invalid_upload" }
  | { success: false; reason: "limit_reached" }
  | { success: false; reason: "unexpected"; error: unknown };

export type UpdateImageAltTextResult =
  | { success: true; image: UpdateImageResponse }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "unexpected"; error: unknown };

export type DeleteImageResult =
  | { success: true }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "unexpected"; error: unknown };

export type GetImageUrlsResult =
  | { success: true; urls: ImageUrlsResponse }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "unexpected"; error: unknown };

type StoredMime = (typeof STORED_IMAGE_MIMES)[number];

function extensionFor(mime: StoredMime): "webp" | "jpg" {
  return mime === "image/webp" ? "webp" : "jpg";
}

/**
 * Builds the server-side object paths `{uid}/{campaign}/{note}/{uuid}.{ext}` and
 * `{uuid}-thumb.{ext}` with a fresh uuid. Clients never choose paths.
 */
export function buildImagePaths(
  userId: string,
  campaignId: string,
  noteId: string,
  mime: StoredMime,
  withThumbnail: boolean,
): { path: string; thumbPath: string | null } {
  const id = crypto.randomUUID();
  const ext = extensionFor(mime);
  const prefix = `${userId}/${campaignId}/${noteId}/${id}`;
  return { path: `${prefix}.${ext}`, thumbPath: withThumbnail ? `${prefix}-thumb.${ext}` : null };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `path` is exactly `{userId}/{campaignId}/{noteId}/{uuid}[-thumb].{webp|jpg}`. */
export function isOwnImagePath(path: string, userId: string, campaignId: string, noteId: string): boolean {
  const prefix = escapeRegExp(`${userId}/${campaignId}/${noteId}/`);
  const pattern = new RegExp(
    `^${prefix}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?\\.(webp|jpg)$`,
  );
  return pattern.test(path);
}

/** Subset of storage-js `FileObjectV2` (camelized) that the upload check reads. */
export interface UploadedObjectInfo {
  size?: number;
  contentType?: string;
}

/** Commit-time guard: size within the bucket limit and content type in the allow-list. */
export function validateUploadedObject(
  info: UploadedObjectInfo,
): { ok: true; size: number; contentType: StoredMime } | { ok: false } {
  const { size, contentType } = info;
  if (size === undefined || contentType === undefined) {
    return { ok: false };
  }
  if (size < 1 || size > MAX_IMAGE_BYTES) {
    return { ok: false };
  }
  const allowed = STORED_IMAGE_MIMES.find((mime) => mime === contentType);
  if (!allowed) {
    return { ok: false };
  }
  return { ok: true, size, contentType: allowed };
}

/** Ordered by position. Throws on query failure, like the other list services. */
export async function listNoteImages(supabase: SupabaseClient, noteId: string): Promise<NoteImage[]> {
  const { data, error } = await supabase
    .from("note_images")
    .select("*")
    .eq("note_id", noteId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`listNoteImages: query failed: ${error.message}`);
  }

  return data as NoteImage[];
}

/**
 * One batched signing call for all thumbnails (the original when there is no separate
 * thumbnail). A failure yields `thumb_url: null` per item and never throws.
 */
export async function toImageViews(supabase: SupabaseClient, images: NoteImage[]): Promise<NoteImageView[]> {
  const urlByPath = new Map<string, string>();

  if (images.length > 0) {
    try {
      const paths = images.map((image) => image.thumb_path ?? image.path);
      const { data, error } = await supabase.storage
        .from(NOTE_IMAGES_BUCKET)
        .createSignedUrls(paths, THUMB_URL_EXPIRY_SECONDS);
      if (error) {
        console.error("toImageViews: createSignedUrls failed", error);
      } else {
        for (const item of data) {
          if (!item.error && item.path && item.signedUrl) {
            urlByPath.set(item.path, item.signedUrl);
          }
        }
      }
    } catch (error) {
      console.error("toImageViews: createSignedUrls threw", error);
    }
  }

  return images.map((image) => ({
    id: image.id,
    position: image.position,
    alt_text: image.alt_text,
    width: image.width,
    height: image.height,
    thumb_width: image.thumb_width,
    thumb_height: image.thumb_height,
    thumb_url: urlByPath.get(image.thumb_path ?? image.path) ?? null,
  }));
}

async function noteExists(supabase: SupabaseClient, campaignId: string, noteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("notes")
    .select("id")
    .eq("id", noteId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data !== null;
}

async function usedPositions(supabase: SupabaseClient, noteId: string): Promise<number[]> {
  const { data, error } = await supabase.from("note_images").select("position").eq("note_id", noteId);
  if (error) {
    throw error;
  }
  return (data as { position: number }[]).map((row) => row.position);
}

function lowestFreePosition(used: number[]): number | null {
  for (let position = 0; position < MAX_IMAGES_PER_NOTE; position++) {
    if (!used.includes(position)) {
      return position;
    }
  }
  return null;
}

async function removeObjects(supabase: SupabaseClient, paths: (string | null)[]): Promise<void> {
  const toRemove = paths.filter((path): path is string => path !== null);
  if (toRemove.length === 0) {
    return;
  }
  try {
    const { error } = await supabase.storage.from(NOTE_IMAGES_BUCKET).remove(toRemove);
    if (error) {
      console.error("note-images: failed to remove objects", toRemove, error);
    }
  } catch (error) {
    console.error("note-images: failed to remove objects", toRemove, error);
  }
}

/**
 * Drops paths a note_images row still references, so a failed (e.g. replayed) commit never
 * removes a live row's objects. On a lookup error nothing is removed: an orphan is accepted,
 * a row pointing at a missing file is not.
 */
async function unreferencedPaths(supabase: SupabaseClient, paths: (string | null)[]): Promise<string[]> {
  const candidates = paths.filter((path): path is string => path !== null);
  if (candidates.length === 0) {
    return [];
  }
  const [byPath, byThumb] = await Promise.all([
    supabase.from("note_images").select("path").in("path", candidates),
    supabase.from("note_images").select("thumb_path").in("thumb_path", candidates),
  ]);
  if (byPath.error || byThumb.error) {
    console.error("note-images: failed to check referenced paths", candidates, byPath.error ?? byThumb.error);
    return [];
  }
  const referenced = new Set<string | null>([
    ...byPath.data.map((row: { path: string }) => row.path),
    ...byThumb.data.map((row: { thumb_path: string | null }) => row.thumb_path),
  ]);
  return candidates.filter((path) => !referenced.has(path));
}

/**
 * Checks the caller owns the note and it has a free slot, then signs upload URLs for
 * server-built paths. Signing is the gate: the signed PUT does not re-check RLS.
 */
export async function prepareUpload(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  noteId: string,
  command: PrepareUploadCommand,
): Promise<PrepareUploadResult> {
  try {
    if (!(await noteExists(supabase, campaignId, noteId))) {
      return { success: false, reason: "not_found" };
    }

    const { count, error: countError } = await supabase
      .from("note_images")
      .select("*", { count: "exact", head: true })
      .eq("note_id", noteId);
    if (countError) {
      return { success: false, reason: "unexpected", error: countError };
    }
    if ((count ?? 0) >= MAX_IMAGES_PER_NOTE) {
      return { success: false, reason: "limit_reached" };
    }

    const { path, thumbPath } = buildImagePaths(userId, campaignId, noteId, command.mime, command.with_thumbnail);
    const bucket = supabase.storage.from(NOTE_IMAGES_BUCKET);

    const sign = async (objectPath: string): Promise<SignedUpload> => {
      const { data, error } = await bucket.createSignedUploadUrl(objectPath);
      if (error) {
        throw error;
      }
      return { path: objectPath, signed_url: data.signedUrl, token: data.token };
    };

    const image = await sign(path);
    const thumbnail = thumbPath ? await sign(thumbPath) : null;
    return { success: true, upload: { image, thumbnail } };
  } catch (error) {
    return { success: false, reason: "unexpected", error };
  }
}

function isPositionConflict(error: { code?: string; message?: string; details?: string }): boolean {
  return (
    error.code === PG_ERROR.UNIQUE_VIOLATION &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(DB_CONSTRAINT.NOTE_IMAGES_NOTE_POSITION_KEY)
  );
}

/**
 * Verifies the uploaded objects (own paths, size, content type), inserts the row at the
 * lowest free position, and removes the objects again on any failure after upload.
 */
export async function commitImage(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  noteId: string,
  command: CommitImageCommand,
): Promise<CommitImageResult> {
  const { path, thumb_path: thumbPath } = command;

  if (
    !isOwnImagePath(path, userId, campaignId, noteId) ||
    (thumbPath !== null && !isOwnImagePath(thumbPath, userId, campaignId, noteId))
  ) {
    // Not our objects to touch: never remove foreign paths.
    return { success: false, reason: "invalid_upload" };
  }

  const fail = async <T extends { success: false }>(result: T): Promise<T> => {
    await removeObjects(supabase, await unreferencedPaths(supabase, [path, thumbPath]));
    return result;
  };

  try {
    if (!(await noteExists(supabase, campaignId, noteId))) {
      return await fail({ success: false as const, reason: "not_found" as const });
    }

    const bucket = supabase.storage.from(NOTE_IMAGES_BUCKET);
    let imageInfo: Extract<ReturnType<typeof validateUploadedObject>, { ok: true }> | null = null;
    for (const objectPath of thumbPath ? [path, thumbPath] : [path]) {
      const { data, error } = await bucket.info(objectPath);
      const checked = error ? ({ ok: false } as const) : validateUploadedObject(data);
      if (!checked.ok) {
        return await fail({ success: false as const, reason: "invalid_upload" as const });
      }
      if (objectPath === path) {
        imageInfo = checked;
      }
    }
    if (!imageInfo) {
      return await fail({ success: false as const, reason: "invalid_upload" as const });
    }

    const insert = async (position: number) =>
      supabase
        .from("note_images")
        .insert({
          campaign_id: campaignId,
          note_id: noteId,
          position,
          path,
          thumb_path: thumbPath,
          mime: imageInfo.contentType,
          width: command.width,
          height: command.height,
          thumb_width: command.thumb_width,
          thumb_height: command.thumb_height,
          byte_size: imageInfo.size,
          alt_text: command.alt_text,
        })
        .select("id, position")
        .single();

    let position = lowestFreePosition(await usedPositions(supabase, noteId));
    if (position === null) {
      return await fail({ success: false as const, reason: "limit_reached" as const });
    }

    let response = await insert(position);
    if (response.error && isPositionConflict(response.error)) {
      // A concurrent commit took the slot: work out the free position again, once.
      position = lowestFreePosition(await usedPositions(supabase, noteId));
      if (position === null) {
        return await fail({ success: false as const, reason: "limit_reached" as const });
      }
      response = await insert(position);
    }

    if (response.error) {
      const { error } = response;
      if (isPositionConflict(error)) {
        return await fail({ success: false as const, reason: "limit_reached" as const });
      }
      if (error.code === PG_ERROR.FOREIGN_KEY_VIOLATION || error.code === PG_ERROR.INSUFFICIENT_PRIVILEGE) {
        return await fail({ success: false as const, reason: "not_found" as const });
      }
      return await fail({ success: false as const, reason: "unexpected" as const, error });
    }

    return { success: true, image: response.data };
  } catch (error) {
    return await fail({ success: false as const, reason: "unexpected" as const, error });
  }
}

/** Filters on campaign, note and image id so the URL stays authoritative. */
export async function updateImageAltText(
  supabase: SupabaseClient,
  campaignId: string,
  noteId: string,
  imageId: string,
  altText: string | null,
): Promise<UpdateImageAltTextResult> {
  const { data, error } = await supabase
    .from("note_images")
    .update({ alt_text: altText })
    .eq("id", imageId)
    .eq("campaign_id", campaignId)
    .eq("note_id", noteId)
    .select("id, alt_text");

  if (error) {
    return { success: false, reason: "unexpected", error };
  }
  const row = (data as UpdateImageResponse[]).at(0);
  if (!row) {
    return { success: false, reason: "not_found" };
  }
  return { success: true, image: row };
}

/** Deletes the row first (RLS), then the objects; an object removal failure is logged, not surfaced. */
export async function deleteImage(
  supabase: SupabaseClient,
  campaignId: string,
  noteId: string,
  imageId: string,
): Promise<DeleteImageResult> {
  const { data, error } = await supabase
    .from("note_images")
    .delete()
    .eq("id", imageId)
    .eq("campaign_id", campaignId)
    .eq("note_id", noteId)
    .select("path, thumb_path");

  if (error) {
    return { success: false, reason: "unexpected", error };
  }
  const row = (data as Pick<NoteImage, "path" | "thumb_path">[]).at(0);
  if (!row) {
    return { success: false, reason: "not_found" };
  }

  await removeObjects(supabase, [row.path, row.thumb_path]);
  return { success: true };
}

/**
 * Removes every object under a note's folder. Used after the note row is gone (the
 * cascade removes rows, not objects). Errors are logged and swallowed.
 */
export async function removeNoteFolder(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  noteId: string,
): Promise<void> {
  const prefix = `${userId}/${campaignId}/${noteId}`;
  try {
    const bucket = supabase.storage.from(NOTE_IMAGES_BUCKET);
    const { data, error } = await bucket.list(prefix, { limit: STORAGE_PAGE_SIZE });
    if (error) {
      console.error("removeNoteFolder: list failed", prefix, error);
      return;
    }
    const paths = data.map((object) => `${prefix}/${object.name}`);
    if (paths.length > 0) {
      await removeObjects(supabase, paths);
    }
  } catch (error) {
    console.error("removeNoteFolder: failed", prefix, error);
  }
}

/** Fresh signed URLs: full size (5 min) and thumbnail (6 h, the original when there is no thumbnail). */
export async function getImageUrls(
  supabase: SupabaseClient,
  campaignId: string,
  noteId: string,
  imageId: string,
): Promise<GetImageUrlsResult> {
  const { data, error } = await supabase
    .from("note_images")
    .select("path, thumb_path")
    .eq("id", imageId)
    .eq("campaign_id", campaignId)
    .eq("note_id", noteId)
    .maybeSingle();

  if (error) {
    return { success: false, reason: "unexpected", error };
  }
  if (!data) {
    return { success: false, reason: "not_found" };
  }

  const row = data as Pick<NoteImage, "path" | "thumb_path">;
  try {
    const bucket = supabase.storage.from(NOTE_IMAGES_BUCKET);
    const [full, thumb] = await Promise.all([
      bucket.createSignedUrl(row.path, FULL_URL_EXPIRY_SECONDS),
      bucket.createSignedUrl(row.thumb_path ?? row.path, THUMB_URL_EXPIRY_SECONDS),
    ]);
    if (full.error) {
      return { success: false, reason: "unexpected", error: full.error };
    }
    if (thumb.error) {
      return { success: false, reason: "unexpected", error: thumb.error };
    }
    return { success: true, urls: { url: full.data.signedUrl, thumb_url: thumb.data.signedUrl } };
  } catch (signError) {
    return { success: false, reason: "unexpected", error: signError };
  }
}
