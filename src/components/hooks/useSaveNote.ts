import { useCallback, useState } from "react";
import { writeRelationNotice } from "@/lib/relation-notice";
import type { ApiError, CreateNoteCommand, UpdateNoteResponse } from "@/types";

const GENERIC_ERROR: ApiError = { error: "Something went wrong while saving the note. Please try again." };
const NETWORK_ERROR: ApiError = { error: "Network error. Please check your connection and try again." };

interface UseSaveNoteResult {
  submit: (command: CreateNoteCommand) => Promise<void>;
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
    async (command: CreateNoteCommand) => {
      setPending(true);
      setError(null);

      const url =
        mode === "create" ? `/api/campaigns/${campaignId}/notes` : `/api/campaigns/${campaignId}/notes/${noteId ?? ""}`;

      try {
        const response = await fetch(url, {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });

        if (mode === "create" && response.status === 201) {
          const body = (await response.json()) as { id: string };
          window.location.assign(`/campaigns/${campaignId}/notes/${body.id}`);
          return;
        }

        if (mode === "edit" && response.status === 200) {
          const body = (await response.json()) as UpdateNoteResponse;
          writeRelationNotice(window.sessionStorage, {
            kind: "edit",
            noteId: body.id,
            noteName: body.name,
            rechecked: body.rechecked,
            added: body.added,
            removed: body.removed,
          });
          window.location.replace(`/campaigns/${campaignId}/notes/${body.id}`);
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
