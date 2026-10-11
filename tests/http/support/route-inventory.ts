import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PAGES_DIR = join(process.cwd(), "src", "pages");
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const EXPORT_PATTERN = /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|ALL)\b/g;

/** Routes reachable without a session. Everything else under src/pages must be guarded. */
export const PUBLIC_ROUTES = [
  "/",
  "/licenses",
  "/auth/signin",
  "/auth/signup",
  "/auth/confirm-email",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
] as const;

export interface PageRoute {
  kind: "page";
  method: string;
  path: string;
  file: string;
}

export interface ApiRoute {
  kind: "api";
  method: string;
  path: string;
  file: string;
}

export type Route = PageRoute | ApiRoute;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function toRoutePath(file: string): string {
  const rel = relative(PAGES_DIR, file)
    .split(sep)
    .map((segment) => segment.replace(/\.(astro|ts)$/, ""));
  if (rel[rel.length - 1] === "index") rel.pop();
  const mapped = rel.map((segment) => (/^\[(?:\.\.\.)?[^\]]+\]$/.test(segment) ? PLACEHOLDER_ID : segment));
  return "/" + mapped.join("/");
}

function detectMethods(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const methods = new Set<string>();
  for (const match of source.matchAll(EXPORT_PATTERN)) {
    const method = match[1];
    if (method) methods.add(method);
  }
  return [...methods];
}

function isApiFile(file: string): boolean {
  return relative(PAGES_DIR, file).split(sep)[0] === "api";
}

function enumerate(): { routes: Route[]; unrecognized: string[] } {
  const routes: Route[] = [];
  const unrecognized: string[] = [];

  for (const file of walk(PAGES_DIR)) {
    const path = toRoutePath(file);
    const relFile = relative(process.cwd(), file);

    if (file.endsWith(".astro")) {
      routes.push({ kind: "page", method: "GET", path, file: relFile });
    } else if (file.endsWith(".ts")) {
      const methods = detectMethods(file);
      if (methods.length === 0) {
        unrecognized.push(relFile);
        continue;
      }
      if (isApiFile(file)) {
        for (const method of methods) {
          routes.push({ kind: "api", method: method === "ALL" ? "GET" : method, path, file: relFile });
        }
      } else {
        for (const method of methods) {
          routes.push({ kind: "page", method: method === "ALL" ? "GET" : method, path, file: relFile });
        }
      }
    } else {
      // .md/.mdx/.html/.js/... are routable by Astro but not mapped here; fail rather than drop them.
      unrecognized.push(relFile);
    }
  }

  return { routes, unrecognized };
}

const isPublic = (path: string): boolean => (PUBLIC_ROUTES as readonly string[]).includes(path);

export function protectedPages(): PageRoute[] {
  return enumerate().routes.filter((r): r is PageRoute => r.kind === "page" && !isPublic(r.path));
}

export function protectedApi(): ApiRoute[] {
  return enumerate().routes.filter((r): r is ApiRoute => r.kind === "api" && !isPublic(r.path));
}

export function publicRoutes(): Route[] {
  return enumerate().routes.filter((r) => isPublic(r.path));
}

/**
 * Files under src/pages the inventory cannot map: `.ts` files with no detectable method export,
 * and any extension other than `.astro`/`.ts`. The suite fails naming them.
 */
export function unrecognizedRouteFiles(): string[] {
  return enumerate().unrecognized;
}

/** True when a PUBLIC_ROUTES entry maps to an existing route on disk. */
export function publicRouteExists(path: string): boolean {
  return existsSync(PAGES_DIR) && enumerate().routes.some((r) => r.path === path);
}
