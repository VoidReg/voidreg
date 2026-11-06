import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHIP_W,
  LANE_PAGE,
  POSTS_SHOWN,
  MAX_OPEN,
  buildModel,
  lanesOf,
  layoutLane,
  neighbourhood,
  outlineOf,
  parseOpen,
  toggleOpen,
  truncate,
  wrap,
  type Graph,
  type GraphNode
} from '../src/lib/map/layout.ts';

const node = (id: string, kind: GraphNode['kind'], extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind,
  slug: id,
  title: id,
  category: 'Systems',
  tags: [],
  published_at: null,
  draft: false,
  changed: false,
  ...extra
});
const graph: Graph = {
  nodes: [
    node('a', 'project', { category: 'Graphics', tags: ['Rust'] }),
    node('b', 'project', { tags: ['rust', 'DSP'] }),
    node('c', 'project'),
    node('p1', 'post', { published_at: '2026-02-01T00:00:00Z' }),
    node('p2', 'post', { published_at: '2026-01-01T00:00:00Z' }),
    node('lone', 'post', { published_at: '2026-03-01T00:00:00Z' })
  ],
  edges: [
    { source: 'p1', target: 'a', kind: 'post-project', weight: 1 },
    { source: 'p2', target: 'a', kind: 'post-project', weight: 1 },
    { source: 'p2', target: 'b', kind: 'post-project', weight: 1 },
    { source: 'a', target: 'b', kind: 'related', weight: 1 },
    { source: 'a', target: 'c', kind: 'related', weight: 1 },
    { source: 'b', target: 'c', kind: 'shared-tag', weight: 2 }
  ]
};
const open = (...ids: string[]) => new Set(ids);

test('layout is deterministic and keeps every node inside the canvas', () => {
  const model = buildModel(graph);
  const lane = lanesOf(model).find((l) => l.name === 'Systems')!;
  const one = layoutLane(lane.projects, model, { open: open('b'), showShared: true });
  const two = layoutLane(
    lanesOf(buildModel(structuredClone(graph))).find((l) => l.name === 'Systems')!.projects,
    buildModel(structuredClone(graph)),
    { open: open('b'), showShared: true }
  );
  assert.deepEqual(one, two);
  for (const chip of one.chips) assert.ok(chip.x >= 0 && chip.x + CHIP_W <= one.width);
  for (const pad of one.pads) assert.ok(pad.y < one.height && pad.x < one.width);
});

test('projects group into category lanes and posts appear only while a project is open', () => {
  const model = buildModel(graph);
  assert.deepEqual(
    lanesOf(model).map((l) => [l.name, l.projects.map((p) => p.id)]),
    [
      ['Graphics', ['a']],
      ['Systems', ['b', 'c']]
    ]
  );
  const graphics = lanesOf(model)[0].projects;
  assert.equal(layoutLane(graphics, model, { open: open() }).pads.length, 0, 'collapsed');
  const expanded = layoutLane(graphics, model, { open: open('a') });
  assert.deepEqual(
    expanded.pads.map((p) => p.node.id),
    ['p2', 'p1'],
    'oldest first, reading down as a timeline'
  );
  const toggle = expanded.toggles[0];
  assert.equal(toggle.count, 2);
  assert.equal(toggle.open, true);
  assert.ok(
    layoutLane(graphics, model, { open: open() }).height < expanded.height,
    'opening grows the lane downwards only'
  );
});

test('posts without a project are standalone and listed in the outline model', () => {
  const model = buildModel(graph);
  assert.deepEqual(
    model.standalone.map((p) => p.id),
    ['lone']
  );
  assert.equal(model.unlinked, 1);
});

test('related links route inside a row and never reuse a terminal', () => {
  const model = buildModel(graph);
  const lane = lanesOf(model).find((l) => l.name === 'Systems')!;
  const layout = layoutLane(lane.projects, model, { open: open() });
  // b-c is shared only; with shared hidden nothing links b and c in this lane.
  assert.equal(layout.traces.filter((t) => t.kind !== 'stem').length, 0);
  const shared = layoutLane(lane.projects, model, { open: open(), showShared: true });
  assert.equal(shared.traces.filter((t) => t.kind === 'shared-tag').length, 1);
  const seen = new Set<string>();
  for (const trace of shared.traces)
    for (const [x, y] of trace.terminals) {
      const key = `${x},${y}`;
      assert.ok(!seen.has(key), `terminal ${key} reused`);
      seen.add(key);
    }
});

test('filters narrow lanes by title, technology and category', () => {
  const model = buildModel(graph);
  const ids = (filter: Partial<{ q: string; tag: string; category: string }>) =>
    lanesOf(model, { q: '', tag: '', category: '', ...filter }).flatMap((l) =>
      l.projects.map((p) => p.id)
    );
  assert.deepEqual(ids({ tag: 'RUST' }), ['a', 'b']);
  assert.deepEqual(ids({ category: 'systems' }), ['b', 'c']);
  assert.deepEqual(ids({ q: 'dsp' }), ['b'], 'search also reads technologies');
  assert.deepEqual(ids({ q: 'zzz' }), []);
});

test('neighbourhood lights a node and its direct links only', () => {
  const model = buildModel(graph);
  assert.deepEqual([...neighbourhood(model, 'p1')].sort(), ['a', 'p1']);
  assert.deepEqual([...neighbourhood(model, 'a')].sort(), ['a', 'b', 'c', 'p1', 'p2']);
});

// A summary the size of a very large site: projects only, plus related links.
function summary(projects: number, categories: number): Graph {
  const nodes: GraphNode[] = [];
  const edges: Graph['edges'] = [];
  for (let i = 0; i < projects; i++) {
    nodes.push(
      node(`p${i}`, 'project', {
        category: `Category ${i % categories}`,
        title: `Project ${String(i).padStart(4, '0')}`,
        tags: [`tag-${i % 40}`],
        post_count: 5
      })
    );
    edges.push({ source: `p${i}`, target: `p${(i + 1) % projects}`, kind: 'related', weight: 1 });
  }
  return {
    mode: 'summary',
    nodes,
    edges,
    totals: { projects, posts: projects * 5 },
    unlinked_posts: 3
  };
}

test('lane width stays bounded at 1000 projects and paging bounds the drawing', () => {
  const model = buildModel(summary(1000, 6));
  assert.equal(model.mode, 'summary');
  assert.equal(model.unlinked, 3);
  const lanes = lanesOf(model);
  assert.equal(lanes.length, 6);
  for (const lane of lanes) {
    const layout = layoutLane(lane.projects, model, { open: open() });
    assert.ok(layout.width <= 1200, `width ${layout.width}`);
    assert.equal(layout.chips.length, LANE_PAGE, 'only one page is laid out');
    assert.ok(layout.toggles.every((t) => t.count === 5 && !t.open));
  }
  const all = layoutLane(lanes[0].projects, model, { open: open(), limit: 1000 });
  assert.ok(all.width <= 1200);
  assert.equal(all.chips.length, lanes[0].projects.length);
});

test('expanding a summary project lists a capped page of posts with the remainder counted', () => {
  const base = summary(10, 2);
  const posts = Array.from({ length: 30 }, (_, i) =>
    node(`n${i}`, 'post', {
      published_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`
    })
  );
  const expanded: Graph = {
    mode: 'project',
    project: 'p3',
    posts_total: 30,
    nodes: [base.nodes[3], ...posts],
    edges: posts.map((p) => ({
      source: p.id,
      target: 'p3',
      kind: 'post-project' as const,
      weight: 1
    }))
  };
  const model = buildModel(base, [expanded]);
  const lane = lanesOf(model).find((l) => l.projects.some((p) => p.id === 'p3'))!;
  const layout = layoutLane(lane.projects, model, { open: open('p3') });
  assert.equal(layout.pads.length, POSTS_SHOWN);
  assert.equal(layout.mores[0].count, 30 - POSTS_SHOWN);
  const closed = layoutLane(lane.projects, model, { open: open() });
  assert.equal(closed.pads.length, 0);
  assert.equal(closed.toggles.find((t) => t.id === 'p3')!.count, 30);
});

test('the text outline groups by category and uses adjacency, not repeated scans', () => {
  const model = buildModel(summary(1000, 5));
  const started = performance.now();
  const groups = outlineOf(model);
  assert.ok(performance.now() - started < 1000, 'linear time');
  assert.equal(groups.length, 5);
  assert.equal(groups[0].projects.length, 200);
  assert.equal(groups[0].projects[0].related.length, 2, 'both neighbours in the ring');
});

test('the open list is validated, capped and toggled', () => {
  assert.deepEqual(parseOpen('a-b,,A_B,a-b, c ,../x'), ['a-b', 'c']);
  assert.equal(parseOpen(Array.from({ length: 20 }, (_, i) => `p${i}`).join(',')).length, MAX_OPEN);
  assert.deepEqual(toggleOpen(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleOpen(['a'], 'b'), ['a', 'b']);
  const full = Array.from({ length: MAX_OPEN }, (_, i) => `p${i}`);
  const next = toggleOpen(full, 'new');
  assert.equal(next.length, MAX_OPEN);
  assert.equal(next.at(-1), 'new');
  assert.ok(!next.includes('p0'), 'the oldest entry drops out');
});

test('text helpers wrap and truncate without breaking words mid-line', () => {
  assert.deepEqual(wrap('Voidreg Design Engineering', 19, 2), ['Voidreg Design', 'Engineering']);
  assert.equal(
    wrap('A very long project title that keeps going and going', 12, 2).at(-1)?.endsWith('\u2026'),
    true
  );
  assert.equal(wrap('Supercalifragilisticexpialidocious', 12, 2)[0].length, 12);
  assert.equal(truncate('short', 20), 'short');
  assert.equal(truncate('x'.repeat(30), 20).length, 20);
});
