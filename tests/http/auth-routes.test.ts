import { describe, expect, it } from "vitest";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import { send } from "./support/client";

// Oracles are literals on purpose: they must not come from the code under test. None of these
// requests passes validation, so none reaches GoTrue.
describe.each(["signin", "signup"])("POST /api/auth/%s rejects malformed bodies before Supabase", (route) => {
  function errorOf(location: string): string {
    const [path = "", query = ""] = location.split("?");
    expect(path).toBe(`/auth/${route}`);
    return new URLSearchParams(query).get("error") ?? "";
  }

  it("redirects a JSON body with a missing-email message", async () => {
    const res = await send(`/api/auth/${route}`, {
      method: "POST",
      json: { email: "user@example.com", password: "secret1" },
    });
    expect(res.status).toBe(HTTP_STATUS.FOUND);
    expect(errorOf(res.location)).toBe("Email is required");
  });

  it("redirects a form without a password with a missing-password message", async () => {
    const res = await send(`/api/auth/${route}`, { method: "POST", form: { email: "user@example.com" } });
    expect(res.status).toBe(HTTP_STATUS.FOUND);
    expect(errorOf(res.location)).toBe("Password is required");
  });
});
