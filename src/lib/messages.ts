/** User-facing strings shared by API routes and the UI. New code uses these instead of literals. */
export const MESSAGES = {
  SIGNED_IN_REQUIRED: "You must be signed in.",
  SUPABASE_NOT_CONFIGURED: "Supabase is not configured.",
  NOTE_NOT_FOUND: "This note doesn't exist or isn't yours.",
  IMAGE_LIMIT_REACHED: "A note can have at most 2 images.",
  IMAGE_NOT_FOUND: "Image not found.",
  IMAGE_UPLOAD_INVALID: "The uploaded image is not valid. Please try another file.",
  GENERIC_IMAGE_ERROR: "Something went wrong while handling the image. Please try again.",
} as const;
