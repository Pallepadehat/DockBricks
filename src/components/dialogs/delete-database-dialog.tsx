import { Loader2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeleteDatabaseDialogProps = {
  engineLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
};

export function DeleteDatabaseDialog({
  engineLabel,
  open,
  onOpenChange,
  deleting,
  error,
  onConfirm,
}: DeleteDatabaseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Database?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the local entry, deletes the {engineLabel} container,
            removes attached anonymous volumes, and attempts to remove the image.
          </AlertDialogDescription>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              if (deleting) return;
              onConfirm();
            }}
          >
            {deleting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
