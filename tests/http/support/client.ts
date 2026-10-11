import { HTTP_BASE_URL } from "../server";

export interface Jar {
  header(): string;
  store(res: Response): void;
  clone(): Jar;
}

function makeJar(initial: Map<string, string>): Jar {
  const cookies = new Map(initial);
  return {
    header: () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
    store(res) {
      for (const raw of res.headers.getSetCookie()) {
        const [pair = "", ...attrs] = raw.split(";");
        const [name = "", ...rest] = pair.split("=");
        const expired = attrs.some((attr) => /max-age=0/i.test(attr.trim()));
        if (expired) cookies.delete(name.trim());
        else cookies.set(name.trim(), rest.join("="));
      }
    },
    clone: () => makeJar(cookies),
  };
}

export function createJar(): Jar {
  return makeJar(new Map());
}

export interface SendOptions {
  method?: string;
  jar?: Jar;
  form?: Record<string, string>;
  json?: unknown;
}

export interface SendResult {
  status: number;
  /** Location header normalized to path + search; empty string when absent. */
  location: string;
  contentType: string;
  body: string;
}

function normalizeLocation(location: string | null): string {
  if (!location) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(location)) return location;
  const url = new URL(location);
  return url.pathname + url.search;
}

/**
 * Sends a request to the preview server. `path` is appended to the base URL as written —
 * never parsed or normalized — so odd path variants reach the server untouched.
 */
export async function send(path: string, options: SendOptions = {}): Promise<SendResult> {
  const { method = "GET", jar, form, json } = options;
  const headers: Record<string, string> = { Origin: HTTP_BASE_URL };
  const cookie = jar?.header();
  if (cookie) headers.Cookie = cookie;

  let body: string | undefined;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const response = await fetch(HTTP_BASE_URL + path, { method, redirect: "manual", headers, body });
  jar?.store(response);

  return {
    status: response.status,
    location: normalizeLocation(response.headers.get("location")),
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}
