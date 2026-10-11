import { expect } from "vitest";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import type { SendResult } from "./client";

/** A denied page request: the middleware redirects to sign-in. */
export function expectSigninRedirect(res: SendResult): void {
  expect(res.status).toBe(302);
  expect(res.location).toBe("/auth/signin");
}

/** A denied API request: the handler's own guard answers 401 JSON `{ error }` (shape only, never wording). */
export function expectApiUnauthorized(res: SendResult): void {
  expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(res.contentType).toContain("application/json");
  const parsed: unknown = JSON.parse(res.body);
  expect(parsed).toEqual(expect.objectContaining({ error: expect.any(String) as unknown }));
  const error = (parsed as { error: string }).error;
  expect(error.length).toBeGreaterThan(0);
}
