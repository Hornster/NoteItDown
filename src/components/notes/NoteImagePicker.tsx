import { ImagePlus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useImagePicks } from "@/components/hooks/useImagePicks";
import { useThumbFallback } from "@/components/hooks/useThumbFallback";
import { ALT_TEXT_MAX_LENGTH, PICKER_ACCEPT } from "@/lib/images/limits";
import { imagesIgnoredNotice, MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { HeldImageState, NoteImageView } from "@/types";

interface Props {
  /** Images already stored on the note (edit mode); `held.kept` starts as this list. */
  existing: NoteImageView[];
  held: HeldImageState;
  onChange: (update: (prev: HeldImageState) => HeldImageState) => void;
}

const altInputClass =
  "mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none";

export default function NoteImagePicker({ existing, held, onChange }: Props) {
  const { full, hasAnimated, ignoredCount, addFiles, removePending, setPendingAlt, removeKept, editKeptAlt } =
    useImagePicks(held, onChange);
  const { isFailed, onThumbError, registerThumb } = useThumbFallback();

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    addFiles(files);
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
              {image.thumb_url && !isFailed(image.id) ? (
                <img
                  ref={(element) => {
                    registerThumb(image.id, element);
                  }}
                  src={image.thumb_url}
                  alt=""
                  width={image.thumb_width ?? image.width}
                  height={image.thumb_height ?? image.height}
                  onError={() => {
                    onThumbError(image.id);
                  }}
                  className="h-20 w-auto rounded"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded bg-white/10 text-xs text-white/60">
                  {MESSAGES.IMAGE_UNAVAILABLE}
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
                setPendingAlt(pending.key, e.target.value);
              }}
              className={altInputClass}
            />
          )}
        </div>
      ))}

      <label
        htmlFor="images"
        className={cn(
          "mt-2 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-white",
          full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/10",
        )}
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

      {ignoredCount > 0 && <p className="mt-1 text-xs text-amber-200">{imagesIgnoredNotice(ignoredCount)}</p>}
      <p className="mt-1 text-xs text-blue-100/60">{MESSAGES.IMAGE_COMPRESSED_HINT}</p>
      {hasAnimated && <p className="mt-1 text-xs text-blue-100/60">{MESSAGES.IMAGE_ANIMATED_NOTICE}</p>}
    </div>
  );
}
