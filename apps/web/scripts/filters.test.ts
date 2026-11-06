import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiQuery,
  capChips,
  filterChips,
  filterHref,
  isCanonical,
  parseFilters,
  resolveSlug
} from '../src/lib/filters.ts';

const parse = (query: string) => parseFilters(new URLSearchParams(query));

test('parsing trims, collapses whitespace and bounds every value', () => {
  const f = parse('q=%20%20hello%20%20world%20&project=a&tag=' + 'x'.repeat(100) + '&page=3');
  assert.equal(f.q, 'hello world');
  assert.equal(f.project, 'a');
  assert.equal(f.tag.length, 40);
  assert.equal(f.page, 3);
  assert.equal(parse('page=-4').page, 1);
  assert.equal(parse('page=abc').page, 1);
});

test('canonical URLs drop empty values, page one and orphaned topics', () => {
  assert.equal(filterHref('/blog', parse('q=&project=&tag=&page=1')), '/blog');
  assert.equal(
    filterHref('/blog', { q: 'a b', project: 'alpha', topic: 'fw', tag: 'Rust', page: 2 }),
    '/blog?q=a%20b&project=alpha&topic=fw&tag=Rust&page=2'
  );
  assert.equal(filterHref('/blog', { topic: 'fw' }), '/blog', 'a topic needs a project');
});

test('the API query only forwards topics together with a project', () => {
  assert.equal(
    apiQuery(parse('project=alpha&topic=fw&tag=Rust')),
    'page=1&project=alpha&topic=fw&tag=Rust'
  );
  assert.equal(apiQuery(parse('topic=fw')), 'page=1');
  assert.equal(apiQuery(parse('q=a+b&page=2')), 'page=2&q=a%20b');
});

test('each active filter gets a chip that removes only itself', () => {
  const f = parse('q=csi&project=alpha&topic=fw&tag=Rust&page=4');
  const chips = filterChips('/blog', f, { project: 'Alpha', topic: 'Firmware' });
  assert.deepEqual(
    chips.map((c) => [c.label, c.value]),
    [
      ['Search', 'csi'],
      ['Project', 'Alpha'],
      ['Topic', 'Firmware'],
      ['Tag', 'Rust']
    ]
  );
  assert.equal(chips[0].href, '/blog?project=alpha&topic=fw&tag=Rust');
  assert.equal(chips[1].href, '/blog?q=csi&tag=Rust', 'removing a project removes its topic');
  assert.equal(chips[2].href, '/blog?q=csi&project=alpha&tag=Rust');
  assert.equal(chips[3].href, '/blog?q=csi&project=alpha&topic=fw');
  assert.deepEqual(filterChips('/blog', parse('')), []);
  assert.equal(filterChips('/blog', parse('project=a&topic=none'))[1].value, 'Other posts');
});

test('typed project text resolves by slug or exact title only', () => {
  const list = [
    { slug: 'esp32-csi', title: 'ESP32 CSI Radar' },
    { slug: 'void-os', title: 'Void OS' }
  ];
  assert.equal(resolveSlug('void-os', list), 'void-os');
  assert.equal(resolveSlug('  esp32 csi radar ', list), 'esp32-csi');
  assert.equal(resolveSlug('esp32', list), null);
  assert.equal(resolveSlug('', list), null);
});

test('canonical detection ignores percent-encoding differences', () => {
  const href = filterHref('/blog', { q: "it's", project: 'alpha' });
  assert.equal(isCanonical(new URLSearchParams('q=it%27s&project=alpha'), href), true);
  assert.equal(isCanonical(new URLSearchParams("q=it's&project=alpha&topic="), href), false);
  assert.equal(isCanonical(new URLSearchParams('project=alpha&q=it%27s'), href), false);
  assert.equal(isCanonical(new URLSearchParams(''), '/blog'), true);
});

test('capped chip rows keep the active chip visible and list the rest', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(
    capChips(items, 10, () => false),
    { shown: items, rest: [] }
  );
  const capped = capChips(items, 3, (x) => x === 'e');
  assert.deepEqual(capped.shown, ['e', 'a', 'b']);
  assert.deepEqual(capped.rest, ['c', 'd']);
  assert.deepEqual(
    capChips(items, 2, () => false),
    { shown: ['a', 'b'], rest: ['c', 'd', 'e'] }
  );
});
