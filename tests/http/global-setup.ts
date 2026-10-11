import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { assertLocalSupabase } from "../support/supabase-preflight";
import { HTTP_BASE_URL, HTTP_PORT } from "./server";

const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

function newestMtimeMs(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Colocated unit tests never reach dist/; editing one must not demand a rebuild.
    if (entry.isFile() && entry.name.endsWith(".test.ts")) continue;
    const full = join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtimeMs(full) : statSync(full).mtimeMs;
    newest = Math.max(newest, mtime);
  }
  return newest;
}

function killGroup(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // process group already gone
  }
}

async function isServing(): Promise<boolean> {
  return fetch(`${HTTP_BASE_URL}/`, { redirect: "manual" })
    .then(() => true)
    .catch(() => false);
}

/**
 * Preflight + server lifecycle for the HTTP suite. Fails loudly (no skip paths) and owns a
 * production preview on port 4323 for the duration of the run.
 */
export default async function globalSetup(): Promise<() => void> {
  await assertLocalSupabase("http");

  const root = process.cwd();
  const dist = join(root, "dist");
  if (!existsSync(dist)) {
    throw new Error("http tests: dist/ not found — run `npm run build` first.");
  }
  if (newestMtimeMs(join(root, "src")) > statSync(dist).mtimeMs) {
    throw new Error("http tests: dist/ is older than src/ — run `npm run build`.");
  }

  if (await isServing()) {
    throw new Error(`http tests: port ${String(HTTP_PORT)} is already serving — stop the stale server and retry.`);
  }

  let output = "";
  const state = { exited: false };
  const child = spawn("npm", ["run", "preview", "--", "--port", String(HTTP_PORT), "--ignore-lock"], {
    cwd: root,
    detached: true,
    env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.on("exit", () => {
    state.exited = true;
  });

  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    for (;;) {
      if (state.exited) {
        throw new Error(`http tests: preview server exited before becoming ready.\n${output}`);
      }
      const ready = await fetch(`${HTTP_BASE_URL}/`, { redirect: "manual" })
        .then((res) => res.status === 200)
        .catch(() => false);
      if (ready) break;
      if (Date.now() > deadline) {
        throw new Error(`http tests: preview server not ready within ${String(STARTUP_TIMEOUT_MS)} ms.\n${output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } catch (error) {
    killGroup(child);
    throw error;
  }

  return () => {
    killGroup(child);
  };
}
