import { describe, expect, it } from "vitest";
import { looksLikeHeic } from "./heic";

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
