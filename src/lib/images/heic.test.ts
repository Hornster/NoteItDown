import { describe, expect, it, vi } from "vitest";
import { BrowserImageError, UnsupportedImageError } from "./errors";
import { convertHeicToJpeg, looksLikeHeic } from "./heic";

const heicTo = vi.hoisted(() => vi.fn());

vi.mock("heic-to", () => ({ heicTo }));

function header(brand: string, box = "ftyp"): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0, 0, 0, 24], 0);
  bytes.set(new TextEncoder().encode(box), 4);
  bytes.set(new TextEncoder().encode(brand), 8);
  return bytes;
}

describe("looksLikeHeic", () => {
  it.each(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1"])("accepts brand %s", (brand) => {
    expect(looksLikeHeic(header(brand))).toBe(true);
  });

  it("rejects other brands and a missing ftyp box", () => {
    expect(looksLikeHeic(header("isom"))).toBe(false);
    expect(looksLikeHeic(header("heic", "moov"))).toBe(false);
  });

  it("rejects a JPEG header", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    expect(looksLikeHeic(jpeg)).toBe(false);
  });

  it("rejects fewer than 12 bytes", () => {
    expect(looksLikeHeic(header("heic").subarray(0, 11))).toBe(false);
    expect(looksLikeHeic(new Uint8Array(0))).toBe(false);
  });
});

describe("convertHeicToJpeg", () => {
  const file = new File([new Uint8Array(32)], "photo.heic");

  it("returns the converted JPEG", async () => {
    const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
    heicTo.mockResolvedValueOnce(jpeg);
    await expect(convertHeicToJpeg(file)).resolves.toBe(jpeg);
  });

  // heic-to rejects with strings: its worker posts `e.toString()`, and a failed canvas encode rejects with a literal.
  it.each(["RangeError: Array buffer allocation failed", "Can't convert canvas to blob.", "Out of memory"])(
    "maps the rejection %j to BrowserImageError",
    async (reason) => {
      heicTo.mockRejectedValueOnce(reason);
      await expect(convertHeicToJpeg(file)).rejects.toBeInstanceOf(BrowserImageError);
    },
  );

  it.each(["Error: HEIF processing error", undefined])(
    "maps the rejection %j to UnsupportedImageError",
    async (reason) => {
      heicTo.mockRejectedValueOnce(reason);
      await expect(convertHeicToJpeg(file)).rejects.toBeInstanceOf(UnsupportedImageError);
    },
  );

  it("maps a failed chunk load to HeicDecoderLoadError", async () => {
    vi.resetModules();
    vi.doMock("heic-to", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const fresh = await import("./heic");
    const freshErrors = await import("./errors");
    await expect(fresh.convertHeicToJpeg(file)).rejects.toBeInstanceOf(freshErrors.HeicDecoderLoadError);
    vi.doUnmock("heic-to");
  });
});
