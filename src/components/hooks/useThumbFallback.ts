import { useEffect, useRef, useState } from "react";

interface UseThumbFallbackResult {
  isFailed: (imageId: string) => boolean;
  onThumbError: (imageId: string) => void;
  registerThumb: (imageId: string, element: HTMLImageElement | null) => void;
}

/**
 * Tracks thumbnails whose bytes failed to load so the caller can render the "Image unavailable"
 * placeholder instead of a broken image. No refresh: a failure is final for the lifetime of the island.
 */
export function useThumbFallback(): UseThumbFallbackResult {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const imgRefs = useRef(new Map<string, HTMLImageElement>());

  function onThumbError(imageId: string) {
    setFailed((prev) => (prev.has(imageId) ? prev : new Set(prev).add(imageId)));
  }

  // React doesn't replay an `error` event that fired before hydration.
  useEffect(() => {
    for (const [imageId, element] of imgRefs.current) {
      if (element.complete && element.naturalWidth === 0) {
        onThumbError(imageId);
      }
    }
  }, []);

  function registerThumb(imageId: string, element: HTMLImageElement | null) {
    if (element) imgRefs.current.set(imageId, element);
    else imgRefs.current.delete(imageId);
  }

  return { isFailed: (imageId) => failed.has(imageId), onThumbError, registerThumb };
}
