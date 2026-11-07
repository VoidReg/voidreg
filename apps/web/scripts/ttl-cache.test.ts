import assert from 'node:assert/strict';
import test from 'node:test';
import { TtlCache } from '../src/lib/ttl-cache.ts';

test('serves repeated lookups from memory until the entry expires', async () => {
  let clock = 0;
  const cache = new TtlCache<number>(1000, 8, () => clock);
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cache.get('a', load), 1);
  assert.equal(await cache.get('a', load), 1);
  clock = 999;
  assert.equal(await cache.get('a', load), 1);
  clock = 1001;
  assert.equal(await cache.get('a', load), 2);
});

test('concurrent requests share one fetch', async () => {
  const cache = new TtlCache<number>(1000);
  let calls = 0;
  const load = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return 7;
  };
  const values = await Promise.all([
    cache.get('k', load),
    cache.get('k', load),
    cache.get('k', load)
  ]);
  assert.deepEqual(values, [7, 7, 7]);
  assert.equal(calls, 1);
});

test('failures are not cached', async () => {
  const cache = new TtlCache<number>(1000);
  await assert.rejects(cache.get('k', () => Promise.reject(new Error('down'))));
  assert.equal(await cache.get('k', async () => 3), 3);
});

test('keeps the number of entries bounded', async () => {
  const cache = new TtlCache<number>(1000, 2);
  let calls = 0;
  const load = async () => ++calls;
  await cache.get('a', load);
  await cache.get('b', load);
  await cache.get('c', load);
  await cache.get('a', load);
  assert.equal(calls, 4);
});
