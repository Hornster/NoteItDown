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
  "slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const UTILITIES =
  "bg|text|border-[trblxyse]|border|ring-offset|inset-ring|ring|outline|from|via|to|fill|stroke|inset-shadow|drop-shadow|text-shadow|shadow|divide-[xy]|divide|placeholder|decoration|caret|accent";
const COLOR_FN = "rgba?|hsla?|oklch|oklab|lab|lch|color-mix";

const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITIES})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d{1,3})?(?![\\w-])`,
  "g",
);
const ARBITRARY_COLOR = new RegExp(`(?<![\\w-])(?:${UTILITIES})-\\[(?:#|(?:${COLOR_FN})\\()[^\\]]*\\]`, "g");
const COLOR_LITERAL = new RegExp(
  `(?<![\\w&])(?<!href=["'])(?<!url\\()#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\\w-])|\\b(?:${COLOR_FN})\\((?!\\s*var\\()`,
  "g",
);

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
    for (const bad of [
      "hover:bg-purple-500",
      "text-white/60",
      "bg-[#0a0e1a]",
      "rgba(0,0,0,.5)",
      "#fff",
      "border-t-white/10",
      "divide-y-red-500",
      "accent-purple-500",
      "inset-shadow-black",
      "bg-mauve-500",
      "bg-[oklch(0.5_0.1_20)]",
      "color-mix(in oklab, red, blue)",
    ]) {
      expect(matchesIn(bad, false), bad).not.toHaveLength(0);
    }
    for (const ok of [
      "text-primary",
      "bg-background",
      "border-input",
      'href="#main"',
      'href="#add"',
      "url(#bad)",
      "rgb(var(--x))",
      "text-destructive-text",
      "bg-accent",
      "text-accent-foreground",
      "border-t-border",
      "label(",
    ]) {
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
