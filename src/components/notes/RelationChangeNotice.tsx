import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
            className="text-purple-300 underline transition-colors hover:text-purple-100"
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
    <div
      role="status"
      className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/90 backdrop-blur-xl"
    >
      <div className="space-y-1">
        {notice.kind === "edit" ? (
          <>
            <p>Saved &quot;{notice.noteName}&quot;.</p>
            {notice.rechecked && hasAdded && (
              <RelationLinks label="Relations added" changes={notice.added} campaignId={campaignId} />
            )}
            {notice.rechecked && hasRemoved && (
              <RelationLinks label="Relations removed" changes={notice.removed} campaignId={campaignId} />
            )}
            {notice.rechecked && !hasAdded && !hasRemoved && <p>Relations unchanged.</p>}
          </>
        ) : (
          <>
            <p>Deleted &quot;{notice.noteName}&quot;.</p>
            {hasRemoved ? (
              <RelationLinks label="Relations removed" changes={notice.removed} campaignId={campaignId} />
            ) : (
              <p>No relations touched.</p>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setNotice(null);
        }}
        className="shrink-0 text-white/60 transition-colors hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
