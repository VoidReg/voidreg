import assert from 'node:assert/strict';
import test from 'node:test';
import { StaleCache, TtlCache } from '../src/lib/ttl-cache.ts';

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

test('a stale document is served at once while one refresh rebuilds it', async () => {
  let clock = 0;
  const cache = new StaleCache<number>(1000, 10_000, 4, () => clock);
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const load = async () => {
    const n = ++calls;
    if (n > 1) await gate;
    return n;
  };
  assert.equal(await cache.get('k', load), 1);
  clock = 1500;
  assert.equal(await cache.get('k', load), 1);
  assert.equal(await cache.get('k', load), 1);
  assert.equal(calls, 2, 'only one refresh starts');
  release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await cache.get('k', load), 2);
});

test('a failed refresh keeps the old document and tries again later', async () => {
  let clock = 0;
  const cache = new StaleCache<number>(1000, 10_000, 4, () => clock);
  let fail = false;
  let calls = 0;
  const load = async () => {
    calls++;
    if (fail) throw new Error('down');
    return calls;
  };
  assert.equal(await cache.get('k', load), 1);
  fail = true;
  clock = 2000;
  assert.equal(await cache.get('k', load), 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  fail = false;
  assert.equal(await cache.get('k', load), 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await cache.get('k', load), 3);
});

test('past the stale window the next request waits for a rebuild, shared by all callers', async () => {
  let clock = 0;
  const cache = new StaleCache<number>(1000, 1000, 4, () => clock);
  let calls = 0;
  const load = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return ++calls;
  };
  await cache.get('k', load);
  clock = 5000;
  const values = await Promise.all([cache.get('k', load), cache.get('k', load)]);
  assert.deepEqual(values, [2, 2]);
});
