/** User-facing strings shared by API routes and the UI. New code uses these instead of literals. */
export const MESSAGES = {
  SIGNED_IN_REQUIRED: "You must be signed in.",
  SUPABASE_NOT_CONFIGURED: "Supabase is not configured.",
  NOTE_NOT_FOUND: "This note doesn't exist or isn't yours.",
  IMAGE_LIMIT_REACHED: "A note can have at most 2 images.",
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
  IMAGE_COMPRESSED_HINT: "Images are compressed before upload.",
  IMAGE_ANIMATED_NOTICE: "Animated images become static.",
  IMAGE_UNAVAILABLE: "Image unavailable",
  IMAGE_FULL_LOADING: "Loading image…",
  IMAGE_FULL_LOAD_FAILED: "The full-size image couldn't be loaded. Please try again.",
  IMAGE_FAILURE_NOTICE_HEADING: "The note was saved, but some images were not.",
} as const;
