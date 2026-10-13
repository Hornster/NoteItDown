import { describe, expect, it } from "vitest";

import { createNoteSchema } from "./notes";

function validExisting(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Bob the Blacksmith",
    content: "Sells swords.",
    type: { kind: "existing", id: "550e8400-e29b-41d4-a716-446655440000" },
    ...overrides,
  };
}

describe("createNoteSchema", () => {
  it("trims the name", () => {
    const result = createNoteSchema.safeParse(validExisting({ name: "  Bob  " }));
    expect(result.success).toBe(true);
    expect(result.success && result.data.name).toBe("Bob");
  });

  it("rejects an empty name", () => {
    const result = createNoteSchema.safeParse(validExisting({ name: "" }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Name is required.");
  });

  it("rejects a whitespace-only name", () => {
    const result = createNoteSchema.safeParse(validExisting({ name: "   " }));
    expect(result.success).toBe(false);
  });

  it("rejects a name over 120 chars", () => {
    const result = createNoteSchema.safeParse(validExisting({ name: "a".repeat(121) }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Name must be at most 120 characters.");
  });

  it("accepts a name of exactly 120 chars", () => {
    const result = createNoteSchema.safeParse(validExisting({ name: "a".repeat(120) }));
    expect(result.success).toBe(true);
  });

  it("rejects content over 20000 chars", () => {
    const result = createNoteSchema.safeParse(validExisting({ content: "a".repeat(20001) }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Content must be at most 20000 characters.");
  });

  it("accepts content of exactly 20000 chars", () => {
    const result = createNoteSchema.safeParse(validExisting({ content: "a".repeat(20000) }));
    expect(result.success).toBe(true);
  });

  it("keeps leading/trailing whitespace in content", () => {
    const result = createNoteSchema.safeParse(validExisting({ content: "  padded  \n" }));
    expect(result.success).toBe(true);
    expect(result.success && result.data.content).toBe("  padded  \n");
  });

  it("defaults content to an empty string when omitted", () => {
    const { content: _content, ...rest } = validExisting();
    const result = createNoteSchema.safeParse(rest);
    expect(result.success).toBe(true);
    expect(result.success && result.data.content).toBe("");
  });

  it("rejects an empty new type name", () => {
    const result = createNoteSchema.safeParse(validExisting({ type: { kind: "new", name: "" } }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Type name is required.");
  });

  it("rejects a new type name over 60 chars", () => {
    const result = createNoteSchema.safeParse(validExisting({ type: { kind: "new", name: "a".repeat(61) } }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Type name must be at most 60 characters.");
  });

  it("accepts a new type name of exactly 60 chars", () => {
    const result = createNoteSchema.safeParse(validExisting({ type: { kind: "new", name: "a".repeat(60) } }));
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid existing.id", () => {
    const result = createNoteSchema.safeParse(validExisting({ type: { kind: "existing", id: "not-a-uuid" } }));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe("Type id must be a valid uuid.");
  });

  it("rejects an unknown top-level key (strict)", () => {
    const result = createNoteSchema.safeParse(validExisting({ campaign_id: "550e8400-e29b-41d4-a716-446655440000" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key inside type", () => {
    const result = createNoteSchema.safeParse(
      validExisting({ type: { kind: "existing", id: "550e8400-e29b-41d4-a716-446655440000", extra: "x" } }),
    );
    expect(result.success).toBe(false);
  });
});
