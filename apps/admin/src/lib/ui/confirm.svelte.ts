// Promise based replacement for window.confirm. One <ConfirmDialog /> is mounted in the layout.
export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text before the confirm button enables. */
  typeToConfirm?: string;
}
interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}
class ConfirmState {
  current = $state<Pending | null>(null);
}
export const confirmState = new ConfirmState();

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  confirmState.current?.resolve(false);
  return new Promise((resolve) => {
    confirmState.current = { ...options, resolve };
  });
}
