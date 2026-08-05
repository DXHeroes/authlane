import type { ReactNode } from 'react';
import Button from './Button';
import Dialog from './Dialog';

/**
 * Replaces `window.confirm()` on the three actions that cannot be undone.
 *
 * The native dialog names the page, not the thing being destroyed, cannot say what the
 * consequence is, and on a phone reads as a browser warning rather than part of the
 * product. The confirm button repeats the verb of the button that opened it, so nobody
 * has to work out whether "OK" means revoke.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  onConfirm,
  isPending,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isPending={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{children}</div>
    </Dialog>
  );
}
