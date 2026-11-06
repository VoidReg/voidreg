import assert from 'node:assert/strict';
import test from 'node:test';
import { addValue, buildOptions, hasValue, moveActive, normalizeTag, removeValue } from './pickers';

test('tags collapse whitespace and control characters', () => {
  assert.equal(normalizeTag('  Wi-Fi \t  CSI\n'), 'Wi-Fi CSI');
  assert.equal(normalizeTag('   '), '');
});

test('values dedupe case-insensitively, keep the first spelling and respect the limit', () => {
  const one = addValue([], 'Rust');
  assert.deepEqual(addValue(one, 'rust'), ['Rust']);
  assert.equal(addValue(one, 'rust'), one, 'unchanged input is returned as is');
  assert.deepEqual(addValue(one, 'ESP32'), ['Rust', 'ESP32']);
  assert.deepEqual(addValue(['a', 'b'], 'c', 2), ['a', 'b']);
  assert.deepEqual(removeValue(['Rust', 'ESP32'], 'rust'), ['ESP32']);
  assert.equal(hasValue(['Rust'], 'RUST'), true);
});

test('options hide selected items and offer creation only for new text', () => {
  const results = [
    { value: 'Rust', label: 'Rust' },
    { value: 'Rustc', label: 'Rustc' },
    { value: 'Go', label: 'Go' }
  ];
  const create = (raw: string) => normalizeTag(raw);
  assert.deepEqual(
    buildOptions(results, ['Go'], 'rus', create).map((o) => [o.value, Boolean(o.create)]),
    [
      ['rus', true],
      ['Rust', false],
      ['Rustc', false]
    ]
  );
  assert.equal(
    buildOptions(results, [], 'rust', create)[0].create,
    undefined,
    'exact match, no create'
  );
  assert.equal(
    buildOptions(results, ['Rust'], 'RUST', create).length,
    2,
    'already selected: no create'
  );
  assert.equal(buildOptions(results, [], 'zzz').length, 3, 'no create function, no create option');
});

test('arrow movement wraps and handles an empty list', () => {
  assert.equal(moveActive(-1, 1, 3), 0);
  assert.equal(moveActive(-1, -1, 3), 2);
  assert.equal(moveActive(2, 1, 3), 0);
  assert.equal(moveActive(0, -1, 3), 2);
  assert.equal(moveActive(0, 1, 0), -1);
});
