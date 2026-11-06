/**
 * Viewport maths for the board. A view maps world to screen as `screen = world * k + (x, y)`;
 * the board draws everything in one group with that transform, so pan and zoom never touch
 * individual elements. All functions are pure.
 */
export type View = { x: number; y: number; k: number };
export type Size = { w: number; h: number };
export type WorldRect = { x: number; y: number; w: number; h: number };
type BoardSize = { width: number; height: number };
/** Screen pixels at the edge of the board covered by overlays such as the side panel. */
export type Inset = { right?: number; bottom?: number };

export const MAX_K = 3;
/** Pixels of the board that must stay on screen so it cannot be lost off the edge. */
const KEEP = 140;

export function fitScale(board: BoardSize, size: Size, pad = 24): number {
  const k = Math.min(
    (size.w - pad * 2) / Math.max(1, board.width),
    (size.h - pad * 2) / Math.max(1, board.height)
  );
  return Number.isFinite(k) && k > 0 ? k : 1;
}

/** Smallest allowed zoom: a little further out than the fit, so the board never floats tiny. */
export const minScale = (board: BoardSize, size: Size) =>
  Math.min(MAX_K, fitScale(board, size) * 0.85);

const clampK = (k: number, board: BoardSize, size: Size) =>
  Math.min(MAX_K, Math.max(minScale(board, size), k));

/** Keeps at least KEEP pixels of the board visible on each axis. */
export function clampView(view: View, board: BoardSize, size: Size): View {
  const k = clampK(view.k, board, size);
  const keepX = Math.min(KEEP, size.w / 2, (board.width * k) / 2);
  const keepY = Math.min(KEEP, size.h / 2, (board.height * k) / 2);
  return {
    k,
    x: Math.min(size.w - keepX, Math.max(keepX - board.width * k, view.x)),
    y: Math.min(size.h - keepY, Math.max(keepY - board.height * k, view.y))
  };
}

/** The whole board, centred, in the given size. */
export function fit(board: BoardSize, size: Size, pad = 24): View {
  const k = fitScale(board, size, pad);
  return {
    k,
    x: (size.w - board.width * k) / 2,
    y: (size.h - board.height * k) / 2
  };
}

/** Zooms by `factor` keeping the world point under the screen point (px, py) fixed. */
export function zoomAt(
  view: View,
  px: number,
  py: number,
  factor: number,
  board: BoardSize,
  size: Size
): View {
  const k = clampK(view.k * factor, board, size);
  const ratio = k / view.k;
  return clampView(
    { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio },
    board,
    size
  );
}

export function panBy(view: View, dx: number, dy: number, board: BoardSize, size: Size): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, board, size);
}

/** Centres a world rect in the free area of the screen, as large as fits up to `maxK`. */
export function zoomToRect(
  rect: WorldRect,
  board: BoardSize,
  size: Size,
  { pad = 48, maxK = 2, inset = {} }: { pad?: number; maxK?: number; inset?: Inset } = {}
): View {
  const free = {
    w: Math.max(80, size.w - (inset.right ?? 0)),
    h: Math.max(80, size.h - (inset.bottom ?? 0))
  };
  const k = clampK(
    Math.min(
      (free.w - pad * 2) / Math.max(1, rect.w),
      (free.h - pad * 2) / Math.max(1, rect.h),
      maxK
    ),
    board,
    size
  );
  return clampView(
    {
      k,
      x: free.w / 2 - (rect.x + rect.w / 2) * k,
      y: free.h / 2 - (rect.y + rect.h / 2) * k
    },
    board,
    size
  );
}

/** Pans only as far as needed to bring a world rect fully on screen. */
export function reveal(
  view: View,
  rect: WorldRect,
  board: BoardSize,
  size: Size,
  margin = 40
): View {
  const left = rect.x * view.k + view.x;
  const right = (rect.x + rect.w) * view.k + view.x;
  const top = rect.y * view.k + view.y;
  const bottom = (rect.y + rect.h) * view.k + view.y;
  let dx = 0;
  let dy = 0;
  if (left < margin) dx = margin - left;
  else if (right > size.w - margin) dx = size.w - margin - right;
  if (top < margin) dy = margin - top;
  else if (bottom > size.h - margin) dy = size.h - margin - bottom;
  return dx || dy ? panBy(view, dx, dy, board, size) : view;
}

export const visibleRect = (view: View, size: Size): WorldRect => ({
  x: -view.x / view.k,
  y: -view.y / view.k,
  w: size.w / view.k,
  h: size.h / view.k
});

export const toWorld = (view: View, px: number, py: number): [number, number] => [
  (px - view.x) / view.k,
  (py - view.y) / view.k
];

/** Scale and midpoint change between two touch points, for pinch zoom. */
export function pinch(
  from: [[number, number], [number, number]],
  to: [[number, number], [number, number]]
) {
  const dist = ([a, b]: typeof from) => Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  const mid = ([a, b]: typeof from): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { factor: dist(to) / dist(from), from: mid(from), to: mid(to) };
}
