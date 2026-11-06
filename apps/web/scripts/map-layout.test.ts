import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_OPEN,
  buildModel,
  groupPosts,
  lanesOf,
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
test('projects group into category lanes', () => {
  const model = buildModel(graph);
  assert.deepEqual(
    lanesOf(model).map((l) => [l.name, l.projects.map((p) => p.id)]),
    [
      ['Graphics', ['a']],
      ['Systems', ['b', 'c']]
    ]
  );
  assert.deepEqual(
    model.postsOf.get('a')!.items.map((p) => p.id),
    ['p2', 'p1'],
    'oldest first, reading down as a timeline'
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

test('panel posts group by topic, then other posts, and stay capped', () => {
  const post = (id: string, topic?: string) => node(id, 'post', { topic_id: topic ?? null });
  const posts = [
    post('a', 't1'),
    post('b', 't1'),
    post('c', 't1'),
    post('d', 't1'),
    post('e', 't2'),
    post('f'),
    post('g', 'gone')
  ];
  const topics = [
    { id: 't1', slug: 'one', title: 'One', post_count: 4 },
    { id: 't2', slug: 'two', title: 'Two', post_count: 1 },
    { id: 't3', slug: 'three', title: 'Three', post_count: 0 }
  ];
  const groups = groupPosts(posts, topics);
  assert.deepEqual(
    groups.map((g) => [g.title, g.total, g.items.map((i) => i.id).join('')]),
    [
      ['One', 4, 'abc'],
      ['Two', 1, 'e'],
      ['Other posts', 2, 'fg']
    ]
  );
  assert.equal(groupPosts(posts, topics, 3, 4).flatMap((g) => g.items).length, 4);
  assert.deepEqual(groupPosts(posts, []), [], 'no topics means the flat list');
  assert.deepEqual(groupPosts(posts, undefined), []);
});
