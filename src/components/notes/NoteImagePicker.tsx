import { ImagePlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImagePicks } from "@/components/hooks/useImagePicks";
import { useThumbFallback } from "@/components/hooks/useThumbFallback";
import { ALT_TEXT_MAX_LENGTH, PICKER_ACCEPT } from "@/lib/images/limits";
import { imagesIgnoredNotice, MESSAGES } from "@/lib/constants/messages";
import { cn } from "@/lib/utils";
import type { HeldImageState, NoteImageView } from "@/types";

interface Props {
  /** Images already stored on the note (edit mode); `held.kept` starts as this list. */
  existing: NoteImageView[];
  held: HeldImageState;
  onChange: (update: (prev: HeldImageState) => HeldImageState) => void;
}

const altInputClass = "mt-2 rounded-lg px-3 py-1.5 text-sm";

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
      <Label htmlFor="images">{MESSAGES.IMAGES_LABEL}</Label>

      {held.kept.map((image) => {
        const original = originals.get(image.id) ?? image;
        const altValue = image.id in held.altEdits ? (held.altEdits[image.id] ?? "") : (original.alt_text ?? "");
        return (
          <div key={image.id} className="border-input bg-background mt-2 rounded-lg border p-3">
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
                <div className="border-input bg-background text-muted-foreground flex h-20 w-20 items-center justify-center rounded border text-xs">
                  {MESSAGES.IMAGE_UNAVAILABLE}
                </div>
              )}
              <button
                type="button"
                aria-label={MESSAGES.IMAGE_REMOVE_LABEL}
                onClick={() => {
                  removeKept(image);
                }}
                className="text-muted-foreground hover:text-foreground ml-auto shrink-0 transition-colors"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <Input
              type="text"
              aria-label={MESSAGES.IMAGE_ALT_TEXT_LABEL}
              placeholder={MESSAGES.IMAGE_ALT_TEXT_PLACEHOLDER}
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
        <div key={pending.key} className="border-input bg-background mt-2 rounded-lg border p-3">
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
              <p className="text-foreground truncate">{pending.fileName}</p>
              {pending.status === "processing" && <p className="text-muted-foreground">{MESSAGES.IMAGE_PROCESSING}</p>}
              {pending.status === "error" && (
                <p role="alert" className="text-destructive-text text-xs">
                  {pending.error}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={MESSAGES.IMAGE_REMOVE_LABEL}
              onClick={() => {
                removePending(pending);
              }}
              className="text-muted-foreground hover:text-foreground ml-auto shrink-0 transition-colors"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {pending.status === "ready" && (
            <Input
              type="text"
              aria-label={MESSAGES.IMAGE_ALT_TEXT_LABEL}
              placeholder={MESSAGES.IMAGE_ALT_TEXT_PLACEHOLDER}
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
          "border-input text-foreground mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          full ? "cursor-not-allowed opacity-50" : "hover:bg-accent cursor-pointer",
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

      {ignoredCount > 0 && <p className="text-primary mt-1 text-xs">{imagesIgnoredNotice(ignoredCount)}</p>}
      <p className="text-muted-foreground mt-1 text-xs">{MESSAGES.IMAGE_COMPRESSED_HINT}</p>
      {hasAnimated && <p className="text-muted-foreground mt-1 text-xs">{MESSAGES.IMAGE_ANIMATED_NOTICE}</p>}
    </div>
  );
}
