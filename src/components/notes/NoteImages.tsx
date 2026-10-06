import { useNoteImages } from "@/components/hooks/useNoteImages";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MESSAGES, imageAltFallback } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { NoteImageView } from "@/types";

interface Props {
  campaignId: string;
  noteId: string;
  noteName: string;
  images: NoteImageView[];
}

export default function NoteImages({ campaignId, noteId, noteName, images }: Props) {
  const { thumbUrls, openId, full, openImage, closeImage, onFullLoad, onFullError, refreshThumb, registerImg } =
    useNoteImages(campaignId, noteId, images);

  const altFor = (image: NoteImageView, index: number) => image.alt_text ?? imageAltFallback(noteName, index + 1);

  const openIndex = images.findIndex((image) => image.id === openId);
  const openImageView = openIndex >= 0 ? images[openIndex] : null;
  const openAlt = openImageView ? altFor(openImageView, openIndex) : "";

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4">
        {images.map((image, index) => {
          const url = thumbUrls[image.id];
          const alt = altFor(image, index);
          return url ? (
            <button
              key={image.id}
              type="button"
              onClick={() => void openImage(image.id)}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-purple-400 focus:outline-none"
            >
              <img
                ref={(element) => {
                  registerImg(image.id, element);
                }}
                src={url}
                alt={alt}
                loading="lazy"
                width={image.thumb_width ?? image.width}
                height={image.thumb_height ?? image.height}
                onError={() => void refreshThumb(image.id)}
                className="h-auto w-full"
              />
            </button>
          ) : (
            <div
              key={image.id}
              className="flex aspect-square items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-blue-100/70"
            >
              {MESSAGES.IMAGE_UNAVAILABLE}
            </div>
          );
        })}
      </div>

      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) closeImage();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="w-auto max-w-[95vw] border-white/10 bg-black/80 p-2 sm:max-w-[95vw]"
        >
          <DialogTitle className="sr-only">{openAlt}</DialogTitle>
          {(full.status === "loading" || (full.status === "ready" && !full.loaded)) && (
            <p className="p-8 text-center text-blue-100/80">{MESSAGES.IMAGE_FULL_LOADING}</p>
          )}
          {full.status === "error" && (
            <p role="alert" className="p-8 text-center text-red-300">
              {MESSAGES.IMAGE_FULL_LOAD_FAILED}
            </p>
          )}
          {full.status === "ready" && (
            <img
              src={full.url}
              alt={openAlt}
              onLoad={onFullLoad}
              onError={onFullError}
              className={cn("max-h-[85vh] max-w-full rounded object-contain", !full.loaded && "hidden")}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
