/**
 * Single source for every number the client, server and tests share for note images.
 * The bucket limits in supabase/migrations/20261003120000_note_images.sql must match.
 */

export const NOTE_IMAGES_BUCKET = "note-images";

export const MAX_IMAGES_PER_NOTE = 2;

/** Bucket `file_size_limit`: 2.5 MiB, in bytes. Applies to each object separately. */
export const MAX_IMAGE_BYTES = 2_621_440;
/** Browser compression ceiling: 2.4 MiB, so the bucket never rejects a compressed file. */
export const CLIENT_IMAGE_CEILING_BYTES = 2_516_582;

/** Longest side of a thumbnail, in pixels. */
export const THUMBNAIL_MAX_SIDE = 512;
/** iOS canvas area limit. */
export const MAX_CANVAS_AREA = 16_777_216;
/** WebP maximum per side. */
export const MAX_IMAGE_SIDE = 16_383;

/** MIME types the bucket accepts. WebP normally, JPEG where the browser cannot encode WebP. */
export const STORED_IMAGE_MIMES = ["image/webp", "image/jpeg"] as const;

/** `accept` attribute for the file picker. HEIC/HEIF are converted in the browser. */
export const PICKER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif";

export const ALT_TEXT_MAX_LENGTH = 200;

/** A pick still processing after this long is marked as failed so the queue and Save are not stuck. */
export const IMAGE_PROCESSING_TIMEOUT_MS = 30_000;
