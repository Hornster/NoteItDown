import type { RelationChange } from "@/types";

export const RELATION_NOTICE_KEY = "noteitdown:relation-notice";

export type RelationNotice =
  | {
      kind: "edit";
      noteId: string;
      noteName: string;
      rechecked: boolean;
      added: RelationChange[];
      removed: RelationChange[];
    }
  | { kind: "delete"; campaignId: string; noteName: string; removed: RelationChange[] };

export type RelationNoticeTarget = { kind: "edit"; noteId: string } | { kind: "delete"; campaignId: string };

type NoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRelationChangeList(value: unknown): value is RelationChange[] {
  return (
    Array.isArray(value) &&
    value.every((c) => isRecord(c) && typeof c.note_id === "string" && typeof c.name === "string")
  );
}

function isRelationNotice(value: unknown): value is RelationNotice {
  if (!isRecord(value) || typeof value.noteName !== "string" || !isRelationChangeList(value.removed)) {
    return false;
  }
  if (value.kind === "edit") {
    return (
      typeof value.noteId === "string" && typeof value.rechecked === "boolean" && isRelationChangeList(value.added)
    );
  }
  return value.kind === "delete" && typeof value.campaignId === "string";
}

function matchesTarget(notice: RelationNotice, target: RelationNoticeTarget): boolean {
  if (notice.kind === "edit") {
    return target.kind === "edit" && target.noteId === notice.noteId;
  }
  return target.kind === "delete" && target.campaignId === notice.campaignId;
}

/** Stores a one-shot notice for the next page load. Never throws (storage may be blocked). */
export function writeRelationNotice(storage: NoticeStorage, notice: RelationNotice): void {
  try {
    storage.setItem(RELATION_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    // Storage unavailable (private mode, blocked): the save itself must still succeed.
  }
}

/**
 * Reads and always clears the stored notice. Returns it only when it parses, has the
 * expected shape and matches `target`, so a notice left by an abandoned navigation can't
 * surface later on an unrelated page. Never throws.
 */
export function takeRelationNotice(storage: NoticeStorage, target: RelationNoticeTarget): RelationNotice | null {
  let raw: string | null;
  try {
    raw = storage.getItem(RELATION_NOTICE_KEY);
    storage.removeItem(RELATION_NOTICE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isRelationNotice(parsed) && matchesTarget(parsed, target) ? parsed : null;
  } catch {
    return null;
  }
}
