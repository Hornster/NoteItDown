import { describe, expect, it } from "vitest";

import { MESSAGES } from "@/lib/constants/messages";

import { authErrorMessage, isExistingAccountError } from "./auth-errors";

describe("authErrorMessage", () => {
  it.each([
    ["invalid_credentials", MESSAGES.AUTH_INVALID_CREDENTIALS],
    ["weak_password", MESSAGES.AUTH_WEAK_PASSWORD],
    ["over_request_rate_limit", MESSAGES.AUTH_RATE_LIMITED],
    ["over_email_send_rate_limit", MESSAGES.AUTH_RATE_LIMITED],
    ["email_address_invalid", MESSAGES.EMAIL_INVALID],
    ["email_not_confirmed", MESSAGES.AUTH_EMAIL_NOT_CONFIRMED],
  ])("maps %s", (code, expected) => {
    expect(authErrorMessage(code)).toBe(expected);
  });

  it("falls back for unknown codes", () => {
    expect(authErrorMessage("validation_failed")).toBe(MESSAGES.AUTH_FAILED);
  });

  it("falls back for undefined", () => {
    expect(authErrorMessage(undefined)).toBe(MESSAGES.AUTH_FAILED);
  });
});

describe("isExistingAccountError", () => {
  it.each(["user_already_exists", "email_exists"])("is true for %s", (code) => {
    expect(isExistingAccountError(code)).toBe(true);
  });

  it.each(["invalid_credentials", "weak_password", ""])("is false for %s", (code) => {
    expect(isExistingAccountError(code)).toBe(false);
  });

  it("is false for undefined", () => {
    expect(isExistingAccountError(undefined)).toBe(false);
  });
});
