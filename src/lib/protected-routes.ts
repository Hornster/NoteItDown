// Exact path or path + "/" only: a new protected top-level route (e.g. /notes-export) must be listed here, or it is public.
export const PROTECTED_ROUTES = ["/dashboard", "/notes", "/map", "/campaigns"];

/** True when the pathname is a protected route or sits beneath one (`/map`, `/map/x`, not `/mapping`). */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
