import type { AstroCookies } from "astro";

/**
 * Remembers which campaign a signed-in user last visited, so the old top-level routes
 * (`/dashboard`, `/map`, `/notes/new`) can redirect somewhere sensible. The value is
 * never trusted as-is — it only feeds `resolveLandingCampaign`, which re-checks ownership
 * via `getCampaign` before it's used for anything.
 */
export const LAST_CAMPAIGN_COOKIE = "last_campaign_id";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function rememberCampaign(cookies: AstroCookies, id: string): void {
  cookies.set(LAST_CAMPAIGN_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: import.meta.env.PROD,
    maxAge: ONE_YEAR_SECONDS,
  });
}

export function readRememberedCampaign(cookies: AstroCookies): string | undefined {
  return cookies.get(LAST_CAMPAIGN_COOKIE)?.value;
}
