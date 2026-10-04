import { describe, expect, it } from "vitest";
import { MAX_CANVAS_AREA, MAX_IMAGE_SIDE } from "@/lib/images/limits";
import { bestUnderBudget, fitDimensions, thumbnailDimensions, type BudgetOptions } from "./compress";

describe("fitDimensions", () => {
  it("keeps a tall map near 1672x10033", () => {
    const { width, height } = fitDimensions(2000, 12000);
    expect(width).toBe(1672);
    expect(height).toBe(10033);
    expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });

  it("clamps the side cap and keeps at least 1 px", () => {
    expect(fitDimensions(16384, 1)).toEqual({ width: MAX_IMAGE_SIDE, height: 1 });
  });

  it("halves each side of an 8000x8000 image to fit the area cap", () => {
    expect(fitDimensions(8000, 8000)).toEqual({ width: 4096, height: 4096 });
  });

  it("leaves small images untouched", () => {
    expect(fitDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("thumbnailDimensions", () => {
  it("returns null at or below 512 px", () => {
    expect(thumbnailDimensions(512, 300)).toBeNull();
    expect(thumbnailDimensions(100, 512)).toBeNull();
  });

  it("scales the longest side to 512", () => {
    expect(thumbnailDimensions(1024, 512)).toEqual({ width: 512, height: 256 });
    expect(thumbnailDimensions(513, 513)).toEqual({ width: 512, height: 512 });
  });

  it("clamps each side to at least 1 px", () => {
    expect(thumbnailDimensions(16383, 1)).toEqual({ width: 512, height: 1 });
  });
});

describe("bestUnderBudget", () => {
  const opts: BudgetOptions = { maxBytes: 1000, startQuality: 0.8, minQuality: 0.5, searchSteps: 5 };

  function encoder(sizeAt: (q: number) => number) {
    const calls: number[] = [];
    return {
      calls,
      encodeAt: (q: number) => {
        calls.push(q);
        return Promise.resolve({ size: sizeAt(q), q });
      },
    };
  }

  it("tries 0.8 first and stops when it fits", async () => {
    const { encodeAt, calls } = encoder(() => 900);
    const result = await bestUnderBudget(encodeAt, opts);
    expect(calls).toEqual([0.8]);
    expect(result?.q).toBe(0.8);
  });

  it("searches for the best quality that fits", async () => {
    const { encodeAt, calls } = encoder((q) => q * 1500);
    const result = await bestUnderBudget(encodeAt, opts);
    expect(calls[0]).toBe(0.8);
    expect(calls[1]).toBe(0.5);
    expect(result).not.toBeNull();
    expect(result?.size).toBeLessThanOrEqual(1000);
    expect(result?.q).toBeGreaterThan(0.6);
  });

  it("returns null when even the minimum quality is over budget", async () => {
    const { encodeAt } = encoder(() => 5000);
    expect(await bestUnderBudget(encodeAt, opts)).toBeNull();
  });
});
