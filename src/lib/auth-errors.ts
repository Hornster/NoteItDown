import { MESSAGES } from "@/lib/constants/messages";

/** Maps a Supabase `AuthError.code` to a dictionary message, so raw Supabase text never reaches the UI. */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return MESSAGES.AUTH_INVALID_CREDENTIALS;
    case "weak_password":
      return MESSAGES.AUTH_WEAK_PASSWORD;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return MESSAGES.AUTH_RATE_LIMITED;
    case "email_address_invalid":
      return MESSAGES.EMAIL_INVALID;
    case "email_not_confirmed":
      return MESSAGES.AUTH_EMAIL_NOT_CONFIRMED;
    default:
      return MESSAGES.AUTH_FAILED;
  }
}

/** True for the duplicate-account codes; signup treats them like a success so accounts can't be enumerated. */
export function isExistingAccountError(code: string | undefined): boolean {
  return code === "user_already_exists" || code === "email_exists";
}
