import assert from 'node:assert/strict';
import test from 'node:test';
import { authErrorMessage, providerLabel, signInUrl } from '../src/lib/session.ts';
import { initial } from '../src/lib/publishing/discussion.ts';

test('provider names read the way the providers spell them', () => {
  assert.equal(providerLabel('github'), 'GitHub');
  assert.equal(providerLabel('google'), 'Google');
  assert.equal(providerLabel('gitlab'), 'gitlab');
});

test('sign-in links carry the return path, and connect links say so', () => {
  assert.equal(
    signInUrl('github', '/blog/a-post#discussion'),
    '/api/v1/auth/github/start?return_to=%2Fblog%2Fa-post%23discussion'
  );
  assert.equal(
    signInUrl('google', '/account', true),
    '/api/v1/auth/google/start?return_to=%2Faccount&link=true'
  );
});

test('auth errors become sentences, unknown codes stay generic, none stays silent', () => {
  assert.match(authErrorMessage('already_linked'), /already belongs to another profile/);
  assert.match(authErrorMessage('sign_in_cancelled'), /cancelled/);
  assert.match(authErrorMessage('surprise'), /did not complete/);
  assert.equal(authErrorMessage(null), '');
  assert.equal(authErrorMessage(''), '');
});

test('avatar fallbacks use the first visible letter', () => {
  assert.equal(initial('  ada lovelace'), 'A');
  assert.equal(initial('Émile'), 'É');
  assert.equal(initial(''), '?');
});
