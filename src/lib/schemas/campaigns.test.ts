import { describe, expect, it } from "vitest";

import { campaignNameSchema } from "./campaigns";

describe("campaignNameSchema", () => {
  it("trims the name", () => {
    const result = campaignNameSchema.safeParse({ name: "  My Campaign  " });
    expect(result.success).toBe(true);
    expect(result.success && result.data.name).toBe("My Campaign");
  });

  it("rejects an empty name", () => {
    const result = campaignNameSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Name is required.");
  });

  it("rejects a whitespace-only name", () => {
    const result = campaignNameSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts a name of exactly 80 chars", () => {
    const result = campaignNameSchema.safeParse({ name: "a".repeat(80) });
    expect(result.success).toBe(true);
  });

  it("rejects a name over 80 chars", () => {
    const result = campaignNameSchema.safeParse({ name: "a".repeat(81) });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Name must be at most 80 characters.");
  });

  it("rejects an unknown top-level key (strict)", () => {
    const result = campaignNameSchema.safeParse({
      name: "My Campaign",
      owner_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});
