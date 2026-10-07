import { BrowserImageError, HeicDecoderLoadError, UnsupportedImageError } from "./errors";

/** ISO-BMFF major brands that mark a HEIC/HEIF file. */
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** True when the bytes start with an ISO-BMFF `ftyp` box whose major brand is a HEIC/HEIF brand. */
export function looksLikeHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 12));
}

/** Quality of the intermediate JPEG; the normal pipeline recompresses it afterwards. */
const HEIC_JPEG_QUALITY = 0.92;

/** heic-to rejects with strings (its worker posts `e.toString()`), so failures are classified by text, not `instanceof`. */
const BROWSER_FAILURE_PATTERN = /RangeError|memory|canvas to blob/i;

/**
 * Convert a HEIC/HEIF file to a high-quality JPEG. `heic-to` (about 777 KB gzipped) is imported only here, so it
 * is downloaded only when a HEIC file is actually picked. A failed chunk download becomes `HeicDecoderLoadError`;
 * decode failures become `UnsupportedImageError`; memory failures become `BrowserImageError`.
 */
export async function convertHeicToJpeg(file: File): Promise<Blob> {
  let heicTo: (typeof import("heic-to"))["heicTo"];
  try {
    ({ heicTo } = await import("heic-to"));
  } catch {
    throw new HeicDecoderLoadError();
  }
  try {
    return await heicTo({ blob: file, type: "image/jpeg", quality: HEIC_JPEG_QUALITY });
  } catch (error) {
    if (BROWSER_FAILURE_PATTERN.test(String(error))) throw new BrowserImageError();
    throw new UnsupportedImageError();
  }
}
