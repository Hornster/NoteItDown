import { describe, expect, it } from "vitest";

import { isProtectedPath } from "./protected-routes";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("isProtectedPath", () => {
  it.each(["/map", "/map/", `/campaigns/${UUID}/notes/${UUID}`, "/notes/new", "/dashboard"])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(["/mapping", "/notesX", "/campaigns-x", "/", "/auth/signin", "/licenses"])("does not protect %s", (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});
