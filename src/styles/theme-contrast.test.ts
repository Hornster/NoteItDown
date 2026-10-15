import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "global.css"), "utf8");

function rootTokens(): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token, minimum ratio]
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "card", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["destructive-text", "background", 4.5],
  ["destructive-text", "card", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["success-foreground", "success", 4.5],
  ["input", "background", 3],
  ["input", "card", 3],
  ["success", "background", 3],
  ["success", "card", 3],
  ["ring", "background", 3],
  ["ring", "card", 3],
  ["foreground", "reading", 4.5],
  ["input", "reading", 3],
];

describe("theme token contrast", () => {
  const tokens = rootTokens();

  it.each(PAIRS)("%s on %s is at least %d:1", (fg, bg, min) => {
    const f = tokens[fg];
    const b = tokens[bg];
    expect(f, `token --${fg} missing as 6-digit hex in :root`).toBeDefined();
    expect(b, `token --${bg} missing as 6-digit hex in :root`).toBeDefined();
    const r = ratio(f, b);
    expect(r, `${fg} on ${bg} measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });

  it("has no .dark block", () => {
    expect(css).not.toMatch(/\.dark\s*\{/);
  });
});
