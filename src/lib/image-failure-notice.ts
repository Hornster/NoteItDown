import type { ImageFailure } from "@/types";

export const IMAGE_FAILURE_NOTICE_KEY = "noteitdown:image-failure";

export interface ImageFailureNotice {
  noteId: string;
  failures: ImageFailure[];
}

type NoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isImageFailureNotice(value: unknown): value is ImageFailureNotice {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.noteId === "string" &&
    Array.isArray(v.failures) &&
    v.failures.every(
      (f) =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Record<string, unknown>).label === "string" &&
        typeof (f as Record<string, unknown>).reason === "string",
    )
  );
}

/** Stores a one-shot notice for the next page load. Never throws (storage may be blocked). */
export function writeImageFailureNotice(storage: NoticeStorage, notice: ImageFailureNotice): void {
  try {
    storage.setItem(IMAGE_FAILURE_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    // Storage unavailable: the note itself is already saved.
  }
}

/** Reads and always clears the stored notice; returns it only when it parses and matches `noteId`. Never throws. */
export function takeImageFailureNotice(storage: NoticeStorage, noteId: string): ImageFailureNotice | null {
  let raw: string | null;
  try {
    raw = storage.getItem(IMAGE_FAILURE_NOTICE_KEY);
    storage.removeItem(IMAGE_FAILURE_NOTICE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isImageFailureNotice(parsed) && parsed.noteId === noteId ? parsed : null;
  } catch {
    return null;
  }
}
