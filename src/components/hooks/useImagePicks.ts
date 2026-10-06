import { useEffect, useRef, useState } from "react";
import {
  BrowserImageError,
  HeicDecoderLoadError,
  ImageProcessingTimeoutError,
  ImageTooLargeError,
  UnsupportedImageError,
} from "@/lib/images/errors";
import { convertHeicToJpeg, looksLikeHeic } from "@/lib/images/heic";
import { IMAGE_PROCESSING_TIMEOUT_MS, MAX_IMAGES_PER_NOTE } from "@/lib/images/limits";
import { MESSAGES } from "@/lib/messages";
import type { HeldImageState, NoteImageView, PendingImage } from "@/types";

type HeldUpdater = (update: (prev: HeldImageState) => HeldImageState) => void;

interface UseImagePicksResult {
  /** Kept + non-error picks reached the per-note cap. */
  full: boolean;
  hasAnimated: boolean;
  /** Files dropped from the last pick because there were not enough free slots. */
  ignoredCount: number;
  addFiles: (files: File[]) => void;
  removePending: (pending: PendingImage) => void;
  setPendingAlt: (key: string, altText: string) => void;
  removeKept: (image: NoteImageView) => void;
  editKeptAlt: (image: NoteImageView, value: string) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof UnsupportedImageError) return MESSAGES.IMAGE_UNSUPPORTED;
  if (error instanceof HeicDecoderLoadError) return MESSAGES.IMAGE_HEIC_DECODER_UNAVAILABLE;
  if (error instanceof ImageTooLargeError) return MESSAGES.IMAGE_TOO_LARGE;
  if (error instanceof BrowserImageError) return MESSAGES.IMAGE_BROWSER_FAILURE;
  if (error instanceof ImageProcessingTimeoutError) return MESSAGES.IMAGE_PROCESSING_TIMEOUT;
  return MESSAGES.GENERIC_IMAGE_ERROR;
}

function isAnimatedCapable(file: File, head: Uint8Array): boolean {
  if (file.type === "image/gif" || file.type === "image/webp") return true;
  const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  return text(0, 4) === "GIF8" || (text(0, 4) === "RIFF" && text(8, 12) === "WEBP");
}

/** Rejects with `ImageProcessingTimeoutError` if `work` hasn't settled within `ms`; the work itself keeps running. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ImageProcessingTimeoutError());
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function readHead(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.slice(0, 32).arrayBuffer());
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Held image state for NoteImagePicker: processes picks one at a time (compression loaded lazily,
 * HEIC fallback), owns the preview object URLs, and applies removals and alt edits through `onChange`.
 */
export function useImagePicks(held: HeldImageState, onChange: HeldUpdater): UseImagePicksResult {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(held);
  const [ignoredCount, setIgnoredCount] = useState(0);
  // Picks removed (or the whole form unmounted) while still in the queue: skip their work and never create URLs.
  const dropped = useRef(new Set<string>());
  const unmounted = useRef(false);
  const isGone = (key: string) => unmounted.current || dropped.current.has(key);

  useEffect(() => {
    latest.current = held;
  });

  // Revoke every remaining object URL when the form goes away.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      for (const p of latest.current.added) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, []);

  const counted = held.kept.length + held.added.filter((p) => p.status !== "error").length;
  const full = counted >= MAX_IMAGES_PER_NOTE;
  const hasAnimated = held.added.some((p) => p.maybeAnimated);

  function patchPending(key: string, patch: Partial<PendingImage>) {
    onChange((prev) => ({ ...prev, added: prev.added.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  }

  async function processOne(key: string, file: File) {
    if (import.meta.env.SSR || isGone(key)) return;
    const head = await readHead(file);
    const maybeAnimated = isAnimatedCapable(file, head);
    try {
      const work = (async () => {
        const { processImage } = await import("@/lib/images/compress");
        return processImage(file).catch(async (error: unknown) => {
          if (!(error instanceof UnsupportedImageError) || !looksLikeHeic(head)) throw error;
          return processImage(await convertHeicToJpeg(file));
        });
      })();
      const processed = await withTimeout(work, IMAGE_PROCESSING_TIMEOUT_MS);
      if (isGone(key)) return;
      patchPending(key, {
        status: "ready",
        processed,
        previewUrl: URL.createObjectURL(processed.image.blob),
        maybeAnimated,
      });
    } catch (error) {
      patchPending(key, { status: "error", error: errorMessage(error), maybeAnimated });
    }
  }

  function addFiles(files: File[]) {
    const slots = Math.max(0, MAX_IMAGES_PER_NOTE - counted);
    const picks = files.slice(0, slots).map((file) => ({ key: crypto.randomUUID(), file }));
    setIgnoredCount(files.length - picks.length);
    if (picks.length === 0) return;

    onChange((prev) => ({
      ...prev,
      added: [
        ...prev.added,
        ...picks.map(({ key, file }): PendingImage => ({
          key,
          fileName: file.name,
          status: "processing",
          alt_text: "",
        })),
      ],
    }));
    // One at a time: a 48 MP decode is ~192 MB of RGBA.
    for (const { key, file } of picks) {
      // processOne catches its own errors; the catch only keeps a future regression from stalling the queue.
      queue.current = queue.current.then(() => processOne(key, file)).catch(() => undefined);
    }
  }

  function removePending(pending: PendingImage) {
    dropped.current.add(pending.key);
    if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    onChange((prev) => ({ ...prev, added: prev.added.filter((p) => p.key !== pending.key) }));
  }

  function setPendingAlt(key: string, altText: string) {
    patchPending(key, { alt_text: altText });
  }

  function removeKept(image: NoteImageView) {
    onChange((prev) => {
      const { [image.id]: _dropped, ...altEdits } = prev.altEdits;
      return {
        ...prev,
        kept: prev.kept.filter((k) => k.id !== image.id),
        removedIds: [...prev.removedIds, image.id],
        altEdits,
      };
    });
  }

  function editKeptAlt(image: NoteImageView, value: string) {
    const next = value.trim() === "" ? null : value;
    onChange((prev) => {
      const { [image.id]: _dropped, ...rest } = prev.altEdits;
      return { ...prev, altEdits: next === (image.alt_text ?? null) ? rest : { ...rest, [image.id]: next } };
    });
  }

  return { full, hasAnimated, ignoredCount, addFiles, removePending, setPendingAlt, removeKept, editKeptAlt };
}
