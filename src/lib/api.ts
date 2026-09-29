import type { ApiError } from "@/types";

/** JSON error response in the shared `ApiError` shape used by every API route. */
export function jsonError(body: ApiError, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Maps a zod issue path to the form field it belongs to, so the client can render the
 * error under that field. `fields` lists the body keys the route's form exposes; any other
 * path yields `undefined` (a general error).
 */
export function fieldFromPath(path: (string | number | symbol)[], fields: ReadonlySet<string>): ApiError["field"] {
  const first = path[0];
  return typeof first === "string" && fields.has(first) ? (first as ApiError["field"]) : undefined;
}
