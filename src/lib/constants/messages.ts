import { ALT_TEXT_MAX_LENGTH, MAX_IMAGES_PER_NOTE } from "@/lib/images/limits";

/** User-facing strings shared by API routes and the UI. New code uses these instead of literals. */
export const MESSAGES = {
  SIGNED_IN_REQUIRED: "You must be signed in.",
  SUPABASE_NOT_CONFIGURED: "Supabase is not configured.",
  INVALID_JSON_BODY: "Request body must be valid JSON.",
  NOTE_NOT_FOUND: "This note doesn't exist or isn't yours.",
  IMAGE_LIMIT_REACHED: `A note can have at most ${String(MAX_IMAGES_PER_NOTE)} images.`,
  IMAGE_NOT_FOUND: "Image not found.",
  IMAGE_UPLOAD_INVALID: "The uploaded image is not valid. Please try another file.",
  GENERIC_IMAGE_ERROR: "Something went wrong while handling the image. Please try again.",
  NETWORK_ERROR: "Network error. Please check your connection and try again.",
  IMAGE_UNSUPPORTED: "This file is unsupported or corrupt. Try a JPEG, PNG, WebP or GIF.",
  IMAGE_HEIC_DECODER_UNAVAILABLE:
    "Cannot retrieve HEIC conversion library. Make sure you are connected to the Internet.",
  IMAGE_TOO_LARGE: "This image can't be compressed small enough. Try a smaller image.",
  IMAGE_BROWSER_FAILURE: "Your browser couldn't process this image. Try another browser or a different file.",
  IMAGE_UPLOAD_FAILED: "The image upload failed.",
  IMAGE_PROCESSING: "Processing…",
  IMAGE_PROCESSING_TIMEOUT: "Processing this image took too long. Try a smaller image or another browser.",
  IMAGE_COMPRESSED_HINT: "Images are compressed before upload.",
  IMAGE_ANIMATED_NOTICE: "Animated images become static.",
  IMAGE_UNAVAILABLE: "Image unavailable",
  IMAGE_LABEL_FALLBACK: "image",
  IMAGES_LOAD_FAILED:
    "Images couldn't be loaded right now. You can still edit the text; try again later to change images.",
  NOTE_IMAGES_LOAD_FAILED: "Images couldn't be loaded right now. Try reloading the page later.",
  IMAGE_FULL_LOADING: "Loading image…",
  IMAGE_FULL_LOAD_FAILED: "The full-size image couldn't be loaded. Please try again.",
  IMAGE_ALT_TEXT_TOO_LONG: `Alt text must be at most ${String(ALT_TEXT_MAX_LENGTH)} characters.`,
  IMAGE_THUMBNAIL_FIELDS_MISMATCH: "Thumbnail path and dimensions must be provided together.",
  IMAGES_LABEL: "Images",
  IMAGE_REMOVE_LABEL: "Remove image",
  IMAGE_ALT_TEXT_LABEL: "Alt text",
  IMAGE_ALT_TEXT_PLACEHOLDER: "Alt text (optional)",
  NOTICE_DISMISS_LABEL: "Dismiss",
  FOOTER_LICENSES_LINK: "Third-party licences",
  IMAGE_FAILURE_NOTICE_HEADING: "The note was saved, but some images were not.",
} as const;

/** 1-based label for an image without a file name, e.g. in the image-failure notice. */
export function imageLabel(n: number): string {
  return `image ${String(n)}`;
}

/** Alt text for a note image without its own, e.g. "Map of Waterdeep — image 2" (1-based display index). */
export function imageAltFallback(noteName: string, n: number): string {
  return `${noteName} — ${imageLabel(n)}`;
}

/** Shown when a multi-file pick has more files than free image slots. */
export function imagesIgnoredNotice(ignored: number): string {
  return `${MESSAGES.IMAGE_LIMIT_REACHED} ${String(ignored)} ${ignored === 1 ? "file was" : "files were"} not added.`;
}
