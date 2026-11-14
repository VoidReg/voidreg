import assert from 'node:assert/strict';
import test from 'node:test';
import { publishedNeighbors } from '../src/lib/post-neighbors.ts';

const posts = [
  { slug: 'newest-draft', status: 'draft' },
  { slug: 'current', status: 'draft' },
  { slug: 'older-draft', status: 'draft' },
  { slug: 'published-one', status: 'published' }
];

test('draft neighbours are left out of previous and next', () => {
  const { newer, older } = publishedNeighbors(posts, 'current');
  assert.equal(newer, null);
  assert.equal(older?.slug, 'published-one');
});

test('a draft with no published posts has no previous or next', () => {
  const drafts = posts.filter((post) => post.status === 'draft');
  assert.deepEqual(publishedNeighbors(drafts, 'current'), { newer: null, older: null });
});
