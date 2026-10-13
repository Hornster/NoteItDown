import { describe, expect, it } from "vitest";

import { authFormSchema } from "./auth";

const VALID = { email: "user@example.com", password: "secret1" };

describe("authFormSchema", () => {
  it("accepts a valid pair", () => {
    expect(authFormSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts an extra confirmPassword", () => {
    expect(authFormSchema.safeParse({ ...VALID, confirmPassword: "secret1" }).success).toBe(true);
  });

  it("rejects a missing email", () => {
    const result = authFormSchema.safeParse({ password: "secret1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Email is required");
  });

  it("rejects a missing password", () => {
    const result = authFormSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Password is required");
  });

  it("rejects a whitespace-only email", () => {
    const result = authFormSchema.safeParse({ ...VALID, email: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Email is required");
  });

  it("rejects a non-string email", () => {
    const result = authFormSchema.safeParse({ ...VALID, email: 42 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Email is required");
  });

  it("rejects a malformed email", () => {
    const result = authFormSchema.safeParse({ ...VALID, email: "foo" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address");
  });
});
