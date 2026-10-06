import { useEffect, useRef, useState } from "react";
import type { ImageUrlsResponse, NoteImageView } from "@/types";

export type FullImageState =
  { status: "loading" } | { status: "error" } | { status: "ready"; url: string; loaded: boolean };

interface UseNoteImagesResult {
  thumbUrls: Record<string, string | null>;
  openId: string | null;
  full: FullImageState;
  openImage: (imageId: string) => Promise<void>;
  closeImage: () => void;
  onFullLoad: () => void;
  onFullError: () => void;
  refreshThumb: (imageId: string) => Promise<void>;
  registerImg: (imageId: string, element: HTMLImageElement | null) => void;
}

/**
 * State for the note page's image gallery. Thumbnail URLs start from the server-signed views and
 * are refreshed at most once per image through GET .../images/[imageId] (on `onError`, or on mount
 * for images that already failed before hydration). Opening an image GETs its short-lived
 * full-size URL; a response for a request that was superseded or closed is dropped.
 */
export function useNoteImages(campaignId: string, noteId: string, images: NoteImageView[]): UseNoteImagesResult {
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(images.map((image) => [image.id, image.thumb_url])),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<FullImageState>({ status: "loading" });
  const imgRefs = useRef(new Map<string, HTMLImageElement>());
  const refreshed = useRef(new Map<string, "pending" | "done">());
  const fullRequest = useRef<AbortController | null>(null);

  const endpoint = (imageId: string) => `/api/campaigns/${campaignId}/notes/${noteId}/images/${imageId}`;

  // At most one refresh per image. A failed refresh, or a failure after it, shows the "Image
  // unavailable" placeholder (null URL) instead of a broken image; a failure while it's in flight is ignored.
  async function refreshThumb(imageId: string) {
    const state = refreshed.current.get(imageId);
    if (state === "pending") return;
    if (state === "done") {
      setThumbUrls((prev) => ({ ...prev, [imageId]: null }));
      return;
    }
    refreshed.current.set(imageId, "pending");
    let fresh: string | null = null;
    try {
      const response = await fetch(endpoint(imageId));
      if (response.ok) fresh = ((await response.json()) as ImageUrlsResponse).thumb_url;
    } catch {
      // Fall through to the placeholder; never retry.
    }
    refreshed.current.set(imageId, "done");
    setThumbUrls((prev) => ({ ...prev, [imageId]: fresh }));
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
      setFull({ status: "ready", url: urls.url, loaded: false });
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

  // The <img> reports on the bytes; ignore events that arrive after the state moved on.
  function onFullLoad() {
    setFull((prev) => (prev.status === "ready" ? { ...prev, loaded: true } : prev));
  }

  function onFullError() {
    setFull((prev) => (prev.status === "ready" ? { status: "error" } : prev));
  }

  function registerImg(imageId: string, element: HTMLImageElement | null) {
    if (element) imgRefs.current.set(imageId, element);
    else imgRefs.current.delete(imageId);
  }

  return { thumbUrls, openId, full, openImage, closeImage, onFullLoad, onFullError, refreshThumb, registerImg };
}
