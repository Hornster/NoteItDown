import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { takeImageFailureNotice, type ImageFailureNotice as Notice } from "@/lib/image-failure-notice";
import { MESSAGES } from "@/lib/constants/messages";

interface Props {
  noteId: string;
}

/** Shows the one-shot "note saved, but these images failed" notice on the edit page, then forgets it. */
export default function ImageFailureNotice({ noteId }: Props) {
  // takeImageFailureNotice clears the key, so it must run exactly once per mount.
  const [notice, setNotice] = useState<Notice | null>(null);
  const taken = useRef(false);

  useEffect(() => {
    if (taken.current) return;
    taken.current = true;
    setNotice(takeImageFailureNotice(window.sessionStorage, noteId));
  }, [noteId]);

  if (!notice) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100 backdrop-blur-xl"
    >
      <div className="space-y-1">
        <p>{MESSAGES.IMAGE_FAILURE_NOTICE_HEADING}</p>
        <ul className="list-disc pl-5">
          {notice.failures.map((f, i) => (
            <li key={`${f.label}-${String(i)}`}>
              {f.label}: {f.reason}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label={MESSAGES.NOTICE_DISMISS_LABEL}
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
