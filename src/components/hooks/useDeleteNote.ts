import { useCallback, useState } from "react";
import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MESSAGES } from "@/lib/constants/messages";
import { writeRelationNotice } from "@/lib/relation-notice";
import type { ApiError, DeleteNoteResponse } from "@/types";

const GENERIC_ERROR: ApiError = { error: MESSAGES.NOTE_DELETE_FAILED };
const NETWORK_ERROR: ApiError = { error: MESSAGES.NETWORK_ERROR };
const NOT_FOUND_ERROR: ApiError = { error: MESSAGES.NOTE_NOT_FOUND };

interface UseDeleteNoteResult {
  remove: () => Promise<void>;
  pending: boolean;
  error: ApiError | null;
}

/**
 * DELETEs /api/campaigns/[campaignId]/notes/[noteId]. On 200 it stores a one-shot relation
 * notice (which relations the delete removed) and replaces the current history entry with the
 * campaign's note list, so Back never lands on the deleted note's 404. Any other response is
 * surfaced as an ApiError (404 gets a fixed message).
 */
export function useDeleteNote(campaignId: string, noteId: string): UseDeleteNoteResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const remove = useCallback(async () => {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/notes/${noteId}`, { method: "DELETE" });

      if (response.status === HTTP_STATUS.OK) {
        const body = (await response.json()) as DeleteNoteResponse;
        writeRelationNotice(window.sessionStorage, {
          kind: "delete",
          campaignId,
          noteName: body.name,
          removed: body.removed,
        });
        window.location.replace(`/campaigns/${campaignId}`);
        return;
      }

      if (response.status === HTTP_STATUS.NOT_FOUND) {
        setError(NOT_FOUND_ERROR);
        setPending(false);
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
    // No reset on the success path: stay pending until the navigation unloads the page,
    // so a second click can't re-send the DELETE (and show a 404 for the note just deleted).
  }, [campaignId, noteId]);

  return { remove, pending, error };
}
