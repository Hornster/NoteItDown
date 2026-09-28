import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a uuid-shaped string before it reaches a query. PostgREST raises 22P02 (not
 * a clean null/404) for a malformed uuid in `.eq(...)`, so callers check this first.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
