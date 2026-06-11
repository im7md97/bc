import { Dialog, DialogContent } from "@/components/ui/dialog";

interface EntryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EntryFormModal({ isOpen, onClose }: EntryFormModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent />
    </Dialog>
  );
}
