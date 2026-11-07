import assert from 'node:assert/strict';
import test from 'node:test';
import { age, initial } from '../src/lib/publishing/discussion.ts';

const now = Date.parse('2026-11-07T12:00:00Z');
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

test('age reads as a short relative time and switches to a date after a month', () => {
  assert.equal(age(ago(10), now), 'just now');
  assert.equal(age(ago(120), now), '2 minutes ago');
  assert.equal(age(ago(3 * 3600), now), '3 hours ago');
  assert.equal(age(ago(86_400), now), 'yesterday');
  assert.equal(age(ago(3 * 86_400), now), '3 days ago');
  assert.equal(age(ago(14 * 86_400), now), '2 weeks ago');
  assert.match(age(ago(90 * 86_400), now), /2026|Aug/);
});

test('initial handles spaces, lowercase and empty names', () => {
  assert.equal(initial('  mara okafor'), 'M');
  assert.equal(initial(''), '?');
});
