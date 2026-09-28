import React, { useState } from "react";
import { FileText, Tag, AlignLeft, Plus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateNote } from "@/components/hooks/useCreateNote";
import { NOTE_CONTENT_MAX_LENGTH, NOTE_NAME_MAX_LENGTH, NOTE_TYPE_NAME_MAX_LENGTH } from "@/lib/schemas/notes";
import type { NoteType } from "@/types";

/** Sentinel select value that reveals the custom-type text input. */
const NEW_TYPE_VALUE = "__new__";

interface Props {
  campaignId: string;
  noteTypes: NoteType[];
}

interface FieldErrors {
  name?: string;
  type?: string;
  content?: string;
}

export default function CreateNoteForm({ campaignId, noteTypes }: Props) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [typeChoice, setTypeChoice] = useState<string>(noteTypes[0]?.id ?? NEW_TYPE_VALUE);
  const [newTypeName, setNewTypeName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const { submit, pending, error: serverError } = useCreateNote(campaignId);

  const predefinedTypes = noteTypes.filter((t) => t.is_predefined);
  const customTypes = noteTypes.filter((t) => !t.is_predefined);
  const isNewType = typeChoice === NEW_TYPE_VALUE;

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      next.name = "Name is required.";
    } else if (trimmedName.length > NOTE_NAME_MAX_LENGTH) {
      next.name = `Name must be at most ${NOTE_NAME_MAX_LENGTH} characters.`;
    }

    if (content.length > NOTE_CONTENT_MAX_LENGTH) {
      next.content = `Content must be at most ${NOTE_CONTENT_MAX_LENGTH} characters.`;
    }

    if (isNewType) {
      const trimmedTypeName = newTypeName.trim();
      if (!trimmedTypeName) {
        next.type = "Type name is required.";
      } else if (trimmedTypeName.length > NOTE_TYPE_NAME_MAX_LENGTH) {
        next.type = `Type name must be at most ${NOTE_TYPE_NAME_MAX_LENGTH} characters.`;
      }
    } else if (!typeChoice) {
      next.type = "Choose a type.";
    }

    return next;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    void submit({
      name,
      content,
      type: isNewType ? { kind: "new", name: newTypeName.trim() } : { kind: "existing", id: typeChoice },
    });
  }

  const nameError = errors.name ?? (serverError?.field === "name" ? serverError.error : undefined);
  const typeError = errors.type ?? (serverError?.field === "type" ? serverError.error : undefined);
  const contentError = errors.content ?? (serverError?.field === "content" ? serverError.error : undefined);
  const generalError = serverError && !serverError.field ? serverError.error : null;

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError("name");
        }}
        placeholder="Bob the Blacksmith"
        error={nameError}
        icon={<FileText className="size-4" />}
      />

      <div>
        <Label htmlFor="type">Type</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <Tag className="size-4" />
          </span>
          <select
            id="type"
            value={typeChoice}
            onChange={(e) => {
              setTypeChoice(e.target.value);
              clearError("type");
            }}
            className="w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
          >
            {predefinedTypes.length > 0 && (
              <optgroup label="Predefined">
                {predefinedTypes.map((t) => (
                  <option key={t.id} value={t.id} className="bg-slate-800 text-white">
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {customTypes.length > 0 && (
              <optgroup label="Custom">
                {customTypes.map((t) => (
                  <option key={t.id} value={t.id} className="bg-slate-800 text-white">
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={NEW_TYPE_VALUE} className="bg-slate-800 text-white">
              New type…
            </option>
          </select>
        </div>
        {!isNewType && typeError && <p className="mt-1 text-xs text-red-300">{typeError}</p>}
      </div>

      {isNewType && (
        <FormField
          id="newTypeName"
          label="New type name"
          value={newTypeName}
          onChange={(v) => {
            setNewTypeName(v);
            clearError("type");
          }}
          placeholder="Faction"
          error={typeError}
          icon={<Tag className="size-4" />}
        />
      )}

      <div>
        <Label htmlFor="content">Content</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-3 left-3 size-4 text-white/40">
            <AlignLeft className="size-4" />
          </span>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              clearError("content");
            }}
            placeholder="Notes about this NPC, place, quest…"
            className="pl-10"
            rows={8}
          />
        </div>
        {contentError && <p className="mt-1 text-xs text-red-300">{contentError}</p>}
      </div>

      <ServerError message={generalError} />

      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Creating…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Plus className="size-4" />
            Create note
          </span>
        )}
      </Button>
    </form>
  );
}
