import { z } from "zod";

import { MESSAGES } from "@/lib/constants/messages";
import { ALT_TEXT_MAX_LENGTH, MAX_IMAGE_SIDE, STORED_IMAGE_MIMES } from "@/lib/images/limits";
import type { CommitImageCommand, PrepareUploadCommand, UpdateImageCommand } from "@/types";

/** POST .../images/uploads body. */
export const prepareUploadSchema = z
  .object({
    mime: z.enum(STORED_IMAGE_MIMES),
    with_thumbnail: z.boolean(),
  })
  .strict();

/** Trimmed; an empty (or whitespace-only) value becomes null. Mirrors note_images.alt_text check. */
const altTextSchema = z
  .string()
  .trim()
  .max(ALT_TEXT_MAX_LENGTH, MESSAGES.IMAGE_ALT_TEXT_TOO_LONG)
  .nullable()
  .transform((value) => (value === null || value === "" ? null : value));

const dimensionSchema = z.number().int().positive().max(MAX_IMAGE_SIDE);

/** POST .../images body. Thumbnail fields are all null or all set. */
export const commitImageSchema = z
  .object({
    path: z.string().min(1),
    thumb_path: z.string().min(1).nullable(),
    width: dimensionSchema,
    height: dimensionSchema,
    thumb_width: dimensionSchema.nullable(),
    thumb_height: dimensionSchema.nullable(),
    alt_text: altTextSchema,
  })
  .strict()
  .refine(
    (v) => {
      const set = [v.thumb_path, v.thumb_width, v.thumb_height].filter((x) => x !== null).length;
      return set === 0 || set === 3;
    },
    { message: MESSAGES.IMAGE_THUMBNAIL_FIELDS_MISMATCH, path: ["thumb_path"] },
  );

/** PATCH .../images/[imageId] body. */
export const updateImageSchema = z.object({ alt_text: altTextSchema }).strict();

// Compile-time checks: inferred outputs must stay assignable to the shared DTOs.
type _AssertAssignable<T extends U, U> = T;
export type _PrepareMatches = _AssertAssignable<z.infer<typeof prepareUploadSchema>, PrepareUploadCommand>;
export type _CommitMatches = _AssertAssignable<z.infer<typeof commitImageSchema>, CommitImageCommand>;
export type _UpdateMatches = _AssertAssignable<z.infer<typeof updateImageSchema>, UpdateImageCommand>;
