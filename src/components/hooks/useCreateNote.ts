import { useCallback, useState } from "react";
import type { ApiError, CreateNoteCommand } from "@/types";

const GENERIC_ERROR: ApiError = { error: "Something went wrong while creating the note. Please try again." };
const NETWORK_ERROR: ApiError = { error: "Network error. Please check your connection and try again." };

interface UseCreateNoteResult {
  submit: (command: CreateNoteCommand) => Promise<void>;
  pending: boolean;
  error: ApiError | null;
}

/**
 * Posts a CreateNoteCommand to POST /api/notes. On 201 it navigates to the new note's
 * detail page. On any other response it surfaces an ApiError for the form to render —
 * under the named field when one is given, otherwise as a general server error. It never
 * clears or resets the caller's form state.
 */
export function useCreateNote(): UseCreateNoteResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = useCallback(async (command: CreateNoteCommand) => {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });

      if (response.status === 201) {
        const body = (await response.json()) as { id: string };
        window.location.assign(`/notes/${body.id}`);
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
  }, []);

  return { submit, pending, error };
}
