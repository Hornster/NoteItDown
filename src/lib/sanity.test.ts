import { describe, expect, it } from "vitest";

// Trivial check so the unit project has at least one test; Phase 2 adds real unit
// coverage for src/lib/schemas/notes.ts.
describe("unit test runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
