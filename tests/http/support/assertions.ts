import { expect } from "vitest";

import { HTTP_STATUS } from "@/lib/constants/http-status";

import type { SendResult } from "./client";

/** A denied page request: the middleware redirects to sign-in. */
export function expectSigninRedirect(res: SendResult): void {
  expect(res.status).toBe(HTTP_STATUS.FOUND);
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

/** A denied-by-ownership API request: 404 JSON `{ error }` (shape only, never wording). */
export function expectApiNotFound(res: SendResult): void {
  expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
  expect(res.contentType).toContain("application/json");
  const parsed: unknown = JSON.parse(res.body);
  expect(parsed).toEqual(expect.objectContaining({ error: expect.any(String) as unknown }));
}

/** The response body must not contain any of the given identifying strings. */
export function expectBodyLacks(res: SendResult, secrets: readonly string[]): void {
  for (const secret of secrets) {
    expect(res.body).not.toContain(secret);
  }
}
