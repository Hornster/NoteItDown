import { useEffect, useRef, useState } from "react";
import { CircleAlert, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <Alert variant="destructive" role="alert" className="mb-6 justify-between rounded-xl p-4">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="space-y-1">
        <p>{MESSAGES.IMAGE_FAILURE_NOTICE_HEADING}</p>
        <ul className="list-disc pl-5">
          {notice.failures.map((f, i) => (
            <li key={`${f.label}-${String(i)}`}>
              {f.label}: {f.reason}
            </li>
          ))}
        </ul>
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
