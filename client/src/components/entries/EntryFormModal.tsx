import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteEntry } from "@/hooks/use-entries";
import { Loader2, Trash2 } from "lucide-react";

// ─── EntryFormModal ────────────────────────────────────────────────────────────

interface EntryFormModalProps { isOpen: boolean; onClose: () => void; }

export function EntryFormModal({ isOpen, onClose }: EntryFormModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent />
    </Dialog>
  );
}

// ─── DeleteAlertModal ──────────────────────────────────────────────────────────

interface DeleteAlertModalProps { isOpen: boolean; onClose: () => void; entryId: number | null; }

export function DeleteAlertModal({ isOpen, onClose, entryId }: DeleteAlertModalProps) {
  const deleteMutation = useDeleteEntry();

  const handleDelete = async () => {
    if (!entryId) return;
    try { await deleteMutation.mutateAsync(entryId); onClose(); } catch {}
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent dir="rtl" className="sm:max-w-[425px]">
        <AlertDialogHeader className="text-right flex flex-col items-start gap-4">
          <div className="p-3 bg-destructive/10 rounded-full w-fit">
            <Trash2 className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <AlertDialogTitle className="text-xl font-bold text-foreground">هل أنت متأكد من الحذف؟</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground mt-2">
              هذا الإجراء لا يمكن التراجع عنه. سيتم حذف السجل بجميع بياناته من قاعدة البيانات نهائياً.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-start gap-2 mt-4">
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
          >
            {deleteMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            تأكيد الحذف
          </AlertDialogAction>
          <AlertDialogCancel disabled={deleteMutation.isPending} className="mt-0 w-full sm:w-auto">تراجع</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
