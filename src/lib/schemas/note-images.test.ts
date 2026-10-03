import { describe, expect, it } from "vitest";

import { commitImageSchema, prepareUploadSchema, updateImageSchema } from "./note-images";

function validCommit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: "u/c/n/a.webp",
    thumb_path: "u/c/n/a-thumb.webp",
    width: 1000,
    height: 800,
    thumb_width: 512,
    thumb_height: 410,
    alt_text: null,
    ...overrides,
  };
}

describe("prepareUploadSchema", () => {
  it("accepts webp and jpeg", () => {
    expect(prepareUploadSchema.safeParse({ mime: "image/webp", with_thumbnail: true }).success).toBe(true);
    expect(prepareUploadSchema.safeParse({ mime: "image/jpeg", with_thumbnail: false }).success).toBe(true);
  });

  it("rejects png and unknown keys", () => {
    expect(prepareUploadSchema.safeParse({ mime: "image/png", with_thumbnail: true }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ mime: "image/webp", with_thumbnail: true, x: 1 }).success).toBe(false);
  });
});

describe("commitImageSchema", () => {
  it("accepts a full payload and a no-thumbnail payload", () => {
    expect(commitImageSchema.safeParse(validCommit()).success).toBe(true);
    expect(
      commitImageSchema.safeParse(validCommit({ thumb_path: null, thumb_width: null, thumb_height: null })).success,
    ).toBe(true);
  });

  it("accepts alt text of 200 chars and rejects 201", () => {
    expect(commitImageSchema.safeParse(validCommit({ alt_text: "a".repeat(200) })).success).toBe(true);
    expect(commitImageSchema.safeParse(validCommit({ alt_text: "a".repeat(201) })).success).toBe(false);
  });

  it("turns whitespace-only alt text into null and trims", () => {
    const blank = commitImageSchema.safeParse(validCommit({ alt_text: "   " }));
    expect(blank.success && blank.data.alt_text).toBeNull();
    const trimmed = commitImageSchema.safeParse(validCommit({ alt_text: "  a map  " }));
    expect(trimmed.success && trimmed.data.alt_text).toBe("a map");
  });

  it("rejects mismatched thumbnail nullability", () => {
    expect(commitImageSchema.safeParse(validCommit({ thumb_path: null })).success).toBe(false);
    expect(commitImageSchema.safeParse(validCommit({ thumb_width: null })).success).toBe(false);
  });

  it("rejects non-positive and oversized dimensions", () => {
    expect(commitImageSchema.safeParse(validCommit({ width: 0 })).success).toBe(false);
    expect(commitImageSchema.safeParse(validCommit({ height: 16_384 })).success).toBe(false);
    expect(commitImageSchema.safeParse(validCommit({ width: 16_383 })).success).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(commitImageSchema.safeParse(validCommit({ campaign_id: "x" })).success).toBe(false);
  });
});

describe("updateImageSchema", () => {
  it("accepts null and text, nulls blank text", () => {
    expect(updateImageSchema.safeParse({ alt_text: null }).success).toBe(true);
    const blank = updateImageSchema.safeParse({ alt_text: " " });
    expect(blank.success && blank.data.alt_text).toBeNull();
  });

  it("enforces the 200 char limit and rejects unknown keys", () => {
    expect(updateImageSchema.safeParse({ alt_text: "a".repeat(200) }).success).toBe(true);
    expect(updateImageSchema.safeParse({ alt_text: "a".repeat(201) }).success).toBe(false);
    expect(updateImageSchema.safeParse({ alt_text: null, path: "x" }).success).toBe(false);
  });
});
