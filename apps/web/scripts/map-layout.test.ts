import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHIP_W,
  STANDALONE_ID,
  layoutGraph,
  neighbourhood,
  outlineOf,
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
    node('a', 'project', { category: 'Graphics' }),
    node('b', 'project'),
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

test('layout is deterministic and keeps every node inside the canvas', () => {
  const one = layoutGraph(graph);
  const two = layoutGraph(structuredClone(graph));
  assert.deepEqual(one, two);
  for (const chip of one.chips) assert.ok(chip.x >= 0 && chip.x + CHIP_W <= one.width);
  for (const pad of one.pads) assert.ok(pad.y < one.height && pad.x < one.width);
});

test('projects are grouped by category and posts sit under every project they follow', () => {
  const layout = layoutGraph(graph);
  assert.deepEqual(
    layout.chips.filter((c) => c.node).map((c) => c.id),
    ['a', 'b', 'c'],
    'Graphics sorts before Systems'
  );
  const under = (id: string) => layout.pads.filter((p) => p.projectId === id).map((p) => p.node.id);
  assert.deepEqual(under('a'), ['p2', 'p1'], 'oldest first, reading down as a timeline');
  assert.deepEqual(under('b'), ['p2'], 'a post follows both of its projects');
});

test('posts without a project get a standalone lane', () => {
  const layout = layoutGraph(graph);
  assert.ok(layout.hasStandalone);
  assert.ok(layout.chips.some((c) => c.id === STANDALONE_ID));
  assert.deepEqual(
    layout.pads.filter((p) => p.projectId === null).map((p) => p.node.id),
    ['lone']
  );
  assert.equal(outlineOf(graph).standalone[0].id, 'lone');
});

test('chip-to-chip links never share a tier when their spans overlap', () => {
  const layout = layoutGraph(graph);
  assert.equal(layout.traces.filter((t) => t.kind !== 'stem').length, 3);
  // Terminals of different links on one chip must not coincide.
  const seen = new Set<string>();
  for (const trace of layout.traces) {
    for (const [x, y] of trace.terminals) {
      const key = `${x},${y}`;
      assert.ok(!seen.has(key), `terminal ${key} reused`);
      seen.add(key);
    }
  }
});

test('dense graphs stay bounded', () => {
  const nodes: GraphNode[] = [];
  const edges: Graph['edges'] = [];
  for (let i = 0; i < 12; i++) nodes.push(node(`p${i}`, 'project', { category: `C${i % 3}` }));
  for (let i = 0; i < 40; i++) {
    nodes.push(
      node(`n${i}`, 'post', {
        published_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`
      })
    );
    edges.push({ source: `n${i}`, target: `p${i % 12}`, kind: 'post-project', weight: 1 });
  }
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      edges.push({ source: `p${i}`, target: `p${j}`, kind: 'shared-tag', weight: 1 });
  const layout = layoutGraph({ nodes, edges });
  assert.equal(layout.traces.filter((t) => t.kind === 'shared-tag').length, 24);
  assert.ok(layout.height < 900, `height ${layout.height}`);
});

test('neighbourhood lights a node and its direct links only', () => {
  assert.deepEqual([...neighbourhood(graph, 'p1')].sort(), ['a', 'p1']);
  assert.deepEqual([...neighbourhood(graph, 'a')].sort(), ['a', 'b', 'c', 'p1', 'p2']);
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
