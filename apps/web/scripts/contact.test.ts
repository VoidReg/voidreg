import assert from 'node:assert/strict';
import test from 'node:test';
import { issueFormToken, submitContact } from '../src/lib/server/contact.ts';

const env = { VOIDREG_API_URL: 'http://api.test', CONTACT_FORWARD_TOKEN: 'fwd' };
const submission = {
  name: 'Ada',
  email: 'a@b.co',
  message: 'Hello there',
  form_token: 't',
  website: ''
};
type Call = { url: string; init: RequestInit };
function fake(status: number, body: unknown, calls: Call[] = []) {
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

test('stays closed without a forward token and never calls the API', async () => {
  const { fetcher, calls } = fake(200, { token: 'x' });
  assert.equal(await issueFormToken(fetcher, {}), null);
  assert.equal((await submitContact(fetcher, submission, '1.2.3.4', {})).ok, false);
  assert.equal(calls.length, 0);
});

test('issues a token with the forward header', async () => {
  const { fetcher, calls } = fake(200, { token: 'abc' });
  assert.equal(await issueFormToken(fetcher, env), 'abc');
  assert.equal(calls[0].url, 'http://api.test/api/v1/contact/form');
  assert.deepEqual(calls[0].init.headers, { 'X-Contact-Forward': 'fwd' });
  assert.equal(await issueFormToken(fake(404, {}).fetcher, env), null);
});

test('forwards the visitor address and surfaces only safe messages', async () => {
  const ok = fake(200, { status: 'received' });
  assert.deepEqual(await submitContact(ok.fetcher, submission, '203.0.113.9', env), { ok: true });
  const headers = ok.calls[0].init.headers as Record<string, string>;
  assert.equal(headers['X-Contact-Client'], '203.0.113.9');
  assert.equal(headers['X-Contact-Forward'], 'fwd');

  const invalid = fake(422, {
    error: { code: 'unprocessable', message: 'Enter a valid email address.' }
  });
  assert.deepEqual(await submitContact(invalid.fetcher, submission, '1.1.1.1', env), {
    ok: false,
    message: 'Enter a valid email address.'
  });
  const broken = fake(500, { error: { code: 'internal', message: 'database exploded: secret' } });
  const result = await submitContact(broken.fetcher, submission, '1.1.1.1', env);
  assert.equal(result.ok, false);
  assert.ok(!('message' in result) || !result.message.includes('secret'));
});
