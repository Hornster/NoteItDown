import { useEffect, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  BrowserImageError,
  HeicDecoderLoadError,
  ImageTooLargeError,
  UnsupportedImageError,
} from "@/lib/images/errors";
import { convertHeicToJpeg, looksLikeHeic } from "@/lib/images/heic";
import { ALT_TEXT_MAX_LENGTH, MAX_IMAGES_PER_NOTE, PICKER_ACCEPT } from "@/lib/images/limits";
import { MESSAGES } from "@/lib/messages";
import type { HeldImageState, NoteImageView, PendingImage } from "@/types";

interface Props {
  /** Images already stored on the note (edit mode); `held.kept` starts as this list. */
  existing: NoteImageView[];
  held: HeldImageState;
  onChange: (update: (prev: HeldImageState) => HeldImageState) => void;
}

const altInputClass =
  "mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none";

function errorMessage(error: unknown): string {
  if (error instanceof UnsupportedImageError) return MESSAGES.IMAGE_UNSUPPORTED;
  if (error instanceof HeicDecoderLoadError) return MESSAGES.IMAGE_HEIC_DECODER_UNAVAILABLE;
  if (error instanceof ImageTooLargeError) return MESSAGES.IMAGE_TOO_LARGE;
  if (error instanceof BrowserImageError) return MESSAGES.IMAGE_BROWSER_FAILURE;
  return MESSAGES.GENERIC_IMAGE_ERROR;
}

function isAnimatedCapable(file: File, head: Uint8Array): boolean {
  if (file.type === "image/gif" || file.type === "image/webp") return true;
  const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  return text(0, 4) === "GIF8" || (text(0, 4) === "RIFF" && text(8, 12) === "WEBP");
}

async function readHead(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.slice(0, 32).arrayBuffer());
  } catch {
    return new Uint8Array(0);
  }
}

export default function NoteImagePicker({ existing, held, onChange }: Props) {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(held);

  useEffect(() => {
    latest.current = held;
  });

  // Revoke every remaining object URL when the form goes away.
  useEffect(
    () => () => {
      for (const p of latest.current.added) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },
    [],
  );

  const counted = held.kept.length + held.added.filter((p) => p.status !== "error").length;
  const full = counted >= MAX_IMAGES_PER_NOTE;
  const hasAnimated = held.added.some((p) => p.maybeAnimated);

  function patchPending(key: string, patch: Partial<PendingImage>) {
    onChange((prev) => ({ ...prev, added: prev.added.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  }

  async function processOne(key: string, file: File) {
    if (import.meta.env.SSR) return;
    const head = await readHead(file);
    const maybeAnimated = isAnimatedCapable(file, head);
    try {
      const { processImage } = await import("@/lib/images/compress");
      const processed = await processImage(file).catch(async (error: unknown) => {
        if (!(error instanceof UnsupportedImageError) || !looksLikeHeic(head)) throw error;
        return processImage(await convertHeicToJpeg(file));
      });
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

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const slots = Math.max(0, MAX_IMAGES_PER_NOTE - counted);
    const picks = files.slice(0, slots).map((file) => ({ key: crypto.randomUUID(), file }));
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
      queue.current = queue.current.then(() => processOne(key, file));
    }
  }

  function removePending(pending: PendingImage) {
    if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    onChange((prev) => ({ ...prev, added: prev.added.filter((p) => p.key !== pending.key) }));
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

  const originals = new Map(existing.map((e) => [e.id, e]));

  return (
    <div>
      <Label htmlFor="images">Images</Label>

      {held.kept.map((image) => {
        const original = originals.get(image.id) ?? image;
        const altValue = image.id in held.altEdits ? (held.altEdits[image.id] ?? "") : (original.alt_text ?? "");
        return (
          <div key={image.id} className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-start gap-3">
              {image.thumb_url ? (
                <img
                  src={image.thumb_url}
                  alt=""
                  width={image.thumb_width ?? image.width}
                  height={image.thumb_height ?? image.height}
                  className="h-20 w-auto rounded"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded bg-white/10 text-xs text-white/60">
                  Image unavailable
                </div>
              )}
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => {
                  removeKept(image);
                }}
                className="ml-auto shrink-0 text-white/60 transition-colors hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <input
              type="text"
              aria-label="Alt text"
              placeholder="Alt text (optional)"
              maxLength={ALT_TEXT_MAX_LENGTH}
              value={altValue}
              onChange={(e) => {
                editKeptAlt(image, e.target.value);
              }}
              className={altInputClass}
            />
          </div>
        );
      })}

      {held.added.map((pending) => (
        <div key={pending.key} className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-start gap-3">
            {pending.status === "ready" && pending.previewUrl && (
              <img
                src={pending.previewUrl}
                alt=""
                width={pending.processed?.thumbnail?.width ?? pending.processed?.image.width}
                height={pending.processed?.thumbnail?.height ?? pending.processed?.image.height}
                className="h-20 w-auto rounded"
              />
            )}
            <div className="min-w-0 text-sm">
              <p className="truncate text-blue-100/90">{pending.fileName}</p>
              {pending.status === "processing" && <p className="text-blue-100/70">{MESSAGES.IMAGE_PROCESSING}</p>}
              {pending.status === "error" && (
                <p role="alert" className="text-xs text-red-300">
                  {pending.error}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => {
                removePending(pending);
              }}
              className="ml-auto shrink-0 text-white/60 transition-colors hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
          {pending.status === "ready" && (
            <input
              type="text"
              aria-label="Alt text"
              placeholder="Alt text (optional)"
              maxLength={ALT_TEXT_MAX_LENGTH}
              value={pending.alt_text}
              onChange={(e) => {
                patchPending(pending.key, { alt_text: e.target.value });
              }}
              className={altInputClass}
            />
          )}
        </div>
      ))}

      <label
        htmlFor="images"
        className={`mt-2 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-white ${
          full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/10"
        }`}
      >
        <ImagePlus className="size-4" />
        Add image
      </label>
      <input
        id="images"
        type="file"
        accept={PICKER_ACCEPT}
        multiple
        disabled={full}
        onChange={handleFiles}
        className="sr-only"
      />

      <p className="mt-1 text-xs text-blue-100/60">{MESSAGES.IMAGE_COMPRESSED_HINT}</p>
      {hasAnimated && <p className="mt-1 text-xs text-blue-100/60">{MESSAGES.IMAGE_ANIMATED_NOTICE}</p>}
    </div>
  );
}
