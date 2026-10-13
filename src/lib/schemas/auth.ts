import { z } from "zod";

import { MESSAGES } from "@/lib/constants/messages";

/** Email format shared with the sign-up form (SignUpForm) so client-side checks mirror the server. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the signin and signup form bodies. Not `.strict()`: SignUpForm also posts `confirmPassword`.
 * The type-level `error` is needed because an absent field reaches zod as `undefined` (a file as a `Blob`),
 * which fails the type check before `.min` runs. Password strength is left to Supabase.
 */
export const authFormSchema = z.object({
  email: z
    .string({ error: MESSAGES.EMAIL_REQUIRED })
    .trim()
    .min(1, MESSAGES.EMAIL_REQUIRED)
    .regex(EMAIL_PATTERN, MESSAGES.EMAIL_INVALID),
  password: z.string({ error: MESSAGES.PASSWORD_REQUIRED }).min(1, MESSAGES.PASSWORD_REQUIRED),
});

export type AuthFormInput = z.infer<typeof authFormSchema>;
