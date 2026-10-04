/**
 * Browser image pipeline: decode once, re-encode to WebP (JPEG where the browser cannot encode WebP)
 * under CLIENT_IMAGE_CEILING_BYTES, plus a thumbnail. Canvas re-encoding drops EXIF/GPS metadata.
 *
 * The maths (`fitDimensions`, `thumbnailDimensions`, `bestUnderBudget`) is pure and unit-tested in Node.
 * `processImage` is browser-only and must be loaded with `await import()` behind `import.meta.env.SSR`.
 */
import { CLIENT_IMAGE_CEILING_BYTES, MAX_CANVAS_AREA, MAX_IMAGE_SIDE, THUMBNAIL_MAX_SIDE } from "@/lib/images/limits";
import { BrowserImageError, ImageTooLargeError, UnsupportedImageError } from "@/lib/images/errors";
import type { EncodedImage, ProcessedImage } from "@/types";

const START_QUALITY = 0.8;
const MIN_QUALITY = 0.5;
const SEARCH_STEPS = 4;
/** Give up rather than shrink the longest side below this. */
const MIN_DIMENSION = 640;
const SCALE_STEP = 0.85;

export interface Dimensions {
  width: number;
  height: number;
}

/** Largest size with the same aspect ratio within the canvas area and side caps. Each side is at least 1 px. */
export function fitDimensions(w: number, h: number): Dimensions {
  const scale = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (w * h)), MAX_IMAGE_SIDE / Math.max(w, h));
  let width = Math.min(MAX_IMAGE_SIDE, Math.max(1, Math.round(w * scale)));
  let height = Math.min(MAX_IMAGE_SIDE, Math.max(1, Math.round(h * scale)));
  // Rounding up can push the area a few pixels over the cap.
  while (width * height > MAX_CANVAS_AREA) {
    if (width >= height) width -= 1;
    else height -= 1;
  }
  return { width, height };
}

/** Thumbnail size, or null when the longest side is already within the thumbnail limit. */
export function thumbnailDimensions(w: number, h: number): Dimensions | null {
  const longest = Math.max(w, h);
  if (longest <= THUMBNAIL_MAX_SIDE) return null;
  const scale = THUMBNAIL_MAX_SIDE / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export interface BudgetOptions {
  maxBytes: number;
  startQuality: number;
  minQuality: number;
  searchSteps: number;
}

export const DEFAULT_BUDGET: BudgetOptions = {
  maxBytes: CLIENT_IMAGE_CEILING_BYTES,
  startQuality: START_QUALITY,
  minQuality: MIN_QUALITY,
  searchSteps: SEARCH_STEPS,
};

/**
 * Highest-quality encoding that fits `maxBytes`, or null when even `minQuality` is too big.
 * The first try is at `startQuality`; a result over budget is never returned.
 */
export async function bestUnderBudget<T extends { size: number }>(
  encodeAt: (quality: number) => Promise<T>,
  opts: BudgetOptions = DEFAULT_BUDGET,
): Promise<T | null> {
  const first = await encodeAt(opts.startQuality);
  if (first.size <= opts.maxBytes) return first;

  let best = await encodeAt(opts.minQuality);
  if (best.size > opts.maxBytes) return null;

  let lo = opts.minQuality;
  let hi = opts.startQuality;
  for (let i = 0; i < opts.searchSteps; i++) {
    const mid = (lo + hi) / 2;
    const candidate = await encodeAt(mid);
    if (candidate.size <= opts.maxBytes) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

type OutputType = EncodedImage["type"];

let webpSupport: Promise<boolean> | undefined;

/** Probed once: Safari silently returns PNG for a WebP request. */
function supportsWebpEncoding(): Promise<boolean> {
  webpSupport ??= (async () => {
    try {
      const canvas = new OffscreenCanvas(1, 1);
      canvas.getContext("2d")?.fillRect(0, 0, 1, 1);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality: START_QUALITY });
      return blob.type === "image/webp";
    } catch {
      return false;
    }
  })();
  return webpSupport;
}

/** Samples a few pixels; true when every sampled pixel is fully transparent (iOS blank canvas). */
function looksBlank(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): boolean {
  const xs = [0, Math.floor(width / 2), width - 1];
  const ys = [0, Math.floor(height / 2), height - 1];
  for (const x of xs) {
    for (const y of ys) {
      if (ctx.getImageData(x, y, 1, 1).data[3] !== 0) return false;
    }
  }
  return true;
}

async function renderAndEncode(
  bitmap: ImageBitmap,
  { width, height }: Dimensions,
  type: OutputType,
  onlyIfUnder: boolean,
): Promise<EncodedImage | null> {
  const canvas = new OffscreenCanvas(width, height);
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new BrowserImageError();
    if (type === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (type === "image/webp" && looksBlank(ctx, width, height)) throw new BrowserImageError();

    const encoded = await bestUnderBudget(async (quality) => {
      let blob: Blob;
      try {
        blob = await canvas.convertToBlob({ type, quality });
      } catch {
        throw new BrowserImageError();
      }
      if (blob.type !== type) throw new BrowserImageError();
      return blob;
    });
    if (!encoded) {
      if (onlyIfUnder) return null;
      throw new ImageTooLargeError();
    }
    return { blob: encoded, width, height, type };
  } finally {
    canvas.width = canvas.height = 0; // free the backing store promptly (matters on iOS)
  }
}

/** Decodes `source` once and produces the stored original plus an optional thumbnail. Browser-only. */
export async function processImage(source: Blob): Promise<ProcessedImage> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    throw new BrowserImageError();
  }

  let bitmap: ImageBitmap;
  try {
    // Bakes EXIF orientation into the pixels before metadata is discarded.
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch (error) {
    // A TypeError means the options bag itself is unsupported; anything else is a decode failure.
    throw error instanceof TypeError ? new BrowserImageError() : new UnsupportedImageError();
  }

  try {
    const type: OutputType = (await supportsWebpEncoding()) ? "image/webp" : "image/jpeg";
    const fitted = fitDimensions(bitmap.width, bitmap.height);

    let image: EncodedImage | null = null;
    let target = fitted;
    for (;;) {
      image = await renderAndEncode(bitmap, target, type, true);
      if (image) break;
      if (Math.max(target.width, target.height) <= MIN_DIMENSION) throw new ImageTooLargeError();
      const longest = Math.max(fitted.width, fitted.height);
      const nextLongest = Math.max(MIN_DIMENSION, Math.floor(Math.max(target.width, target.height) * SCALE_STEP));
      const scale = nextLongest / longest;
      target = {
        width: Math.max(1, Math.round(fitted.width * scale)),
        height: Math.max(1, Math.round(fitted.height * scale)),
      };
    }

    const thumbSize = thumbnailDimensions(image.width, image.height);
    const thumbnail = thumbSize ? await renderAndEncode(bitmap, thumbSize, type, false) : null;
    return { image, thumbnail };
  } finally {
    bitmap.close();
  }
}
