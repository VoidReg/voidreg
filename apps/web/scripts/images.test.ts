import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeArticleHtml, optimizedMediaUrl, originalMediaPaths } from '../src/lib/images.ts';

const LIGHT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DARK = 'ffffffff-1111-4222-8333-444444444444';
const STILL = '01067c85-495c-427c-9fe8-a9a00b2e814a';
const HASH = 'a'.repeat(64);

const html = [
  `<figure class="publisle-figure-themed"><img src="/media/${LIGHT}.png" alt="chart"><img src="/media/${DARK}.png" alt="" data-publisle-variant="dark"></figure>`,
  `<figure><img src="/media/${STILL}.png" alt="still"></figure>`,
  `<img class="diagram-light" src="/media/diagrams/${HASH}-light.png" alt="d">`,
  `<img class="diagram-dark" src="/media/diagrams/${HASH}-dark.png" alt="">`,
  `<a href="/media/diagrams/${HASH}-light.png">open</a>`
].join('');

test('library and diagram images point at the compact rendition', () => {
  assert.equal(optimizedMediaUrl(`/media/${LIGHT}.png`), `/img/v1/${LIGHT}.webp`);
  assert.equal(optimizedMediaUrl(`/media/${LIGHT}.jpg`), `/img/v1/${LIGHT}.webp`);
  assert.equal(
    optimizedMediaUrl(`https://www.voidreg.xyz/media/diagrams/${HASH}-dark.png`),
    `https://www.voidreg.xyz/img/v1/diagrams/${HASH}-dark.webp`
  );
  assert.equal(
    optimizedMediaUrl('https://example.com/media/' + LIGHT + '.png'),
    'https://example.com/media/' + LIGHT + '.png'
  );
  assert.equal(optimizedMediaUrl('/og-default.png'), '/og-default.png');
});

test('the compact name maps back to the stored file', () => {
  assert.deepEqual(originalMediaPaths(`${LIGHT}.webp`), [
    `/media/${LIGHT}.png`,
    `/media/${LIGHT}.jpg`
  ]);
  assert.deepEqual(originalMediaPaths(`diagrams/${HASH}-light.webp`), [
    `/media/diagrams/${HASH}-light.png`
  ]);
  assert.equal(originalMediaPaths('../etc/passwd'), null);
  assert.equal(originalMediaPaths(`${LIGHT}.png`), null);
});

test('a known theme keeps the hidden variant out of the download', () => {
  const light = optimizeArticleHtml(html, 'light');
  assert.match(light, new RegExp(` src="/img/v1/${LIGHT}.webp"`));
  assert.match(light, new RegExp(` data-src="/img/v1/${DARK}.webp"`));
  assert.doesNotMatch(light, new RegExp(` src="/img/v1/${DARK}.webp"`));
  assert.match(light, new RegExp(`src="/img/v1/${STILL}.webp"`));
  assert.match(light, new RegExp(`src="/img/v1/diagrams/${HASH}-light.webp"`));
  assert.match(light, new RegExp(`data-src="/img/v1/diagrams/${HASH}-dark.webp"`));
  assert.match(light, new RegExp(`href="/img/v1/diagrams/${HASH}-light.webp"`));

  const dark = optimizeArticleHtml(html, 'dark');
  assert.match(dark, new RegExp(` data-src="/img/v1/${LIGHT}.webp"`));
  assert.match(dark, new RegExp(` src="/img/v1/${DARK}.webp"`));
  assert.doesNotMatch(dark, new RegExp(` src="/img/v1/${LIGHT}.webp"`));
  assert.match(dark, new RegExp(`src="/img/v1/${STILL}.webp"`));
  assert.match(dark, new RegExp(`data-src="/img/v1/diagrams/${HASH}-light.webp"`));
  assert.match(dark, new RegExp(`src="/img/v1/diagrams/${HASH}-dark.webp"`));
});

test('an unknown theme still downloads both variants, through the compact address', () => {
  const either = optimizeArticleHtml(html, null);
  assert.doesNotMatch(either, /data-src=/);
  assert.match(either, new RegExp(`src="/img/v1/${LIGHT}.webp"`));
  assert.match(either, new RegExp(`src="/img/v1/${DARK}.webp"`));
});
