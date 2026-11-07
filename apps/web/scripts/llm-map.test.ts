import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TextStore,
  allocate,
  indexDocument,
  interleave,
  projectIndex,
  regions,
  type MapPost
} from '../src/lib/server/llm-map.ts';

const post = (slug: string, project: string | null, day: number, extra: Partial<MapPost> = {}) =>
  ({
    slug,
    title: 'Post ' + slug,
    summary: 'About ' + slug,
    published_at: new Date(Date.UTC(2026, 0, day)).toISOString(),
    projects: project ? [{ slug: project, title: 'Project ' + project }] : [],
    ...extra
  }) as MapPost;

test('allocate never exceeds the budget or a group, and keeps small groups visible', () => {
  for (const [sizes, budget] of [
    [[500, 3, 40, 1, 0], 60],
    [[10, 10, 10], 100],
    [[1000, 1000], 7],
    [[], 10],
    [[5, 5], 0]
  ] as [number[], number][]) {
    const slots = allocate(sizes, budget);
    assert(slots.reduce((a, b) => a + b, 0) <= budget);
    slots.forEach((n, i) => assert(n <= sizes[i]));
  }
  const slots = allocate([500, 3, 40, 1], 60);
  assert.equal(slots[1], 3, 'a small group is listed whole');
  assert.equal(slots[3], 1);
  assert(slots[0] > slots[2], 'a larger group gets more room');
  assert(slots[0] < 500 / 5, 'but not room in proportion to its size');
});

test('allocate hands unused room to the groups that can use it', () => {
  assert.deepEqual(allocate([2, 2, 100], 50), [2, 2, 46]);
  assert.equal(allocate([30, 30], 60).join(), '30,30');
});

test('a tight budget serves the smallest groups first', () => {
  const slots = allocate([100, 1, 1, 1], 4, 2);
  assert.deepEqual(slots.slice(1), [1, 1, 1]);
  assert.equal(slots[0], 1);
});

test('posts are filed once under their first project, newest first', () => {
  const posts = [
    post('a1', 'a', 1),
    post('a2', 'a', 3),
    post('b1', 'b', 2, {
      projects: [
        { slug: 'b', title: 'B' },
        { slug: 'a', title: 'A' }
      ]
    }),
    post('x', null, 4)
  ];
  const groups = regions(posts, [{ slug: 'a', title: 'Alpha' }]);
  assert.deepEqual(groups.map((g) => g.slug).sort(), ['a', 'b', 'other']);
  const alpha = groups.find((g) => g.slug === 'a')!;
  assert.equal(alpha.title, 'Alpha');
  assert.deepEqual(
    alpha.posts.map((p) => p.slug),
    ['a2', 'a1']
  );
  assert.equal(groups.flatMap((g) => g.posts).length, 4);
});

test('the reading order shows every project before any shows a second post', () => {
  const posts = [
    ...Array.from({ length: 6 }, (_, i) => post('big' + i, 'big', 10 + i)),
    post('s1', 'small', 1),
    post('t1', 'tiny', 2)
  ];
  const order = interleave(regions(posts, [])).map((p) => p.slug);
  const firstThree = order.slice(0, 3);
  assert(firstThree.includes('s1') && firstThree.includes('t1') && firstThree.includes('big5'));
  assert.equal(new Set(order).size, posts.length);
});

test('featured posts lead the reading order', () => {
  const posts = [
    post('old', 'a', 1, { featured: true }),
    post('new', 'a', 9),
    post('other', 'b', 5)
  ];
  assert.equal(interleave(regions(posts, []))[0].slug, 'old');
});

test('the index is a map with per-project pointers, and never repeats a post', () => {
  const posts = [
    ...Array.from({ length: 80 }, (_, i) => post('big' + i, 'big', 1 + (i % 28))),
    post('lone', 'small', 1),
    post('free', null, 2)
  ];
  const doc = indexDocument({
    description: 'A site',
    projects: [
      { slug: 'big', title: 'Big', summary: 'Large one', post_count: 80 },
      { slug: 'small', title: 'Small', summary: 'Tiny one', post_count: 1 }
    ],
    posts,
    totals: { projects: 2, posts: 500 },
    budget: 30
  });
  assert(doc.startsWith('# Voidreg'));
  assert(doc.includes('[Big](https://www.voidreg.xyz/projects/big.md): Large one (80 posts)'));
  assert(doc.includes('https://www.voidreg.xyz/llms/big.txt'));
  assert(doc.includes('https://www.voidreg.xyz/blog/lone.md'), 'the small project is listed');
  assert(doc.includes('https://www.voidreg.xyz/blog/free.md'), 'unfiled posts are listed');
  assert(doc.includes('more in Big'));
  assert(doc.includes('newest 82 of 500 posts'));
  const links = doc.match(/\/blog\/[\w-]+\.md/g) ?? [];
  assert.equal(new Set(links).size, links.length, 'no post is listed twice');
  assert(links.length <= 30 + 1, 'the budget bounds the listing');
  assert(doc.includes('https://www.voidreg.xyz/mcp'));
  assert(!doc.includes('\u2014'));
});

test('an empty site still produces a valid index', () => {
  const doc = indexDocument({
    description: 'A site',
    projects: [],
    posts: [],
    totals: { projects: 0, posts: 0 }
  });
  assert(doc.includes('No posts are published yet.'));
  assert(doc.includes('No projects are published yet.'));
});

test('a project index groups posts by topic and says when it is cut short', () => {
  const posts = [
    post('p1', 'a', 5, { topic: { slug: 't1', title: 'Basics' } }),
    post('p2', 'a', 6, { topic: { slug: 't1', title: 'Basics' } }),
    post('p3', 'a', 7)
  ];
  const doc = projectIndex({ slug: 'a', title: 'Alpha', summary: 'Alpha project' }, posts, 9);
  assert(doc.startsWith('# Alpha'));
  assert(doc.includes('## Basics'));
  assert(doc.includes('## Other posts'));
  assert(doc.includes('llms/a-full.txt'));
  assert(doc.includes('Showing the newest 3 of 9 posts.'));
});

test('unchanged posts are not read again, and an edited post replaces its old text', async () => {
  const store = new TextStore();
  let reads = 0;
  const load = (text: string) => async () => {
    reads++;
    return text;
  };
  assert.equal(await store.get({ slug: 'a', content_hash: 'h1' }, load('one')), 'one');
  assert.equal(await store.get({ slug: 'a', content_hash: 'h1' }, load('again')), 'one');
  assert.equal(reads, 1);
  assert.equal(await store.get({ slug: 'a', content_hash: 'h2' }, load('two')), 'two');
  assert.equal(store.size, 1, 'the old version is dropped');
});

test('the store stays within its size, dropping the least recently used', async () => {
  const store = new TextStore(10);
  await store.get({ slug: 'a', content_hash: '1' }, async () => 'aaaa');
  await store.get({ slug: 'b', content_hash: '1' }, async () => 'bbbb');
  await store.get({ slug: 'a', content_hash: '1' }, async () => 'unused');
  await store.get({ slug: 'c', content_hash: '1' }, async () => 'cccc');
  let rereadA = false;
  await store.get({ slug: 'a', content_hash: '1' }, async () => ((rereadA = true), 'aaaa'));
  assert.equal(rereadA, false, 'a was used recently and kept');
  let rereadB = false;
  await store.get({ slug: 'b', content_hash: '1' }, async () => ((rereadB = true), 'bbbb'));
  assert.equal(rereadB, true, 'b was the least recently used');
});
