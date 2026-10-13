import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteNote } from "@/components/hooks/useDeleteNote";
import { MESSAGES } from "@/lib/constants/messages";

interface DeleteNoteButtonProps {
  campaignId: string;
  noteId: string;
  noteName: string;
  relationCount: number;
}

function relationSummary(count: number): string {
  if (count === 0) return "It has no relations.";
  if (count === 1) return "It is connected to 1 other note; that relation will be removed.";
  return `It is connected to ${String(count)} other notes; those relations will be removed.`;
}

export default function DeleteNoteButton({ campaignId, noteId, noteName, relationCount }: DeleteNoteButtonProps) {
  const { remove, pending, error } = useDeleteNote(campaignId, noteId);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" className="text-sm text-red-300 transition-colors hover:text-red-200 hover:underline">
          {MESSAGES.DELETE_LABEL}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{noteName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This note will be deleted permanently. {relationSummary(relationCount)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error.error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{MESSAGES.CANCEL_LABEL}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              // Keep the dialog open so a failure renders inside it.
              e.preventDefault();
              void remove();
            }}
          >
            {pending ? "Deleting…" : MESSAGES.DELETE_LABEL}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
