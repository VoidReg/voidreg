import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePagination, pageNumber } from '../src/lib/server/content.ts';

const url = (query: string) => new URL('https://example.test/blog' + query);
const result = { page: 1, per_page: 10, total: 95 };

function redirectOf(run: () => void): { status: number; location: string } | null {
  try {
    run();
  } catch (thrown) {
    const value = thrown as { status?: number; location?: string };
    if (typeof value.status === 'number' && value.location)
      return { status: value.status, location: value.location };
    throw thrown;
  }
  return null;
}

test('page numbers are positive integers and default to one', () => {
  assert.equal(pageNumber(url('')), 1);
  assert.equal(pageNumber(url('?page=4')), 4);
  assert.equal(pageNumber(url('?page=0')), 1);
  assert.equal(pageNumber(url('?page=-3')), 1);
  assert.equal(pageNumber(url('?page=abc')), 1);
  assert.equal(pageNumber(url('?page=2.5')), 1);
});

test('a valid page is left alone', () => {
  assert.equal(
    redirectOf(() => normalizePagination(url('?page=3'), result)),
    null
  );
  assert.equal(
    redirectOf(() => normalizePagination(url('?page=10'), result)),
    null
  );
  assert.equal(
    redirectOf(() => normalizePagination(url(''), result)),
    null
  );
});

test('page one never carries a page parameter', () => {
  const moved = redirectOf(() => normalizePagination(url('?q=a&page=1'), result));
  assert.deepEqual(moved, { status: 307, location: '/blog?q=a' });
});

test('an out-of-range page moves to the last page', () => {
  const moved = redirectOf(() => normalizePagination(url('?page=99'), result));
  assert.deepEqual(moved, { status: 307, location: '/blog?page=10' });
});

test('an empty list resolves to page one', () => {
  const moved = redirectOf(() =>
    normalizePagination(url('?page=4'), { page: 1, per_page: 10, total: 0 })
  );
  assert.deepEqual(moved, { status: 307, location: '/blog' });
});
