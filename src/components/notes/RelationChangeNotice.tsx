import { useEffect, useRef, useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MESSAGES, noteDeletedNotice, noteSavedNotice } from "@/lib/constants/messages";
import { takeRelationNotice, type RelationNotice, type RelationNoticeTarget } from "@/lib/relation-notice";
import type { RelationChange } from "@/types";

interface Props {
  campaignId: string;
  target: RelationNoticeTarget;
}

function RelationLinks({
  label,
  changes,
  campaignId,
}: {
  label: string;
  changes: RelationChange[];
  campaignId: string;
}) {
  return (
    <p>
      {label}:{" "}
      {changes.map((c, i) => (
        <span key={c.note_id}>
          {i > 0 && ", "}
          <a
            href={`/campaigns/${campaignId}/notes/${c.note_id}`}
            className="text-primary hover:text-primary/80 underline transition-colors"
          >
            {c.name}
          </a>
        </span>
      ))}
    </p>
  );
}

/** Shows the one-shot relation-change notice on the page it targets, then forgets it. */
export default function RelationChangeNotice({ campaignId, target }: Props) {
  // Read lazily on first client render (`client:load` SSRs once with no window, hence the guard).
  // takeRelationNotice clears the key, so it must run exactly once per mount.
  const [notice, setNotice] = useState<RelationNotice | null>(null);
  const taken = useRef(false);

  useEffect(() => {
    if (taken.current) return;
    taken.current = true;
    setNotice(takeRelationNotice(window.sessionStorage, target));
  }, [target]);

  if (!notice) return null;

  const hasAdded = notice.kind === "edit" && notice.added.length > 0;
  const hasRemoved = notice.removed.length > 0;

  return (
    <Alert variant="success" role="status" className="mb-6 justify-between rounded-xl p-4">
      <CircleCheck aria-hidden="true" />
      <AlertDescription className="space-y-1">
        {notice.kind === "edit" ? (
          <>
            <p>{noteSavedNotice(notice.noteName)}</p>
            {notice.rechecked && hasAdded && (
              <RelationLinks label={MESSAGES.RELATIONS_ADDED_LABEL} changes={notice.added} campaignId={campaignId} />
            )}
            {notice.rechecked && hasRemoved && (
              <RelationLinks
                label={MESSAGES.RELATIONS_REMOVED_LABEL}
                changes={notice.removed}
                campaignId={campaignId}
              />
            )}
            {notice.rechecked && !hasAdded && !hasRemoved && <p>{MESSAGES.RELATIONS_UNCHANGED}</p>}
          </>
        ) : (
          <>
            <p>{noteDeletedNotice(notice.noteName)}</p>
            {hasRemoved ? (
              <RelationLinks
                label={MESSAGES.RELATIONS_REMOVED_LABEL}
                changes={notice.removed}
                campaignId={campaignId}
              />
            ) : (
              <p>{MESSAGES.NO_RELATIONS_TOUCHED}</p>
            )}
          </>
        )}
      </AlertDescription>
      <button
        type="button"
        aria-label={MESSAGES.NOTICE_DISMISS_LABEL}
        onClick={() => {
          setNotice(null);
        }}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </Alert>
  );
}
