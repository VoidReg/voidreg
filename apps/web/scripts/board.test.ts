import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHIP_H,
  CHIP_W,
  GridIndex,
  boundsOf,
  buildBoard,
  bundlesOf,
  chipAt,
  chipNear,
  circuitOf,
  lodFor,
  matchingChips,
  nearestChip,
  visibleChips,
  type Board
} from '../src/lib/map/board.ts';
import { buildModel, type Graph, type GraphNode } from '../src/lib/map/layout.ts';
import {
  chamfer,
  isBoardAngles,
  pathD,
  pinPoint,
  routeTrace,
  simplify,
  sideToward,
  type Pt,
  type Side
} from '../src/lib/map/route.ts';
import {
  MAX_K,
  clampView,
  fit,
  fitScale,
  minScale,
  pinch,
  reveal,
  toWorld,
  visibleRect,
  zoomAt,
  zoomToRect
} from '../src/lib/map/viewport.ts';

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind: 'project',
  slug: id,
  title: id,
  category: 'Systems',
  tags: [],
  published_at: null,
  draft: false,
  changed: false,
  ...extra
});

/** A summary shaped like a very large site: projects in uneven categories with related links. */
function summary(projects: number, categories: number): Graph {
  const nodes: GraphNode[] = [];
  const edges: Graph['edges'] = [];
  for (let i = 0; i < projects; i++) {
    // Uneven category sizes: lower categories hold more projects.
    const category = Math.floor(Math.sqrt((i * i) % (categories * categories)) % categories);
    nodes.push(
      node(`p${i}`, {
        category: `Category ${category}`,
        title: `Project ${String(i).padStart(4, '0')}`,
        tags: [`tag-${i % 40}`],
        post_count: 4
      })
    );
    edges.push({
      source: `p${i}`,
      target: `p${(i * 7 + 3) % projects}`,
      kind: 'related',
      weight: 1
    });
  }
  return { mode: 'summary', nodes, edges, totals: { projects, posts: projects * 4 } };
}

const intersects = (a: Board['modules'][number], b: Board['modules'][number]) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('modules never overlap and the board keeps a bounded aspect ratio at 1000 projects', () => {
  const board = buildBoard(buildModel(summary(1000, 13)));
  assert.equal(board.chips.length, 1000);
  assert.equal(board.modules.length, 13);
  for (let i = 0; i < board.modules.length; i++)
    for (let j = i + 1; j < board.modules.length; j++)
      assert.ok(!intersects(board.modules[i], board.modules[j]), `modules ${i} and ${j} overlap`);
  const aspect = board.width / board.height;
  assert.ok(aspect > 0.4 && aspect < 3, `aspect ${aspect}`);
  // Every chip sits inside its module and no two chips overlap.
  for (const chip of board.chips) {
    const m = board.modules[chip.module];
    assert.ok(
      chip.x >= m.x && chip.x + chip.w <= m.x + m.w && chip.y >= m.y && chip.y + chip.h <= m.y + m.h
    );
  }
  const seen = new Set(board.chips.map((c) => `${c.x},${c.y}`));
  assert.equal(seen.size, board.chips.length, 'no two chips share a spot');
});

test('the board layout is deterministic and handles tiny catalogues', () => {
  const graph = summary(60, 5);
  const one = buildBoard(buildModel(graph));
  const two = buildBoard(buildModel(structuredClone(graph)));
  assert.deepEqual(
    one.chips.map((c) => [c.id, c.x, c.y]),
    two.chips.map((c) => [c.id, c.x, c.y])
  );
  assert.deepEqual(one.modules, two.modules);
  const single = buildBoard(buildModel({ nodes: [node('solo')], edges: [] }));
  assert.equal(single.chips.length, 1);
  assert.equal(single.modules.length, 1);
  assert.ok(single.width > CHIP_W && single.height > CHIP_H);
  const empty = buildBoard(buildModel({ nodes: [], edges: [] }));
  assert.equal(empty.chips.length, 0);
});

test('chips are packed on a compact grid and categories keep their members together', () => {
  const board = buildBoard(buildModel(summary(300, 6)));
  for (const module of board.modules) {
    const members = board.chips.filter((c) => c.module === module.index);
    assert.equal(members.length, module.count);
    assert.ok(module.cols >= module.rows * 0.5, 'modules are wider than tall or close to it');
    assert.ok(new Set(members.map((c) => c.node.category)).size === 1);
  }
});

test('grid culling returns a bounded set at each zoom', () => {
  const board = buildBoard(buildModel(summary(1000, 13)));
  const size = { w: 1280, h: 800 };
  const sizes = { far: 0, mid: 0, near: 0 };
  for (const k of [0.5, 0.8, 1.2, 2]) {
    const mid = board.chips[500];
    const rect = visibleRect(
      { k, x: size.w / 2 - (mid.x + mid.w / 2) * k, y: size.h / 2 - (mid.y + mid.h / 2) * k },
      size
    );
    const shown = visibleChips(board, rect).length;
    sizes[lodFor(k)] = Math.max(sizes[lodFor(k)], shown);
    // Capacity of the viewport plus margin, never the catalogue.
    const cells = ((rect.w + 240) * (rect.h + 240)) / ((CHIP_W + 18) * (CHIP_H + 18));
    assert.ok(shown <= cells * 1.2 + 8, `${shown} chips at k=${k}`);
  }
  assert.ok(sizes.mid <= 320, `mid ${sizes.mid}`);
  assert.ok(sizes.near <= 130, `near ${sizes.near}`);
  const whole = visibleChips(board, { x: 0, y: 0, w: board.width, h: board.height });
  assert.equal(whole.length, 1000, 'the full board still finds every chip');
});

test('hit testing and the grid index agree with brute force', () => {
  const board = buildBoard(buildModel(summary(400, 8)));
  const target = board.chips[123];
  assert.equal(chipAt(board, target.x + 5, target.y + 5)?.id, target.id);
  assert.equal(chipAt(board, -50, -50), null);
  const index = new GridIndex(board.chips, 250);
  const rect = { x: 900, y: 700, w: 900, h: 500 };
  const brute = board.chips
    .filter(
      (b) =>
        b.x <= rect.x + rect.w &&
        b.x + b.w >= rect.x &&
        b.y <= rect.y + rect.h &&
        b.y + b.h >= rect.y
    )
    .map((b) => b.index);
  assert.deepEqual(index.query(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h), brute);
});

test('arrow navigation finds the neighbour in each direction', () => {
  const board = buildBoard(buildModel(summary(200, 4)));
  const from = board.chips[board.chips.length >> 1];
  const right = nearestChip(board, from, 'right');
  const down = nearestChip(board, from, 'down');
  assert.ok(right && right.x > from.x);
  assert.ok(down && down.y > from.y);
  const first = board.chips[0];
  assert.equal(nearestChip(board, first, 'up'), null);
});

test('filters select matching chips only when a filter is active', () => {
  const board = buildBoard(buildModel(summary(100, 4)));
  assert.equal(matchingChips(board, { q: '', tag: '', category: '' }), null);
  const hits = matchingChips(board, { q: '', tag: 'tag-3', category: '' })!;
  assert.ok(hits.length > 0 && hits.every((c) => c.node.tags.includes('tag-3')));
  assert.ok(boundsOf(hits)!.w > 0);
});

test('bundles join modules with related projects, heaviest first and capped', () => {
  const model = buildModel(summary(600, 12));
  const board = buildBoard(model);
  const bundles = bundlesOf(board, model);
  assert.ok(bundles.length > 0 && bundles.length <= 24);
  for (let i = 1; i < bundles.length; i++) assert.ok(bundles[i - 1].count >= bundles[i].count);
  for (const b of bundles) assert.notEqual(b.from, b.to);
  assert.deepEqual(
    bundlesOf(board, model).map((b) => b.d),
    bundles.map((b) => b.d),
    'deterministic'
  );
});

test('traces only use 0, 45 and 90 degree segments for any pair of pins', () => {
  const sides: Side[] = ['top', 'right', 'bottom', 'left'];
  const a = { x: 400, y: 400, w: CHIP_W, h: CHIP_H };
  let count = 0;
  for (let tx = -300; tx <= 1500; tx += 137)
    for (let ty = -300; ty <= 1300; ty += 119) {
      const b = { x: tx, y: ty, w: CHIP_W, h: CHIP_H };
      const sa = sideToward(a, b.x + b.w / 2, b.y + b.h / 2);
      const sb = sideToward(b, a.x + a.w / 2, a.y + a.h / 2);
      assert.ok(sides.includes(sa));
      const pa = pinPoint(a, sa, 1, 3);
      const pb = pinPoint(b, sb, 0, 1);
      for (const track of [0, 1, 3]) {
        const points = routeTrace(pa, sa, pb, sb, track, 0);
        assert.ok(isBoardAngles(points), `angles ${JSON.stringify(points)}`);
        assert.deepEqual(points[0], pa);
        assert.deepEqual(points.at(-1), pb);
        assert.match(pathD(points), /^M[\d.\- ]+(L[\d.\- ]+)+$/);
        count++;
      }
    }
  assert.ok(count > 300);
});

test('chamfer cuts right angles to 45 degrees and simplify removes straight runs', () => {
  const corner: Pt[] = [
    [0, 0],
    [100, 0],
    [100, 100]
  ];
  const cut = chamfer(corner, 10);
  assert.deepEqual(cut, [
    [0, 0],
    [90, 0],
    [100, 10],
    [100, 100]
  ]);
  assert.ok(isBoardAngles(cut));
  assert.deepEqual(
    simplify([
      [0, 0],
      [5, 0],
      [9, 0],
      [9, 0],
      [9, 4]
    ]),
    [
      [0, 0],
      [9, 0],
      [9, 4]
    ]
  );
  assert.ok(
    isBoardAngles([
      [0, 0],
      [10, 10],
      [10, 40]
    ])
  );
  assert.ok(
    !isBoardAngles([
      [0, 0],
      [10, 7]
    ])
  );
});

test('pins spread along an edge without overlapping', () => {
  const box = { x: 0, y: 0, w: CHIP_W, h: CHIP_H };
  const xs = [0, 1, 2, 3].map((i) => pinPoint(box, 'top', i, 4)[0]);
  assert.deepEqual(
    [...xs].sort((a, b) => a - b),
    xs
  );
  assert.ok(xs[0] >= 14 && xs[3] <= CHIP_W - 14);
  assert.equal(new Set(xs).size, 4);
});

test('a focused circuit lights related projects and lists a capped plate of posts', () => {
  const base = summary(40, 4);
  const posts = Array.from({ length: 20 }, (_, i) =>
    node(`n${i}`, { kind: 'post', title: `Post ${i}` })
  );
  const expanded: Graph = {
    mode: 'project',
    project: 'p3',
    posts_total: 20,
    nodes: [base.nodes[3], ...posts],
    edges: posts.map((p) => ({
      source: p.id,
      target: 'p3',
      kind: 'post-project' as const,
      weight: 1
    }))
  };
  const model = buildModel(base, [expanded]);
  const board = buildBoard(model);
  const circuit = circuitOf(board, model, 'p3')!;
  assert.ok(circuit.traces.length >= 1);
  for (const t of circuit.traces) assert.ok(circuit.lit.has(t.target));
  assert.equal(circuit.plate!.rows.length, 12);
  assert.equal(circuit.plate!.more!.count, 8);
  assert.ok(circuit.plate!.y >= circuit.focus.y + CHIP_H);
  assert.ok(circuit.bounds.h > CHIP_H, 'bounds include the plate');
  assert.ok(circuit.neighbourBounds.w >= circuit.bounds.w);
  assert.equal(circuitOf(board, model, 'missing'), null);
  const bare = circuitOf(board, buildModel(base), 'p3')!;
  assert.equal(bare.plate, null, 'no plate until posts are known');
});

test('level of detail changes at fixed zoom thresholds', () => {
  assert.equal(lodFor(0.2), 'far');
  assert.equal(lodFor(0.7), 'mid');
  assert.equal(lodFor(1.6), 'near');
});

const board = { width: 6000, height: 4000 };
const size = { w: 1200, h: 800 };

test('fit centres the whole board and clamps never lose it', () => {
  const view = fit(board, size);
  assert.ok(Math.abs(view.k - fitScale(board, size)) < 1e-9);
  assert.ok(view.x >= 0 && view.y >= 0);
  assert.ok(view.k * board.width <= size.w && view.k * board.height <= size.h);
  const lost = clampView({ k: 1, x: 99999, y: -99999 }, board, size);
  assert.ok(lost.x < size.w && lost.y + board.height * lost.k > 0);
  assert.equal(clampView({ k: 100, x: 0, y: 0 }, board, size).k, MAX_K);
  assert.equal(clampView({ k: 0.0001, x: 0, y: 0 }, board, size).k, minScale(board, size));
});

test('zooming keeps the point under the pointer fixed', () => {
  const start = { k: 0.8, x: -900, y: -600 };
  const px = 500;
  const py = 300;
  const before = toWorld(start, px, py);
  const next = zoomAt(start, px, py, 1.5, board, size);
  assert.ok(next.k > start.k);
  const after = toWorld(next, px, py);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-6 && Math.abs(before[1] - after[1]) < 1e-6);
  assert.equal(zoomAt(start, px, py, 100, board, size).k, MAX_K);
});

test('zoom to a rect centres it within the free area and honours the maximum', () => {
  const rect = { x: 2000, y: 1000, w: 600, h: 300 };
  const view = zoomToRect(rect, board, size);
  const visible = visibleRect(view, size);
  assert.ok(visible.x <= rect.x && visible.x + visible.w >= rect.x + rect.w);
  assert.ok(visible.y <= rect.y && visible.y + visible.h >= rect.y + rect.h);
  const tiny = zoomToRect({ x: 2000, y: 1000, w: 10, h: 10 }, board, size, { maxK: 1.5 });
  assert.equal(tiny.k, 1.5);
  const inset = zoomToRect(rect, board, size, { inset: { right: 320 } });
  const centreX = (rect.x + rect.w / 2) * inset.k + inset.x;
  assert.ok(Math.abs(centreX - (size.w - 320) / 2) < 1, 'centred left of the panel');
});

test('reveal pans only when a rect is off screen, and pinch reports scale and midpoint', () => {
  const view = { k: 1, x: -1000, y: -1000 };
  assert.equal(reveal(view, { x: 1200, y: 1200, w: 100, h: 50 }, board, size), view);
  const moved = reveal(view, { x: 100, y: 100, w: 100, h: 50 }, board, size);
  assert.ok(moved.x > view.x && moved.y > view.y);
  const p = pinch(
    [
      [0, 0],
      [100, 0]
    ],
    [
      [0, 0],
      [200, 0]
    ]
  );
  assert.equal(p.factor, 2);
  assert.deepEqual(p.from, [50, 0]);
  assert.deepEqual(p.to, [100, 0]);
});

test('the portrait layout is taller than the landscape one for the same catalogue', () => {
  const model = buildModel(summary(1000, 13));
  const wide = buildBoard(model);
  const tall = buildBoard(model, true);
  assert.equal(tall.chips.length, wide.chips.length);
  assert.ok(tall.width / tall.height < wide.width / wide.height);
  for (let i = 0; i < tall.modules.length; i++)
    for (let j = i + 1; j < tall.modules.length; j++)
      assert.ok(!intersects(tall.modules[i], tall.modules[j]));
});

test('chipNear picks the closest chip within a tolerance and prefers a direct hit', () => {
  const board = buildBoard(buildModel(summary(100, 4)));
  const chip = board.chips[10];
  assert.equal(chipNear(board, chip.x + 3, chip.y + 3, 0)?.id, chip.id);
  // Just outside the chip, in the gap, only a tolerance finds it.
  assert.equal(chipNear(board, chip.x + chip.w + 4, chip.y + 10, 0), null);
  assert.equal(chipNear(board, chip.x + chip.w + 4, chip.y + 10, 8)?.id !== undefined, true);
  assert.equal(chipNear(board, -500, -500, 20), null);
});
