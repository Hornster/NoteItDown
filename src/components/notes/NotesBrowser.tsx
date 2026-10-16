import { useId, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useGroupExpansion } from "@/components/hooks/useGroupExpansion";
import { useNoteSearch } from "@/components/hooks/useNoteSearch";
import { MESSAGES } from "@/lib/constants/messages";
import { filterNoteGroups, groupNotesByType } from "@/lib/note-search";
import { cn } from "@/lib/utils";
import type { NoteListItem } from "@/types";

interface NotesBrowserProps {
  campaignId: string;
  notes: NoteListItem[];
  initialQuery: string;
}

export default function NotesBrowser({ campaignId, notes, initialQuery }: NotesBrowserProps) {
  const idPrefix = useId();
  const { input, appliedQuery, onInputChange, onKeyDown, onBlur } = useNoteSearch(initialQuery);

  const allGroups = useMemo(() => groupNotesByType(notes), [notes]);
  const groups = useMemo(() => filterNoteGroups(allGroups, appliedQuery), [allGroups, appliedQuery]);
  const matchingTypeNames = useMemo(() => groups.map((group) => group.typeName), [groups]);

  const { isExpanded, toggle } = useGroupExpansion(campaignId, appliedQuery, matchingTypeNames);

  const noMatch = appliedQuery !== "" && groups.length === 0;

  return (
    <div className="space-y-4">
      <Input
        type="search"
        value={input}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        aria-label={MESSAGES.NOTES_SEARCH_LABEL}
        placeholder={MESSAGES.NOTES_SEARCH_LABEL}
        className="rounded-lg px-3 py-2 text-sm"
      />

      <div role="status" aria-live="polite">
        {noMatch && <p className="text-muted-foreground">{MESSAGES.NO_NOTES_FOUND}</p>}
      </div>

      <ul className="space-y-2">
        {groups.map((group, index) => {
          const expanded = isExpanded(group.typeName);
          const panelId = `${idPrefix}-group-${String(index)}`;
          return (
            <li key={group.typeName}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => {
                  toggle(group.typeName);
                }}
                className="border-input bg-background hover:bg-accent flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors"
              >
                <span className="text-foreground truncate font-medium">{group.typeName}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={badgeVariants({ variant: "outline" })}>{group.notes.length}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn("text-muted-foreground size-4 transition-transform", expanded && "rotate-180")}
                  />
                </span>
              </button>
              <ul id={panelId} hidden={!expanded} className="mt-2 space-y-2 pl-4">
                {group.notes.map((note) => (
                  <li key={note.id}>
                    <a
                      href={`/campaigns/${campaignId}/notes/${note.id}`}
                      className="border-input bg-background hover:bg-accent flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors"
                    >
                      <span className="text-foreground truncate font-medium">{note.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
