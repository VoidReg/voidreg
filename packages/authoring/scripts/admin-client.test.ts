import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeOrigin } from './admin-client.ts';

test('local origins are allowed', () => {
  for (const origin of ['http://127.0.0.1:5174', 'http://localhost:5174', 'http://[::1]:5174'])
    assert.doesNotThrow(() => assertSafeOrigin(origin, false));
});

test('remote origins need an explicit override', () => {
  assert.throws(() => assertSafeOrigin('https://staging.example.test', false), /Refusing/);
  assert.doesNotThrow(() => assertSafeOrigin('https://staging.example.test', true));
});

test('the production site is always refused', () => {
  for (const origin of [
    'https://www.voidreg.xyz',
    'https://voidreg.xyz',
    'https://admin.voidreg.xyz'
  ])
    assert.throws(() => assertSafeOrigin(origin, true), /production/);
});
