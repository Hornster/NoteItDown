import { beforeAll, describe, expect, it } from "vitest";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import { createTestUser } from "../support/test-user";
import { expectApiUnauthorized, expectSigninRedirect } from "./support/assertions";
import { send, type Jar } from "./support/client";
import { protectedApi, protectedPages } from "./support/route-inventory";
import { signInJar } from "./support/session";

const pages = protectedPages();
const api = protectedApi();

let campaignId = "";
let liveJar: Jar;
let preSignout: Jar;

// Declaration order matters: vitest runs the tests of a file sequentially, so the positive controls
// and the signout test below always run before the replay rows.
beforeAll(async () => {
  const user = await createTestUser();
  campaignId = user.campaignId;
  liveJar = await signInJar(user);

  preSignout = liveJar.clone();
});

function replayJar(): Jar {
  const jar = preSignout.clone();
  expect(jar.header()).toContain("sb-");
  return jar;
}

describe("signed-in positive controls (before signout)", () => {
  it("GET /campaigns/<campaignId> is served to the signed-in user", async () => {
    const res = await send(`/campaigns/${campaignId}`, { jar: replayJar() });
    expect(res.status).toBe(HTTP_STATUS.OK);
  });

  it("PATCH /api/campaigns/not-a-uuid passes the guard (not 401)", async () => {
    const res = await send("/api/campaigns/not-a-uuid", {
      method: "PATCH",
      jar: replayJar(),
      json: { name: "x" },
    });
    expect(res.status).not.toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

describe("signout", () => {
  it("POST /api/auth/signout redirects to /", async () => {
    const res = await send("/api/auth/signout", { method: "POST", jar: liveJar });
    expect(res.status).toBe(302);
    expect(res.location).toBe("/");
  });
});

describe("replaying the pre-signout session against protected pages", () => {
  it("GET /campaigns/<campaignId> redirects to sign-in", async () => {
    const res = await send(`/campaigns/${campaignId}`, { jar: replayJar() });
    expectSigninRedirect(res);
  });

  it.each(pages.map((r) => [`${r.method} ${r.path}`, r] as const))("%s redirects to sign-in", async (_name, route) => {
    const res = await send(route.path, { method: route.method, jar: replayJar() });
    expectSigninRedirect(res);
  });
});

describe("replaying the pre-signout session against protected API methods", () => {
  it.each(api.map((r) => [`${r.method} ${r.path}`, r] as const))(
    "%s is rejected with 401 JSON",
    async (_name, route) => {
      const jar = replayJar();
      const res = await send(
        route.path,
        route.method === "GET" ? { method: "GET", jar } : { method: route.method, jar, json: {} },
      );
      expectApiUnauthorized(res);
    },
  );
});
