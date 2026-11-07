// Positioning and dismissal for the popover lists used by Select and Combobox. The list is a
// manual popover, so it renders in the top layer and is never clipped by scrolling panels,
// containers or dialogs.

/** Places `popup` under `anchor`, or above it when there is more room there. */
export function place(anchor: HTMLElement, popup: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const below = window.innerHeight - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  const flip = below < 180 && above > below;
  popup.style.minWidth = `${rect.width}px`;
  popup.style.maxWidth = `${Math.max(rect.width, Math.min(window.innerWidth - margin * 2, 32 * 16))}px`;
  popup.style.maxHeight = `${Math.max(112, Math.min(20 * 16, flip ? above : below))}px`;
  const left = Math.max(
    margin,
    Math.min(rect.left, window.innerWidth - popup.offsetWidth - margin)
  );
  const top = flip ? rect.top - gap - popup.offsetHeight : rect.bottom + gap;
  popup.style.left = `${left}px`;
  popup.style.top = `${Math.max(margin, top)}px`;
}

/**
 * Calls `close` for a press outside the control and its list, for a scroll of anything but the
 * list, and for a resize. Returns the function that removes the listeners.
 */
export function watchOutside(inside: (target: Node) => boolean, close: () => void): () => void {
  const press = (event: PointerEvent) => {
    if (!(event.target instanceof Node) || !inside(event.target)) close();
  };
  const scroll = (event: Event) => {
    if (!(event.target instanceof Node) || !inside(event.target)) close();
  };
  window.addEventListener('pointerdown', press, true);
  window.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', close);
  return () => {
    window.removeEventListener('pointerdown', press, true);
    window.removeEventListener('scroll', scroll, true);
    window.removeEventListener('resize', close);
  };
}
