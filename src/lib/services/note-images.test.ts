import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES } from "@/lib/images/limits";

import { buildImagePaths, isOwnImagePath, validateUploadedObject } from "./note-images";

describe("validateUploadedObject", () => {
  it("accepts a size equal to the limit and rejects one byte more", () => {
    expect(validateUploadedObject({ size: MAX_IMAGE_BYTES, contentType: "image/webp" })).toEqual({
      ok: true,
      size: MAX_IMAGE_BYTES,
      contentType: "image/webp",
    });
    expect(validateUploadedObject({ size: MAX_IMAGE_BYTES + 1, contentType: "image/webp" })).toEqual({ ok: false });
  });

  it("accepts jpeg and rejects png", () => {
    expect(validateUploadedObject({ size: 10, contentType: "image/jpeg" }).ok).toBe(true);
    expect(validateUploadedObject({ size: 10, contentType: "image/png" })).toEqual({ ok: false });
  });

  it("rejects a missing size or content type, and an empty object", () => {
    expect(validateUploadedObject({ contentType: "image/webp" })).toEqual({ ok: false });
    expect(validateUploadedObject({ size: 10 })).toEqual({ ok: false });
    expect(validateUploadedObject({ size: 0, contentType: "image/webp" })).toEqual({ ok: false });
  });
});

describe("image paths", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const campaign = "22222222-2222-4222-8222-222222222222";
  const note = "33333333-3333-4333-8333-333333333333";

  it("builds paths that isOwnImagePath accepts", () => {
    const { path, thumbPath } = buildImagePaths(user, campaign, note, "image/jpeg", true);
    expect(path.endsWith(".jpg")).toBe(true);
    expect(isOwnImagePath(path, user, campaign, note)).toBe(true);
    expect(thumbPath && isOwnImagePath(thumbPath, user, campaign, note)).toBe(true);
    expect(buildImagePaths(user, campaign, note, "image/webp", false).thumbPath).toBeNull();
  });

  it("rejects foreign prefixes, bad extensions and traversal", () => {
    const { path } = buildImagePaths(user, campaign, note, "image/webp", false);
    expect(isOwnImagePath(path, "other", campaign, note)).toBe(false);
    expect(isOwnImagePath(path.replace(".webp", ".png"), user, campaign, note)).toBe(false);
    expect(isOwnImagePath(`${user}/${campaign}/${note}/../x.webp`, user, campaign, note)).toBe(false);
    expect(isOwnImagePath(`${path}/extra`, user, campaign, note)).toBe(false);
  });
});
