/**
 * compressToWebP: re-encode an image as WebP under a byte budget.
 *
 * Re-encoding through a canvas emits pixels only, so EXIF / GPS / XMP / ICC
 * metadata is dropped. Works on the main thread or inside a Web Worker.
 *
 * Usage:
 *   const webp = await compressToWebP(input.files[0]);
 *   const file = new File([webp], name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
 *
 * Safari cannot encode WebP via canvas (it silently returns PNG). Either catch
 * WebPUnsupportedError and fall back to JPEG / server-side conversion, or pass a
 * WASM encoder, e.g. libwebp via @jsquash/webp:
 *
 *   import { encode } from '@jsquash/webp';
 *   const fallbackEncoder = async (imageData, q) =>
 *     new Blob([await encode(imageData, { quality: Math.round(q * 100) })], { type: 'image/webp' });
 *   await compressToWebP(file, { fallbackEncoder, searchSteps: 3 });
 */

const DEFAULTS = {
  maxBytes: 2.4 * 1024 * 1024, // use 2_400_000 if your backend counts decimal MB
  maxDimension: 4096,          // longest side; keeps canvases inside iOS limits
  minDimension: 640,           // give up rather than shrink below this
  maxQuality: 0.9,             // avoid 1.0: Chrome switches WebP to lossless (huge files)
  minQuality: 0.5,             // below this, downscale instead of degrading further
  searchSteps: 5,              // binary-search iterations on quality
  scaleStep: 0.85,             // downscale factor per round when minQuality is still too big
  fallbackEncoder: null,       // async (ImageData, quality 0..1) => Blob
};

export class WebPUnsupportedError extends Error {
  constructor() {
    super('This browser cannot encode WebP via canvas (e.g. Safari).');
    this.name = 'WebPUnsupportedError';
  }
}

let nativeSupport;
export async function supportsNativeWebPEncoding() {
  if (nativeSupport === undefined) {
    try {
      const canvas = createCanvas(1, 1);
      canvas.getContext('2d').fillRect(0, 0, 1, 1);
      await encodeNative(canvas, 0.8);
      nativeSupport = true;
    } catch {
      nativeSupport = false;
    }
  }
  return nativeSupport;
}

export async function compressToWebP(file, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const native = await supportsNativeWebPEncoding();
  if (!native && !opts.fallbackEncoder) throw new WebPUnsupportedError();

  // Bakes EXIF orientation into the pixels before metadata is discarded.
  // 'from-image' is the spec default; explicit for older engines.
  // Rejects for formats the browser can't decode (e.g. HEIC outside Safari).
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    let target = Math.min(longest, opts.maxDimension);

    for (;;) {
      const scale = target / longest;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);

      let imageData;
      const encodeAt = native
        ? (q) => encodeNative(canvas, q)
        : (q) => opts.fallbackEncoder((imageData ??= ctx.getImageData(0, 0, width, height)), q);

      let blob;
      try {
        blob = await bestUnderBudget(encodeAt, opts);
      } finally {
        canvas.width = canvas.height = 0; // free the backing store promptly (matters on iOS)
      }
      if (blob) return blob;

      if (target <= opts.minDimension) {
        throw new Error(`Could not compress below ${opts.maxBytes} bytes`);
      }
      target = Math.max(opts.minDimension, Math.floor(target * opts.scaleStep));
    }
  } finally {
    bitmap.close();
  }
}

// Highest quality that fits the budget, or null if even minQuality is too big.
async function bestUnderBudget(encodeAt, { maxBytes, maxQuality, minQuality, searchSteps }) {
  const top = await encodeAt(maxQuality);
  if (top.size <= maxBytes) return top;

  let best = await encodeAt(minQuality);
  if (best.size > maxBytes) return null;

  let lo = minQuality;
  let hi = maxQuality;
  for (let i = 0; i < searchSteps; i++) {
    const mid = (lo + hi) / 2;
    const blob = await encodeAt(mid);
    if (blob.size <= maxBytes) {
      best = blob;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

async function encodeNative(canvas, quality) {
  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/webp', quality })
    : await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality));
  // Unsupported types fall back to PNG silently, so verify what we got.
  if (blob.type !== 'image/webp') throw new WebPUnsupportedError();
  return blob;
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
