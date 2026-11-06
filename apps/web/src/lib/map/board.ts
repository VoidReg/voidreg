/**
 * Pure, deterministic layout of the knowledge map as one circuit board. Categories are board
 * modules packed on shelves, projects are chips on a compact grid inside their module, and a
 * focused project grows a circuit of traces to its related projects plus a breakout plate of
 * post pads. Everything is a function of the model, so the server and client agree, and a grid
 * index keeps drawing proportional to what is on screen instead of to the catalogue.
 */
import {
  categoryOf,
  truncate,
  wrap,
  type GraphNode,
  type MapFilter,
  type MapModel,
  matches
} from './layout';
import {
  pathD,
  pathLength,
  pinPoint,
  routeTrace,
  sideToward,
  type Box,
  type Pt,
  type Side
} from './route';

export const CHIP_W = 172;
export const CHIP_H = 60;
export const GAP_X = 18;
export const GAP_Y = 18;
export const MOD_PAD = 26;
export const MOD_HEAD = 46;
export const MOD_GAP = 120;
export const BOARD_MARGIN = 140;
/** Posts listed on a breakout plate before "N more". */
export const PLATE_POSTS = 12;
export const PLATE_W = 244;
const PLATE_ROW = 26;
const PLATE_PAD = 14;
const MAX_BUNDLES = 24;
const MAX_CIRCUIT_LINKS = 24;
const MAX_SHARED_TRACES = 8;
const CELL = 400;

export type BoardModule = Box & {
  index: number;
  key: string;
  name: string;
  count: number;
  cols: number;
  rows: number;
};
export type BoardChip = Box & {
  index: number;
  id: string;
  node: GraphNode;
  module: number;
  lines: string[];
  meta: string;
};
export type Board = {
  width: number;
  height: number;
  modules: BoardModule[];
  chips: BoardChip[];
  chipById: Map<string, BoardChip>;
  index: GridIndex;
};

/** Uniform grid over the board so viewport queries cost the size of the answer. */
export class GridIndex {
  private cells = new Map<number, number[]>();
  constructor(
    private boxes: Box[],
    private cell = CELL
  ) {
    boxes.forEach((box, i) => {
      const [x0, y0, x1, y1] = this.span(box.x, box.y, box.x + box.w, box.y + box.h);
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const key = this.key(cx, cy);
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
    });
  }
  private key = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);
  private span(x0: number, y0: number, x1: number, y1: number) {
    const c = this.cell;
    return [Math.floor(x0 / c), Math.floor(y0 / c), Math.floor(x1 / c), Math.floor(y1 / c)];
  }
  /** Indexes of boxes intersecting the rectangle, in ascending order. */
  query(x0: number, y0: number, x1: number, y1: number): number[] {
    const [cx0, cy0, cx1, cy1] = this.span(x0, y0, x1, y1);
    const found = new Set<number>();
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++)
        for (const i of this.cells.get(this.key(cx, cy)) ?? []) {
          const b = this.boxes[i];
          if (b.x <= x1 && b.x + b.w >= x0 && b.y <= y1 && b.y + b.h >= y0) found.add(i);
        }
    return [...found].sort((a, b) => a - b);
  }
}

/** Level of detail for a zoom factor: tiles far out, titles in the middle, pins up close. */
export type Lod = 'far' | 'mid' | 'near';
export const LOD_MID = 0.5;
export const LOD_NEAR = 1.15;
export const lodFor = (k: number): Lod => (k < LOD_MID ? 'far' : k < LOD_NEAR ? 'mid' : 'near');

/**
 * `portrait` suits narrow screens: modules are narrower and taller and shelves hold fewer of
 * them, so the whole board is closer to the screen's own shape.
 */
export function buildBoard(model: MapModel, portrait = false): Board {
  // Projects arrive sorted by category then title, so each category is one contiguous run.
  const groups: { key: string; name: string; nodes: GraphNode[] }[] = [];
  for (const node of model.projects) {
    const key = categoryOf(node).toLowerCase();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.nodes.push(node);
    else groups.push({ key, name: categoryOf(node), nodes: [node] });
  }
  const sized = groups.map((g) => {
    const cols = Math.max(
      1,
      Math.min(g.nodes.length, Math.ceil(Math.sqrt(g.nodes.length * (portrait ? 0.4 : 1.3))))
    );
    const rows = Math.ceil(g.nodes.length / cols);
    return {
      ...g,
      cols,
      rows,
      w: cols * (CHIP_W + GAP_X) - GAP_X + MOD_PAD * 2,
      h: MOD_HEAD + rows * (CHIP_H + GAP_Y) - GAP_Y + MOD_PAD
    };
  });
  // Largest first with a name tie-break keeps shelves tidy and the order stable.
  sized.sort((a, b) => b.nodes.length - a.nodes.length || a.key.localeCompare(b.key));
  const area = sized.reduce((sum, m) => sum + (m.w + MOD_GAP) * (m.h + MOD_GAP), 0);
  const maxW = sized.reduce((max, m) => Math.max(max, m.w), 0);
  const target = Math.max(maxW, Math.sqrt(area * (portrait ? 0.9 : 2.4)));

  const modules: BoardModule[] = [];
  const chips: BoardChip[] = [];
  let x = BOARD_MARGIN;
  let y = BOARD_MARGIN;
  let shelf = 0;
  let right = 0;
  for (const m of sized) {
    if (x > BOARD_MARGIN && x - BOARD_MARGIN + m.w > target) {
      x = BOARD_MARGIN;
      y += shelf + MOD_GAP;
      shelf = 0;
    }
    const index = modules.length;
    modules.push({
      index,
      key: m.key,
      name: m.name,
      count: m.nodes.length,
      cols: m.cols,
      rows: m.rows,
      x,
      y,
      w: m.w,
      h: m.h
    });
    m.nodes.forEach((node, i) => {
      chips.push({
        index: chips.length,
        id: node.id,
        node,
        module: index,
        x: x + MOD_PAD + (i % m.cols) * (CHIP_W + GAP_X),
        y: y + MOD_HEAD + Math.floor(i / m.cols) * (CHIP_H + GAP_Y),
        w: CHIP_W,
        h: CHIP_H,
        lines: wrap(node.title, 20, 2),
        meta: truncate(m.name.toUpperCase(), 20)
      });
    });
    right = Math.max(right, x + m.w);
    shelf = Math.max(shelf, m.h);
    x += m.w + MOD_GAP;
  }
  return {
    width: right + BOARD_MARGIN,
    height: y + shelf + BOARD_MARGIN,
    modules,
    chips,
    chipById: new Map(chips.map((c) => [c.id, c])),
    index: new GridIndex(chips)
  };
}

/** Chips intersecting a world rectangle, grown by `margin`. */
export function visibleChips(
  board: Board,
  rect: { x: number; y: number; w: number; h: number },
  margin = 120
): BoardChip[] {
  return board.index
    .query(rect.x - margin, rect.y - margin, rect.x + rect.w + margin, rect.y + rect.h + margin)
    .map((i) => board.chips[i]);
}

/** The chip under a world point, if any. */
export function chipAt(board: Board, x: number, y: number): BoardChip | null {
  const [i] = board.index.query(x, y, x, y);
  return i === undefined ? null : board.chips[i];
}

/**
 * The chip closest to a world point within `tolerance`, so small tiles stay easy to hit when the
 * board is zoomed out and for fingers. A point inside a chip always wins.
 */
export function chipNear(board: Board, x: number, y: number, tolerance: number): BoardChip | null {
  let best: BoardChip | null = null;
  let bestDistance = Infinity;
  for (const i of board.index.query(x - tolerance, y - tolerance, x + tolerance, y + tolerance)) {
    const c = board.chips[i];
    const d = Math.hypot(
      Math.max(c.x - x, 0, x - (c.x + c.w)),
      Math.max(c.y - y, 0, y - (c.y + c.h))
    );
    if (d <= tolerance && d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

export type Dir = 'left' | 'right' | 'up' | 'down';

/** Nearest chip in a direction, used by arrow-key navigation. */
export function nearestChip(board: Board, from: BoardChip, dir: Dir): BoardChip | null {
  const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const reach = Math.max(board.width, board.height);
  for (let radius = 360; ; radius *= 2) {
    let best: BoardChip | null = null;
    let bestScore = Infinity;
    for (const i of board.index.query(cx - radius, cy - radius, cx + radius, cy + radius)) {
      const other = board.chips[i];
      if (other === from) continue;
      const ox = other.x + other.w / 2 - cx;
      const oy = other.y + other.h / 2 - cy;
      const along = ox * dx + oy * dy;
      const across = Math.abs(ox * dy - oy * dx);
      if (along <= 4 || across > along * 2 + CHIP_H) continue;
      const score = along + across * 2;
      if (score < bestScore) {
        best = other;
        bestScore = score;
      }
    }
    if (best || radius > reach) return best;
  }
}

export type Rect = { x: number; y: number; w: number; h: number };

export function boundsOf(boxes: Box[]): Rect | null {
  if (!boxes.length) return null;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Chips that pass the filter, or null when no filter is active. */
export function matchingChips(board: Board, filter: MapFilter): BoardChip[] | null {
  if (!filter.q && !filter.tag && !filter.category) return null;
  return board.chips.filter((c) => matches(c.node, filter));
}

export type Bundle = {
  key: string;
  from: number;
  to: number;
  count: number;
  d: string;
  /** Pad positions at the two module edges. */
  ends: [Pt, Pt];
};

/** Thick buses between modules whose projects are related; the heaviest few only. */
export function bundlesOf(board: Board, model: MapModel, limit = MAX_BUNDLES): Bundle[] {
  const counts = new Map<string, number>();
  for (const e of model.edges) {
    if (e.kind !== 'related') continue;
    const a = board.chipById.get(e.source);
    const b = board.chipById.get(e.target);
    if (!a || !b || a.module === b.module) continue;
    const [lo, hi] = a.module < b.module ? [a.module, b.module] : [b.module, a.module];
    const key = `${lo}|${hi}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const heavy = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => {
      const [from, to] = key.split('|').map(Number);
      return { key, from, to, count };
    });
  // Spread the buses leaving one module edge along it, ordered by where they are heading.
  type End = { bundle: number; module: number; side: Side; other: number };
  const ends: End[] = [];
  heavy.forEach((b, bundle) => {
    const [ma, mb] = [board.modules[b.from], board.modules[b.to]];
    ends.push({
      bundle,
      module: b.from,
      side: sideToward(ma, mb.x + mb.w / 2, mb.y + mb.h / 2),
      other: b.to
    });
    ends.push({
      bundle,
      module: b.to,
      side: sideToward(mb, ma.x + ma.w / 2, ma.y + ma.h / 2),
      other: b.from
    });
  });
  const pins = assignPins(
    ends.map((e) => ({
      group: `${e.module}:${e.side}`,
      order:
        e.side === 'top' || e.side === 'bottom'
          ? board.modules[e.other].x
          : board.modules[e.other].y,
      tie: e.bundle
    }))
  );
  const resolved = new Map<number, { p: Pt; side: Side }[]>();
  ends.forEach((e, i) => {
    const m = board.modules[e.module];
    const slot = pins[i];
    const p = pinPoint(m, e.side, slot.index, slot.count, 40);
    if (!resolved.has(e.bundle)) resolved.set(e.bundle, []);
    resolved.get(e.bundle)!.push({ p, side: e.side });
  });
  return heavy.map((b, i) => {
    const [pa, pb] = resolved.get(i)!;
    const points = routeTrace(pa.p, pa.side, pb.p, pb.side, 0, 0);
    return {
      key: b.key,
      from: b.from,
      to: b.to,
      count: b.count,
      d: pathD(points),
      ends: [pa.p, pb.p]
    };
  });
}

/** Slot index and size of each item inside its group, ordered by `order` then `tie`. */
function assignPins(items: { group: string; order: number; tie: number }[]) {
  const groups = new Map<string, number[]>();
  items.forEach((item, i) => {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group)!.push(i);
  });
  const out = items.map(() => ({ index: 0, count: 1 }));
  for (const list of groups.values()) {
    list.sort((a, b) => items[a].order - items[b].order || items[a].tie - items[b].tie || a - b);
    list.forEach((item, index) => (out[item] = { index, count: list.length }));
  }
  return out;
}

export type CircuitTrace = {
  key: string;
  kind: 'related' | 'shared-tag';
  /** Project at the far end of the trace. */
  target: string;
  d: string;
  length: number;
  /** Pad positions at the focus chip and at the far chip. */
  ends: [Pt, Pt];
};
export type PlateRow = { key: string; node: GraphNode; x: number; y: number; label: string };
export type Plate = Rect & {
  rows: PlateRow[];
  more: { x: number; y: number; count: number; slug: string } | null;
  /** Vertical bus from the chip to the last pad. */
  bus: string;
};
export type Circuit = {
  focus: BoardChip;
  traces: CircuitTrace[];
  plate: Plate | null;
  /** Everything that stays lit: the focus, its linked projects and its posts. */
  lit: Set<string>;
  /** Bounds of the chip, its breakout plate and optionally its neighbours. */
  bounds: Rect;
  neighbourBounds: Rect;
};

/** The lit circuit of one project: traces to related projects and a plate of post pads. */
export function circuitOf(board: Board, model: MapModel, focusId: string): Circuit | null {
  const focus = board.chipById.get(focusId);
  if (!focus) return null;
  // One trace per neighbour; a related link beats a shared-technology link.
  const links = new Map<string, 'related' | 'shared-tag'>();
  for (const e of model.edges) {
    const other = e.source === focusId ? e.target : e.target === focusId ? e.source : '';
    if (!other || !board.chipById.has(other)) continue;
    const kind = e.kind === 'related' ? 'related' : 'shared-tag';
    if (links.get(other) !== 'related') links.set(other, kind);
  }
  const neighbours = [...links.entries()]
    .sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === 'related' ? -1 : 1))
    .filter(
      ([, kind], i, all) =>
        kind === 'related' || i - all.findIndex(([, k]) => k !== 'related') < MAX_SHARED_TRACES
    )
    .slice(0, MAX_CIRCUIT_LINKS);

  const entry = model.postsOf.get(focusId);
  const listed = entry ? entry.items.slice(0, PLATE_POSTS) : [];
  const hasPlate = listed.length > 0;
  const sides = neighbours.map(([id]) => {
    const t = board.chipById.get(id)!;
    return sideToward(focus, t.x + t.w / 2, t.y + t.h / 2);
  });
  const pins = assignPins(
    neighbours.map(([id], i) => {
      const t = board.chipById.get(id)!;
      const horizontal = sides[i] === 'top' || sides[i] === 'bottom';
      return { group: sides[i], order: horizontal ? t.x : t.y, tie: i };
    })
  );
  const traces: CircuitTrace[] = neighbours.map(([id, kind], i) => {
    const target = board.chipById.get(id)!;
    const side = sides[i];
    const margin = side === 'bottom' && hasPlate ? 44 : 14;
    const a = pinPoint(focus, side, pins[i].index, pins[i].count, margin);
    const farSide = sideToward(target, focus.x + focus.w / 2, focus.y + focus.h / 2);
    const b = pinPoint(target, farSide, 0, 1);
    const points = routeTrace(a, side, b, farSide, pins[i].index, 0);
    return {
      key: `${kind}:${id}`,
      kind,
      target: id,
      d: pathD(points),
      length: pathLength(points),
      ends: [a, b]
    };
  });

  const lit = new Set<string>([focusId, ...neighbours.map(([id]) => id)]);
  let plate: Plate | null = null;
  if (entry && listed.length > 0) {
    const rest = entry.total - listed.length;
    const x = focus.x;
    const y = focus.y + focus.h + 24;
    const rows: PlateRow[] = listed.map((node, i) => {
      lit.add(node.id);
      return {
        key: node.id,
        node,
        x: x + 16,
        y: y + PLATE_PAD + i * PLATE_ROW + PLATE_ROW / 2,
        label: truncate(node.title, 30)
      };
    });
    const count = rows.length + (rest > 0 ? 1 : 0);
    const h = PLATE_PAD * 2 + count * PLATE_ROW;
    const lastY = y + PLATE_PAD + (count - 1) * PLATE_ROW + PLATE_ROW / 2;
    plate = {
      x,
      y,
      w: PLATE_W,
      h,
      rows,
      more: rest > 0 ? { x: x + 16, y: lastY, count: rest, slug: focus.node.slug } : null,
      bus: `M${x + 16} ${focus.y + focus.h}V${lastY}`
    };
  }
  const own: Box[] = [focus, ...(plate ? [plate] : [])];
  const bounds = boundsOf(own)!;
  const neighbourBounds = boundsOf([...own, ...neighbours.map(([id]) => board.chipById.get(id)!)])!;
  return { focus, traces, plate, lit, bounds, neighbourBounds };
}
