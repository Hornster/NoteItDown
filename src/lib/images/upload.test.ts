import { describe, expect, it } from "vitest";
import type { PendingImage } from "@/types";
import { ImageUploadError } from "./errors";
import { applyImageChanges, type ImageApi } from "./upload";

function pending(key: string, fileName: string): PendingImage {
  return { key, fileName, status: "ready", alt_text: "" };
}

function recordingApi(fail: (op: string, id: string) => Error | null = () => null) {
  const calls: string[] = [];
  const run = (op: string, id: string) => {
    calls.push(`${op}:${id}`);
    const error = fail(op, id);
    return error ? Promise.reject(error) : Promise.resolve();
  };
  const api: ImageApi = {
    deleteImage: (_n, id) => run("delete", id),
    updateAlt: (_n, id) => run("alt", id),
    uploadPending: (_n, p) => run("upload", p.fileName),
  };
  return { api, calls };
}

describe("applyImageChanges", () => {
  it("deletes, then updates alt text, then uploads", async () => {
    const { api, calls } = recordingApi();
    const failures = await applyImageChanges(
      "n1",
      { removedIds: ["a"], altEdits: { b: "x" }, added: [pending("k1", "one.png"), pending("k2", "two.png")] },
      api,
    );
    expect(failures).toEqual([]);
    expect(calls).toEqual(["delete:a", "alt:b", "upload:one.png", "upload:two.png"]);
  });

  it("keeps going after a failure and labels each one", async () => {
    const { api, calls } = recordingApi((op, id) =>
      (op === "delete" && id === "a") || (op === "upload" && id === "one.png")
        ? new ImageUploadError("boom")
        : op === "alt"
          ? new Error("unexpected")
          : null,
    );
    const failures = await applyImageChanges(
      "n1",
      {
        removedIds: ["a"],
        altEdits: { b: "x" },
        added: [pending("k1", "one.png"), pending("k2", "two.png")],
        labels: { a: "image 1", b: "image 2" },
      },
      api,
    );
    expect(calls).toEqual(["delete:a", "alt:b", "upload:one.png", "upload:two.png"]);
    expect(failures).toEqual([
      { label: "image 1", reason: "boom" },
      { label: "image 2", reason: expect.any(String) as string },
      { label: "one.png", reason: "boom" },
    ]);
  });

  it("falls back to 'image N' when a file has no name", async () => {
    const { api } = recordingApi(() => new ImageUploadError("nope"));
    const failures = await applyImageChanges("n1", { removedIds: [], altEdits: {}, added: [pending("k", "")] }, api);
    expect(failures).toEqual([{ label: "image 1", reason: "nope" }]);
  });
});
