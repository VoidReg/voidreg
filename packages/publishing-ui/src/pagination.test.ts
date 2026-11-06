import assert from 'node:assert/strict';
import test from 'node:test';
import { pageCount, pageWindow } from './pagination.ts';

test('short lists show every page and no jumps', () => {
  const w = pageWindow(2, 3);
  assert.deepEqual(w.pages, [1, 2, 3]);
  assert.equal(w.showFirst || w.showLast, false);
  assert.deepEqual(pageWindow(1, 1).pages, [1]);
});

test('the window centres on the current page', () => {
  const w = pageWindow(10, 20);
  assert.deepEqual(w.pages, [8, 9, 10, 11, 12]);
  assert.deepEqual([w.showFirst, w.showLast, w.gapBefore, w.gapAfter], [true, true, true, true]);
});

test('the window stays full at both ends', () => {
  assert.deepEqual(pageWindow(1, 20).pages, [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(2, 20).pages, [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(20, 20).pages, [16, 17, 18, 19, 20]);
  assert.equal(pageWindow(1, 20).showFirst, false);
  assert.equal(pageWindow(20, 20).showLast, false);
});

test('a gap only appears when pages are actually hidden', () => {
  const w = pageWindow(4, 8);
  assert.deepEqual(w.pages, [2, 3, 4, 5, 6]);
  assert.equal(w.showFirst, true);
  assert.equal(w.gapBefore, false, 'page 1 is adjacent to the window');
  assert.equal(w.gapAfter, true);
});

test('out of range input is clamped', () => {
  assert.equal(pageWindow(99, 4).current, 4);
  assert.equal(pageWindow(-3, 4).current, 1);
  assert.equal(pageWindow(Number.NaN, 4).current, 1);
  assert.equal(pageWindow(1, 0).total, 1);
});

test('page counts round up and never drop below one', () => {
  assert.equal(pageCount(0, 20), 1);
  assert.equal(pageCount(41, 20), 3);
  assert.equal(pageCount(40, 20), 2);
});
