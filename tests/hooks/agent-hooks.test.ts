import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HOOKS_DIR = path.resolve(import.meta.dirname, "../../.claude/hooks");
const MARKER = "HOOK_PROOF_BROKEN";

interface HookResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface Sandbox {
  /** Session repository: stubs on node_modules/.bin, one clean and one broken source file. */
  repo: string;
  /** A second, unrelated git repository. */
  other: string;
  /** Same layout as `repo` but with no eslint/vitest installed. */
  bare: string;
  /** TMPDIR / npm cache for the spawned scripts. */
  scratch: string;
  root: string;
}

const stubScript = (tool: string) => `#!/usr/bin/env bash
# Stub ${tool}: fails when any file argument contains the marker.
for a in "$@"; do
  if [ -f "$a" ] && grep -q "${MARKER}" "$a"; then
    echo "stub ${tool}: marker found in $a"
    exit 1
  fi
done
echo "stub ${tool}: ok"
exit 0
`;

function git(cwd: string, ...args: string[]): void {
  const res = spawnSync(
    "git",
    ["-c", "user.name=hooks-proof", "-c", "user.email=proof@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${res.stderr}`);
  }
}

function makeRepo(dir: string, withStubs: boolean): void {
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "hooks-proof", private: true }));
  writeFileSync(path.join(dir, "src/clean.ts"), "export const ok = 1;\n");
  writeFileSync(path.join(dir, "src/broken.ts"), `export const bad = 1; // ${MARKER}\n`);
  writeFileSync(path.join(dir, "src/page.astro"), `---\n// ${MARKER}\n---\n`);
  writeFileSync(path.join(dir, "README.md"), `# readme ${MARKER}\n`);
  if (withStubs) {
    const bin = path.join(dir, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    for (const tool of ["eslint", "vitest"]) {
      const file = path.join(bin, tool);
      writeFileSync(file, stubScript(tool));
      chmodSync(file, 0o755);
    }
  }
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A", "--force");
  git(dir, "commit", "-q", "-m", "baseline");
}

let sandbox: Sandbox;

beforeAll(() => {
  const root = mkdtempSync(path.join(tmpdir(), "hooks-proof-"));
  const scratch = path.join(root, "scratch");
  mkdirSync(scratch);
  sandbox = {
    root,
    scratch,
    repo: path.join(root, "repo"),
    other: path.join(root, "other"),
    bare: path.join(root, "bare"),
  };
  makeRepo(sandbox.repo, true);
  makeRepo(sandbox.other, true);
  makeRepo(sandbox.bare, false);
});

afterAll(() => {
  rmSync(sandbox.root, { recursive: true, force: true });
});

/** Environment for the spawned script: no dev-repo binaries on PATH, fresh npm cache, scratch TMPDIR. */
function scriptEnv(): NodeJS.ProcessEnv {
  const cleanPath = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry !== "" && !entry.includes(`node_modules${path.sep}.bin`))
    .join(path.delimiter);
  return {
    PATH: cleanPath,
    HOME: process.env.HOME,
    TMPDIR: sandbox.scratch,
    npm_config_cache: path.join(sandbox.scratch, "npm-cache"),
  };
}

function runHook(script: string, payload: unknown, cwd: string): HookResult {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const res = spawnSync(path.join(HOOKS_DIR, script), [], { cwd, input, encoding: "utf8", env: scriptEnv() });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

function editPayload(filePath: string, cwd: string): Record<string, unknown> {
  return {
    session_id: "proof-session",
    cwd,
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: filePath },
  };
}

interface PerEditScript {
  script: string;
  header: string;
  coversAstro: boolean;
}

const PER_EDIT: PerEditScript[] = [
  { script: "lint-edited-file.sh", header: "ESLint reported errors in", coversAstro: true },
  { script: "related-tests.sh", header: "Related unit tests failed for", coversAstro: false },
];

describe.each(PER_EDIT)("$script", ({ script, header, coversAstro }) => {
  it("fails with exit 2 and names the file on stderr for a broken file", () => {
    const file = path.join(sandbox.repo, "src/broken.ts");
    const res = runHook(script, editPayload(file, sandbox.repo), sandbox.repo);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain(`${header} ${file}:`);
    expect(res.stderr).toContain("marker found");
  });

  it("passes silently for a clean file", () => {
    const file = path.join(sandbox.repo, "src/clean.ts");
    const res = runHook(script, editPayload(file, sandbox.repo), sandbox.repo);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("skips an uncovered file type", () => {
    const file = path.join(sandbox.repo, "README.md");
    const res = runHook(script, editPayload(file, sandbox.repo), sandbox.repo);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
  });

  it(coversAstro ? "checks .astro files" : "skips .astro files", () => {
    const file = path.join(sandbox.repo, "src/page.astro");
    const res = runHook(script, editPayload(file, sandbox.repo), sandbox.repo);
    expect(res.code).toBe(coversAstro ? 2 : 0);
  });

  it("skips a nonexistent path", () => {
    const file = path.join(sandbox.repo, "src/missing.ts");
    const res = runHook(script, editPayload(file, sandbox.repo), sandbox.repo);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
  });

  it.each([
    { label: "an empty object", payload: {} },
    { label: "invalid JSON", payload: "not json" },
  ])("exits 0 for $label payload", ({ payload }) => {
    const res = runHook(script, payload, sandbox.repo);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("resolves a relative path against the payload cwd", () => {
    const res = runHook(script, editPayload("src/broken.ts", sandbox.repo), sandbox.repo);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain(path.join(sandbox.repo, "src/broken.ts"));
  });

  it("skips a file that belongs to a different git repository", () => {
    const file = path.join(sandbox.other, "src/broken.ts");
    const res = runHook(script, editPayload(file, sandbox.repo), sandbox.repo);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("fails with exit 2 when the tool is not installed", () => {
    const file = path.join(sandbox.bare, "src/clean.ts");
    const res = runHook(script, editPayload(file, sandbox.bare), sandbox.bare);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain(header);
  });
});
