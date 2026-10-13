import { useCallback, useState } from "react";
import { writeImageFailureNotice } from "@/lib/image-failure-notice";
import { applyImageChanges, createImageApi } from "@/lib/images/upload";
import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES } from "@/lib/constants/messages";
import { writeRelationNotice } from "@/lib/relation-notice";
import type { ApiError, CreateNoteCommand, ImageChanges, UpdateNoteResponse } from "@/types";

const GENERIC_ERROR: ApiError = { error: MESSAGES.NOTE_SAVE_FAILED };
const NETWORK_ERROR: ApiError = { error: MESSAGES.NETWORK_ERROR };

const NO_IMAGE_CHANGES: ImageChanges = { removedIds: [], altEdits: {}, added: [] };

/** `window.sessionStorage` itself throws when site data is blocked; the notice writers only guard setItem. */
function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

interface UseSaveNoteResult {
  submit: (command: CreateNoteCommand, imageChanges?: ImageChanges) => Promise<void>;
  pending: boolean;
  error: ApiError | null;
}

/**
 * Create mode POSTs to /api/campaigns/[campaignId]/notes and, on 201, navigates to the new
 * note. Edit mode PATCHes /api/campaigns/[campaignId]/notes/[noteId]; on 200 it stores a
 * one-shot relation-change notice (using the stored, trimmed name from the response) and
 * replaces the current history entry with the note page. On any other response it surfaces
 * an ApiError for the form to render — under the named field when one is given, otherwise
 * as a general server error. It never clears or resets the caller's form state.
 */
export function useSaveNote(mode: "create" | "edit", campaignId: string, noteId?: string): UseSaveNoteResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = useCallback(
    async (command: CreateNoteCommand, imageChanges: ImageChanges = NO_IMAGE_CHANGES) => {
      setPending(true);
      setError(null);

      const url =
        mode === "create" ? `/api/campaigns/${campaignId}/notes` : `/api/campaigns/${campaignId}/notes/${noteId ?? ""}`;

      /** Applies the held image changes; on any failure stores the notice and goes to the edit form. */
      async function finishImages(savedNoteId: string): Promise<boolean> {
        const failures = await applyImageChanges(savedNoteId, imageChanges, createImageApi(campaignId));
        if (failures.length === 0) return true;
        const storage = sessionStorageOrNull();
        if (storage) writeImageFailureNotice(storage, { noteId: savedNoteId, failures });
        window.location.replace(`/campaigns/${campaignId}/notes/${savedNoteId}/edit`);
        return false;
      }

      try {
        const response = await fetch(url, {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });

        if (mode === "create" && response.status === HTTP_STATUS.CREATED) {
          // The note exists from here on: falling through to the error branch would let a retry duplicate it.
          let createdId: string | undefined;
          try {
            createdId = ((await response.json()) as { id: string }).id;
            if (await finishImages(createdId)) {
              window.location.assign(`/campaigns/${campaignId}/notes/${createdId}`);
            }
          } catch {
            window.location.replace(
              createdId ? `/campaigns/${campaignId}/notes/${createdId}/edit` : `/campaigns/${campaignId}`,
            );
          }
          return;
        }

        if (mode === "edit" && response.status === HTTP_STATUS.OK) {
          const body = (await response.json()) as UpdateNoteResponse;
          const storage = sessionStorageOrNull();
          if (storage) {
            writeRelationNotice(storage, {
              kind: "edit",
              noteId: body.id,
              noteName: body.name,
              rechecked: body.rechecked,
              added: body.added,
              removed: body.removed,
            });
          }
          // The relation notice is written before any image step so an image failure can't drop it.
          if (await finishImages(body.id)) {
            window.location.replace(`/campaigns/${campaignId}/notes/${body.id}`);
          }
          return;
        }

        let body: ApiError = GENERIC_ERROR;
        try {
          body = (await response.json()) as ApiError;
        } catch {
          // Response body wasn't JSON; fall back to the generic message above.
        }
        setError(body);
        setPending(false);
      } catch {
        setError(NETWORK_ERROR);
        setPending(false);
      }
      // No reset on the success paths: stay pending until the navigation unloads the page,
      // so a second click can't re-submit (and overwrite the notice).
    },
    [mode, campaignId, noteId],
  );

  return { submit, pending, error };
}
