import { useCallback, useState } from "react";
import { writeRelationNotice } from "@/lib/relation-notice";
import type { ApiError, DeleteNoteResponse } from "@/types";

const GENERIC_ERROR: ApiError = { error: "Something went wrong while deleting the note. Please try again." };
const NETWORK_ERROR: ApiError = { error: "Network error. Please check your connection and try again." };
const NOT_FOUND_ERROR: ApiError = { error: "This note doesn't exist or isn't yours." };

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

      if (response.status === 200) {
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

      if (response.status === 404) {
        setError(NOT_FOUND_ERROR);
        return;
      }

      let body: ApiError = GENERIC_ERROR;
      try {
        body = (await response.json()) as ApiError;
      } catch {
        // Response body wasn't JSON; fall back to the generic message above.
      }
      setError(body);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }, [campaignId, noteId]);

  return { remove, pending, error };
}
