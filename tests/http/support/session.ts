import { expect } from "vitest";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import { createJar, send, type Jar } from "./client";

/** Signs in through the real route and returns the jar holding the session cookies (one auth call). */
export async function signInJar(user: { email: string; password: string }): Promise<Jar> {
  const jar = createJar();
  const signin = await send("/api/auth/signin", {
    method: "POST",
    jar,
    form: { email: user.email, password: user.password },
  });
  expect(signin.status).toBe(HTTP_STATUS.FOUND);
  expect(signin.location).toBe("/dashboard");
  expect(jar.header()).toContain("sb-");
  return jar;
}
