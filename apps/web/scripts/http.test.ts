import assert from 'node:assert/strict';
import test from 'node:test';
import { textResponse } from '../src/lib/server/http.ts';

const ask = (headers: Record<string, string> = {}) =>
  new Request('https://example.test/rss.xml', { headers });

test('serves the body with a validator and cache headers', async () => {
  const response = textResponse(ask(), '<rss/>', 'application/rss+xml', {
    lastModified: '2026-11-07T01:31:44Z'
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<rss/>');
  assert.match(response.headers.get('etag') ?? '', /^"[\w-]+"$/);
  assert.match(response.headers.get('cache-control') ?? '', /max-age=900/);
  assert.equal(response.headers.get('last-modified'), 'Sat, 07 Nov 2026 01:31:44 GMT');
});

test('answers a matching If-None-Match with 304 and no body', async () => {
  const first = textResponse(ask(), 'same', 'text/plain');
  const etag = first.headers.get('etag') ?? '';
  for (const sent of [etag, 'W/' + etag, '"other", ' + etag, '*']) {
    const again = textResponse(ask({ 'if-none-match': sent }), 'same', 'text/plain');
    assert.equal(again.status, 304, sent);
    assert.equal(await again.text(), '');
    assert.equal(again.headers.get('etag'), etag);
  }
});

test('a changed document is sent in full', async () => {
  const etag = textResponse(ask(), 'before', 'text/plain').headers.get('etag') ?? '';
  const after = textResponse(ask({ 'if-none-match': etag }), 'after', 'text/plain');
  assert.equal(after.status, 200);
  assert.equal(await after.text(), 'after');
});
