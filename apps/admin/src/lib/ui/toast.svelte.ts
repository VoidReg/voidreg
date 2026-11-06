export type ToastTone = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  action?: { label: string; run: () => void };
}
class ToastState {
  items = $state<Toast[]>([]);
  private next = 1;
  push(text: string, tone: ToastTone = 'info', action?: Toast['action'], ms?: number) {
    const id = this.next++;
    this.items = [...this.items.slice(-3), { id, tone, text, action }];
    const life = ms ?? (tone === 'error' ? 10000 : 4500);
    if (life > 0) setTimeout(() => this.dismiss(id), life);
    return id;
  }
  dismiss(id: number) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}
export const toasts = new ToastState();
export const notify = {
  info: (text: string, action?: Toast['action']) => toasts.push(text, 'info', action),
  success: (text: string, action?: Toast['action']) => toasts.push(text, 'success', action),
  error: (text: string, action?: Toast['action']) => toasts.push(text, 'error', action)
};
