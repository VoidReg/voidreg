// Pure page-window math shared by the reader and the admin pagers. No framework imports.
export type PageWindow = {
  /** Page numbers to show as buttons, at most `size`, consecutive, containing `current`. */
  pages: number[];
  /** The first page is outside the window, so a jump to it is useful. */
  showFirst: boolean;
  /** The last page is outside the window. */
  showLast: boolean;
  /** At least one page hides between page 1 and the window. */
  gapBefore: boolean;
  gapAfter: boolean;
  total: number;
  current: number;
};

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

/**
 * A window of `size` pages around `current`, shifted at the ends so it stays full whenever the
 * list is long enough. Out-of-range input is clamped.
 */
export function pageWindow(current: number, total: number, size = 5): PageWindow {
  const last = Math.max(1, Math.floor(total));
  const page = Math.min(Math.max(1, Math.floor(current) || 1), last);
  const span = Math.min(size, last);
  const start = Math.min(Math.max(1, page - Math.floor(span / 2)), last - span + 1);
  const pages = Array.from({ length: span }, (_, i) => start + i);
  const end = pages[pages.length - 1];
  return {
    pages,
    showFirst: start > 1,
    showLast: end < last,
    gapBefore: start > 2,
    gapAfter: end < last - 1,
    total: last,
    current: page
  };
}
