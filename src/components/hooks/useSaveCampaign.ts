import { useCallback, useState } from "react";
import type { ApiError, SaveCampaignCommand } from "@/types";

const GENERIC_ERROR: ApiError = { error: "Something went wrong while saving the campaign. Please try again." };
const NETWORK_ERROR: ApiError = { error: "Network error. Please check your connection and try again." };

interface UseSaveCampaignResult {
  submit: (command: SaveCampaignCommand) => Promise<void>;
  pending: boolean;
  error: ApiError | null;
}

/**
 * POSTs to /api/campaigns (create) or PATCHes /api/campaigns/[campaignId] (rename),
 * depending on `mode`. On success it navigates to /campaigns/{id}. On any other response
 * it surfaces an ApiError for the form to render — under the named field when one is
 * given, otherwise as a general server error. Mirrors useCreateNote.
 */
export function useSaveCampaign(mode: "create" | "rename", campaignId?: string): UseSaveCampaignResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = useCallback(
    async (command: SaveCampaignCommand) => {
      setPending(true);
      setError(null);

      const url = mode === "create" ? "/api/campaigns" : `/api/campaigns/${campaignId ?? ""}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const successStatus = mode === "create" ? 201 : 200;

      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });

        if (response.status === successStatus) {
          const body = (await response.json()) as { id: string };
          window.location.assign(`/campaigns/${body.id}`);
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
    },
    [mode, campaignId],
  );

  return { submit, pending, error };
}
