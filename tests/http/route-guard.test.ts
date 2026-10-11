import { describe, expect, it } from "vitest";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import { send } from "./support/client";
import {
  protectedApi,
  protectedPages,
  PUBLIC_ROUTES,
  publicRouteExists,
  unrecognizedRouteFiles,
} from "./support/route-inventory";

const pages = protectedPages();
const api = protectedApi();

describe("route inventory", () => {
  it("finds a realistic number of protected routes", () => {
    expect(pages.length).toBeGreaterThanOrEqual(12);
    expect(api.length).toBeGreaterThanOrEqual(10);
  });

  it.each([...PUBLIC_ROUTES])("public allowlist entry %s exists on disk", (path) => {
    expect(publicRouteExists(path)).toBe(true);
  });

  it("recognizes the exports of every route file", () => {
    expect(unrecognizedRouteFiles()).toEqual([]);
  });
});

describe("anonymous positive controls", () => {
  it.each(["/", "/auth/signin"])("GET %s is served", async (path) => {
    const res = await send(path);
    expect(res.status).toBe(HTTP_STATUS.OK);
  });
});

describe("anonymous access to protected pages", () => {
  it.each(pages.map((r) => [`${r.method} ${r.path}`, r] as const))("%s redirects to sign-in", async (_name, route) => {
    const res = await send(route.path, { method: route.method });
    expect(res.status).toBe(302);
    expect(res.location).toBe("/auth/signin");
  });
});

describe("anonymous access to protected API methods", () => {
  it.each(api.map((r) => [`${r.method} ${r.path}`, r] as const))(
    "%s is rejected with 401 JSON",
    async (_name, route) => {
      const res = await send(
        route.path,
        route.method === "GET" ? { method: "GET" } : { method: route.method, json: {} },
      );
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(res.contentType).toContain("application/json");
      const parsed: unknown = JSON.parse(res.body);
      expect(parsed).toEqual(expect.objectContaining({ error: expect.any(String) as unknown }));
      const error = (parsed as { error: string }).error;
      expect(error.length).toBeGreaterThan(0);
    },
  );
});
