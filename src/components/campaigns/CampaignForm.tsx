import React, { useState } from "react";
import { BookOpen, Plus, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { useSaveCampaign } from "@/components/hooks/useSaveCampaign";
import { CAMPAIGN_NAME_MAX_LENGTH } from "@/lib/schemas/campaigns";

type Props = { mode: "create" } | { mode: "rename"; campaignId: string; initialName: string };

/**
 * Serves both create and rename: same fields, same client-side validation (mirroring
 * campaignNameSchema via CAMPAIGN_NAME_MAX_LENGTH), same server-error mapping as
 * NoteForm/useSaveNote.
 */
export default function CampaignForm(props: Props) {
  const [name, setName] = useState(props.mode === "rename" ? props.initialName : "");
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const {
    submit,
    pending,
    error: serverError,
  } = useSaveCampaign(props.mode, props.mode === "rename" ? props.campaignId : undefined);

  function clearError() {
    if (nameError) setNameError(undefined);
  }

  function validate(): string | undefined {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return "Name is required.";
    }
    if (trimmedName.length > CAMPAIGN_NAME_MAX_LENGTH) {
      return `Name must be at most ${CAMPAIGN_NAME_MAX_LENGTH} characters.`;
    }
    return undefined;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextError = validate();
    setNameError(nextError);
    if (nextError) {
      return;
    }

    void submit({ name });
  }

  const fieldError = nameError ?? (serverError?.field === "name" ? serverError.error : undefined);
  const generalError = serverError && !serverError.field ? serverError.error : null;

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError();
        }}
        placeholder="The Sunken Spire"
        error={fieldError}
        icon={<BookOpen className="size-4" />}
      />

      <ServerError message={generalError} />

      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {props.mode === "create" ? "Creating…" : "Saving…"}
          </span>
        ) : props.mode === "create" ? (
          <span className="flex items-center gap-2">
            <Plus className="size-4" />
            Create campaign
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save className="size-4" />
            Save name
          </span>
        )}
      </Button>
    </form>
  );
}
