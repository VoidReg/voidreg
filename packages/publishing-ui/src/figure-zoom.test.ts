import assert from 'node:assert/strict';
import test from 'node:test';
import { nextView } from './figure-zoom.ts';

test('zooming keeps the point under the pointer and recenters when fitted', () => {
  const zoomed = nextView({ scale: 1, x: 0, y: 0 }, 2, 100, 40);
  assert.deepEqual(zoomed, { scale: 2, x: -100, y: -40 });
  assert.deepEqual(nextView(zoomed, 0.5, 100, 40), { scale: 1, x: 0, y: 0 });
});

test('zoom stays within the fitted size and the closest view', () => {
  assert.deepEqual(nextView({ scale: 1, x: 12, y: 4 }, 0.2, 30, 10), { scale: 1, x: 0, y: 0 });
  assert.equal(nextView({ scale: 5, x: 0, y: 0 }, 4, 0, 0).scale, 6);
  assert.deepEqual(nextView({ scale: 2, x: 1, y: 1 }, Number.NaN, 0, 0), { scale: 2, x: 1, y: 1 });
});
