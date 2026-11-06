/**
 * Board-style trace routing. Every segment of a routed trace is horizontal, vertical or at
 * 45 degrees, which is what gives the map its circuit-board look. Pure and deterministic.
 */
export type Pt = [number, number];
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Box = { x: number; y: number; w: number; h: number };

/** Length of the straight stub that leaves a pin before a trace is free to turn. */
export const STUB = 18;
/** Extra stub length per track, so traces leaving one edge run side by side. */
export const TRACK = 6;

const DIRS: Record<Side, Pt> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

export const opposite = (side: Side): Side =>
  ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' })[side] as Side;

/** The edge of `box` that faces the point (tx, ty), chosen by the dominant axis. */
export function sideToward(box: Box, tx: number, ty: number): Side {
  const dx = tx - (box.x + box.w / 2);
  const dy = ty - (box.y + box.h / 2);
  // Compare in box-relative units so wide boxes still use their short edges sensibly.
  if (Math.abs(dx) / box.w >= Math.abs(dy) / box.h) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Position of pin `slot` of `slots` along one edge of a box. */
export function pinPoint(box: Box, side: Side, slot: number, slots: number, margin = 14): Pt {
  const horizontal = side === 'top' || side === 'bottom';
  const length = horizontal ? box.w : box.h;
  const usable = Math.max(0, length - margin * 2);
  const along = margin + (usable * (slot + 0.5)) / Math.max(1, slots);
  if (side === 'top') return [box.x + along, box.y];
  if (side === 'bottom') return [box.x + along, box.y + box.h];
  if (side === 'left') return [box.x, box.y + along];
  return [box.x + box.w, box.y + along];
}

const step = (p: Pt, side: Side, distance: number): Pt => [
  p[0] + DIRS[side][0] * distance,
  p[1] + DIRS[side][1] * distance
];

/** Drops repeated points and the middle point of any straight run. */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (cross === 0 && dot > 0) out.splice(i, 1);
  }
  return out;
}

/**
 * Cuts every right-angle corner to a 45 degree chamfer of at most `radius`. Existing 45 degree
 * turns are left alone, so the result only contains 0, 45 and 90 degree segments.
 */
export function chamfer(points: Pt[], radius = 7): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const inLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const outLen = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    const right = dot === 0;
    if (!right) {
      out.push(b);
      continue;
    }
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ux = Math.sign(b[0] - a[0]);
    const uy = Math.sign(b[1] - a[1]);
    const vx = Math.sign(c[0] - b[0]);
    const vy = Math.sign(c[1] - b[1]);
    out.push([b[0] - ux * r, b[1] - uy * r], [b[0] + vx * r, b[1] + vy * r]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Routes a trace from pin `a` (leaving through `aSide`) to pin `b` (entered through `bSide`).
 * Both ends get a straight stub; between the stubs the trace runs straight, then turns
 * 45 degrees for the rest of the distance, like an autorouted board.
 */
export function routeTrace(a: Pt, aSide: Side, b: Pt, bSide: Side, trackA = 0, trackB = 0): Pt[] {
  const sa = step(a, aSide, STUB + trackA * TRACK);
  const sb = step(b, bSide, STUB + trackB * TRACK);
  const dx = sb[0] - sa[0];
  const dy = sb[1] - sa[1];
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // Run along the dominant axis first, then take the remaining distance on the diagonal.
  const mid: Pt =
    adx >= ady
      ? [sa[0] + Math.sign(dx) * (adx - ady), sa[1]]
      : [sa[0], sa[1] + Math.sign(dy) * (ady - adx)];
  return chamfer(simplify([a, sa, mid, sb, b]));
}

export const pathD = (points: Pt[]): string =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('');

const round = (n: number) => Math.round(n * 10) / 10;

export function pathLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** True when every segment is horizontal, vertical or exactly diagonal. */
export function isBoardAngles(points: Pt[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i][0] - points[i - 1][0]);
    const dy = Math.abs(points[i][1] - points[i - 1][1]);
    if (dx !== 0 && dy !== 0 && Math.abs(dx - dy) > 1e-6) return false;
  }
  return true;
}
