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

describe("anonymous path variants are never served", () => {
  const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

  // `//dashboard` is not probed: a leading `//` parses as a protocol-relative URL (host "dashboard",
  // path "/"), so it serves the public index page — 200 without reaching the guard. A deeper path keeps
  // the double-slash variant meaningful.
  it.each([`/%63ampaigns/${ZERO_UUID}`, `//campaigns/${ZERO_UUID}`, `/Campaigns/${ZERO_UUID}`, "/dashboard/"])(
    "GET %s is denied (302 to sign-in or 404, never 200)",
    async (path) => {
      const res = await send(path);
      expect(res.status).not.toBe(HTTP_STATUS.OK);
      if (res.status === HTTP_STATUS.NOT_FOUND) return;
      expect(res.status).toBe(302);
      expect(res.location).toBe("/auth/signin");
    },
  );
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
