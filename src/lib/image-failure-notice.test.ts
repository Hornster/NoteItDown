import { describe, expect, it } from "vitest";
import {
  IMAGE_FAILURE_NOTICE_KEY,
  takeImageFailureNotice,
  writeImageFailureNotice,
  type ImageFailureNotice,
} from "./image-failure-notice";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

const notice: ImageFailureNotice = { noteId: "n1", failures: [{ label: "map.png", reason: "Network error." }] };

describe("image failure notice", () => {
  it("round-trips for a matching note and clears the key", () => {
    const storage = fakeStorage();
    writeImageFailureNotice(storage, notice);
    expect(takeImageFailureNotice(storage, "n1")).toEqual(notice);
    expect(storage.data.has(IMAGE_FAILURE_NOTICE_KEY)).toBe(false);
  });

  it("returns null for another note but still clears the key", () => {
    const storage = fakeStorage();
    writeImageFailureNotice(storage, notice);
    expect(takeImageFailureNotice(storage, "other")).toBeNull();
    expect(storage.data.has(IMAGE_FAILURE_NOTICE_KEY)).toBe(false);
  });

  it("returns null for malformed JSON or a wrong shape", () => {
    expect(takeImageFailureNotice(fakeStorage({ [IMAGE_FAILURE_NOTICE_KEY]: "{nope" }), "n1")).toBeNull();
    const wrong = JSON.stringify({ noteId: "n1", failures: [{ label: 1 }] });
    expect(takeImageFailureNotice(fakeStorage({ [IMAGE_FAILURE_NOTICE_KEY]: wrong }), "n1")).toBeNull();
  });

  it("never throws when storage does", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(takeImageFailureNotice(throwing, "n1")).toBeNull();
    expect(() => {
      writeImageFailureNotice(throwing, notice);
    }).not.toThrow();
  });
});
