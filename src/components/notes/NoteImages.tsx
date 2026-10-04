import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MESSAGES } from "@/lib/messages";
import type { ImageUrlsResponse, NoteImageView } from "@/types";

interface Props {
  campaignId: string;
  noteId: string;
  noteName: string;
  images: NoteImageView[];
}

type FullState = { status: "loading" } | { status: "error" } | { status: "ready"; url: string };

export default function NoteImages({ campaignId, noteId, noteName, images }: Props) {
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(images.map((image) => [image.id, image.thumb_url])),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<FullState>({ status: "loading" });
  const imgRefs = useRef(new Map<string, HTMLImageElement>());
  const refreshed = useRef(new Set<string>());
  const fullRequest = useRef<AbortController | null>(null);

  const endpoint = (imageId: string) => `/api/campaigns/${campaignId}/notes/${noteId}/images/${imageId}`;
  const altFor = (image: NoteImageView, index: number) => image.alt_text ?? `${noteName} — image ${index + 1}`;

  // At most one refresh per image: a second failure leaves the broken state in place.
  async function refreshThumb(imageId: string) {
    if (refreshed.current.has(imageId)) return;
    refreshed.current.add(imageId);
    try {
      const response = await fetch(endpoint(imageId));
      if (!response.ok) return;
      const urls = (await response.json()) as ImageUrlsResponse;
      setThumbUrls((prev) => ({ ...prev, [imageId]: urls.thumb_url }));
    } catch {
      // Keep the broken state; never retry.
    }
  }

  // React doesn't replay an `error` event that fired before hydration.
  useEffect(() => {
    for (const [imageId, element] of imgRefs.current) {
      if (element.complete && element.naturalWidth === 0) {
        void refreshThumb(imageId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only check of the SSR'd images
  }, []);

  useEffect(
    () => () => {
      fullRequest.current?.abort();
    },
    [],
  );

  async function openImage(imageId: string) {
    fullRequest.current?.abort();
    const controller = new AbortController();
    fullRequest.current = controller;
    setOpenId(imageId);
    setFull({ status: "loading" });
    try {
      const response = await fetch(endpoint(imageId), { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      const urls = (await response.json()) as ImageUrlsResponse;
      if (fullRequest.current !== controller) return;
      setFull({ status: "ready", url: urls.url });
    } catch {
      if (fullRequest.current !== controller) return;
      setFull({ status: "error" });
    }
  }

  function closeImage() {
    fullRequest.current?.abort();
    fullRequest.current = null;
    setOpenId(null);
  }

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
                  if (element) imgRefs.current.set(image.id, element);
                  else imgRefs.current.delete(image.id);
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
          {full.status === "loading" && (
            <p className="p-8 text-center text-blue-100/80">{MESSAGES.IMAGE_FULL_LOADING}</p>
          )}
          {full.status === "error" && (
            <p role="alert" className="p-8 text-center text-red-300">
              {MESSAGES.IMAGE_FULL_LOAD_FAILED}
            </p>
          )}
          {full.status === "ready" && (
            <img src={full.url} alt={openAlt} className="max-h-[85vh] max-w-full rounded object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
