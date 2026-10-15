import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const TOKEN_FILE = "src/styles/global.css";

/** File (repo-relative, posix) -> reason it may contain a hard-coded color. */
const ALLOWLIST: Record<string, string> = {
  "src/lib/images/compress.ts": "canvas fill before JPEG encode (not a UI color)",
};

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const UTILITIES =
  "bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|placeholder|decoration|caret|ring-offset";

const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITIES})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d{1,3})?(?![\\w-])`,
  "g",
);
const ARBITRARY_COLOR = new RegExp(`(?<![\\w-])(?:${UTILITIES})-\\[(?:#|rgba?\\(|hsla?\\()[^\\]]*\\]`, "g");
const COLOR_LITERAL = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g;

function matchesIn(line: string, allowLiterals: boolean): string[] {
  const found = [...line.matchAll(PALETTE_CLASS), ...line.matchAll(ARBITRARY_COLOR)].map((m) => m[0]);
  if (!allowLiterals) found.push(...[...line.matchAll(COLOR_LITERAL)].map((m) => m[0]));
  return found;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(astro|tsx|ts|css)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function violations(files: string[]): string[] {
  const repoRoot = resolve(SRC, "..");
  const result: string[] = [];
  for (const file of files) {
    const rel = relative(repoRoot, file).split("\\").join("/");
    if (rel in ALLOWLIST) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of matchesIn(line, rel === TOKEN_FILE)) result.push(`${rel}:${i + 1}: ${m}`);
    });
  }
  return result;
}

describe("theme guard: no hard-coded colors in src/", () => {
  it("matcher flags hard-coded colors and ignores semantic tokens", () => {
    for (const bad of ["hover:bg-purple-500", "text-white/60", "bg-[#0a0e1a]", "rgba(0,0,0,.5)", "#fff"]) {
      expect(matchesIn(bad, false), bad).not.toHaveLength(0);
    }
    for (const ok of ["text-primary", "bg-background", "border-input", 'href="#main"', "text-destructive-text"]) {
      expect(matchesIn(ok, false), ok).toHaveLength(0);
    }
  });

  it("walk finds .astro and .tsx files", () => {
    const files = walk(SRC);
    expect(files.filter((f) => f.endsWith(".astro")).length).toBeGreaterThan(0);
    expect(files.filter((f) => f.endsWith(".tsx")).length).toBeGreaterThan(0);
  });

  it("has no hard-coded colors outside global.css", () => {
    expect(violations(walk(SRC)), "use semantic tokens / ui primitives instead").toEqual([]);
  });
});
